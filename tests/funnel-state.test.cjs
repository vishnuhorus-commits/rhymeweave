'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'horus-funnel-state.js'), 'utf8');

// Native-like prototype only: this fake intentionally does not emulate native
// structured cloning or access the filesystem. Every handle method must stay idle.
let handleCalls = 0;
class DirectoryHandle {
  get kind() { return 'directory'; }
  get [Symbol.toStringTag]() { return 'FileSystemDirectoryHandle'; }
  getDirectoryHandle() { handleCalls++; throw new Error('Forbidden file access'); }
  queryPermission() { handleCalls++; throw new Error('Forbidden permission query'); }
  requestPermission() { handleCalls++; throw new Error('Forbidden permission request'); }
}

function fakeIDB(options = {}) {
  const state = {
    created: Boolean(options.existing),
    schema: Boolean(options.existing && !options.missingSchema),
    value: options.value,
    opens: [], closes: 0, aborts: 0, transactions: [], puts: [], gets: [], creates: []
  };
  const later = setImmediate;
  const scenario = options.scenario;
  const idb = {
    open(name, version) {
      state.opens.push([name, version]);
      if (scenario === 'open-throw') throw new Error('SecurityError');
      const opening = {};
      const db = {
        objectStoreNames: { contains: name => name === 'preferences' && state.schema },
        createObjectStore(name) {
          if (scenario === 'schema-throw') throw new Error('Schema error');
          state.creates.push(name);
          state.schema = true;
        },
        close() { state.closes++; },
        transaction(name, mode) {
          state.transactions.push([name, mode]);
          if (scenario === 'transaction-throw') throw new Error('InvalidStateError');
          let cancelled = false;
          const tx = {
            abort() {
              if (cancelled) return;
              cancelled = true;
              state.aborts++;
              later(() => { if (tx.onabort) tx.onabort({}); });
            },
            objectStore(storeName) {
              assert.equal(storeName, 'preferences');
              function request(operation, value, key) {
                if (scenario === 'request-throw') throw new Error('DataCloneError');
                if (operation === 'put') state.puts.push([value, key]);
                else state.gets.push(key);
                const req = {};
                later(() => {
                  if (cancelled || scenario === 'transaction-hang') return;
                  if (scenario === 'request-error') { req.onerror({}); return; }
                  req.result = operation === 'get' ? state.value : key;
                  if (req.onsuccess) req.onsuccess({});
                  later(() => {
                    if (cancelled) return;
                    if (scenario === 'transaction-abort') { tx.onabort({}); return; }
                    if (scenario === 'transaction-error') { tx.onerror({}); return; }
                    if (operation === 'put') state.value = value;
                    tx.oncomplete({});
                  });
                });
                return req;
              }
              return {
                get: key => request('get', undefined, key),
                put: (value, key) => request('put', value, key)
              };
            }
          };
          return tx;
        }
      };
      if (scenario === 'open-hang') return opening;
      later(() => {
        if (scenario === 'open-error') { opening.onerror({}); return; }
        if (scenario === 'blocked' || scenario === 'blocked-late-success') {
          opening.onblocked({});
          if (scenario === 'blocked-late-success') {
            later(() => { opening.result = db; opening.onsuccess({}); });
          }
          return;
        }
        opening.result = db;
        if (!state.created) {
          let cancelled = false;
          const upgrade = {
            abort() {
              if (cancelled) return;
              cancelled = true;
              state.aborts++;
              later(() => { if (upgrade.onabort) upgrade.onabort({}); });
            }
          };
          opening.transaction = upgrade;
          opening.onupgradeneeded({});
          if (scenario === 'upgrade-abort') { upgrade.onabort({}); return; }
          if (cancelled) { opening.onerror({}); return; }
          state.created = true;
        }
        opening.onsuccess({});
      });
      return opening;
    }
  };
  return { idb, state };
}

function load(idb, overrides = {}) {
  const window = {
    indexedDB: idb,
    FileSystemDirectoryHandle: DirectoryHandle,
    // Use a short real deadline for tests; production remains exactly 3000ms.
    setTimeout(fn, ms) { assert.equal(ms, 3000); return setTimeout(fn, 40); },
    clearTimeout,
    ...overrides
  };
  vm.runInNewContext(source, { window }, { filename: 'horus-funnel-state.js' });
  return { api: window.HorusFunnelState, window };
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Promise hung')), 500); })
    ]);
  } finally { clearTimeout(timer); }
}

test('script is idle, exposes only the immutable API, and cannot be overwritten', () => {
  const { idb, state } = fakeIDB();
  const { api, window } = load(idb);
  assert.deepEqual(Object.keys(api).sort(), ['loadDestination', 'saveDestination']);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.getOwnPropertyDescriptor(window, 'HorusFunnelState').writable, false);
  assert.equal(Object.getOwnPropertyDescriptor(window, 'HorusFunnelState').configurable, false);
  assert.throws(() => { window.HorusFunnelState = {}; }, TypeError);
  assert.deepEqual(state.opens, []);
});

test('explicit save and reload use only the dedicated v1 database/store/key', async () => {
  const { idb, state } = fakeIDB();
  const handle = new DirectoryHandle();
  const first = load(idb).api;
  assert.equal(await first.loadDestination(), null);
  assert.equal(await first.saveDestination(handle), true);
  const reloaded = load(idb).api;
  assert.equal(await reloaded.loadDestination(), handle);
  assert.deepEqual(state.opens, Array(3).fill(['HORUS_SOLAR_FUNNEL_LOCAL_V1', 1]));
  assert.deepEqual(state.creates, ['preferences']);
  assert.deepEqual(state.transactions, [
    ['preferences', 'readonly'], ['preferences', 'readwrite'], ['preferences', 'readonly']
  ]);
  assert.deepEqual(state.puts, [[handle, 'destination']]);
  assert.deepEqual(state.gets, ['destination', 'destination']);
  assert.equal(state.closes, 3);
  assert.equal(handleCalls, 0);
});

test('invalid inputs, plain mocks, files, and throwing getters never open storage', async () => {
  const { idb, state } = fakeIDB();
  const { api } = load(idb);
  const invalid = [null, undefined, {}, { kind: 'directory' },
    { kind: 'directory', getDirectoryHandle() {}, queryPermission() {},
      [Symbol.toStringTag]: 'FileSystemDirectoryHandle' },
    Object.create(null),
    { kind: 'file', getDirectoryHandle() {}, queryPermission() {} },
    new Proxy({}, { get() { throw new Error('Bad getter'); } })];
  for (const value of invalid) assert.equal(await api.saveDestination(value), false);
  assert.deepEqual(state.opens, []);
});

test('invalid deserialized plain object returns null and closes without deleting it', async () => {
  const value = { kind: 'directory', getDirectoryHandle: 'not a function', writing: 'unrelated' };
  const { idb, state } = fakeIDB({ existing: true, value });
  assert.equal(await load(idb).api.loadDestination(), null);
  assert.equal(state.value, value);
  assert.equal(state.closes, 1);
  assert.deepEqual(state.puts, []);
});

test('native-like brand works when constructor is unavailable; unbranded class is rejected', async () => {
  const { idb } = fakeIDB();
  const { api } = load(idb, { FileSystemDirectoryHandle: undefined });
  assert.equal(await api.saveDestination(new DirectoryHandle()), true);
  class Mock { kind = 'directory'; getDirectoryHandle() {} queryPermission() {} }
  assert.equal(await api.saveDestination(new Mock()), false);
  assert.equal(await api.saveDestination({
    kind: 'directory', getDirectoryHandle() {}, queryPermission() {},
    [Symbol.toStringTag]: 'FileSystemDirectoryHandle'
  }), false);
});

test('unavailable or private-mode IndexedDB returns null/false', async () => {
  for (const idb of [undefined, null, {}, { open() { throw new Error('SecurityError'); } }]) {
    const { api } = load(idb);
    assert.equal(await bounded(api.loadDestination()), null);
    assert.equal(await bounded(api.saveDestination(new DirectoryHandle())), false);
  }
});

test('throwing IndexedDB property is caught', async () => {
  const { api, window } = load(undefined);
  Object.defineProperty(window, 'indexedDB', { get() { throw new Error('SecurityError'); } });
  assert.equal(await api.loadDestination(), null);
  assert.equal(await api.saveDestination(new DirectoryHandle()), false);
});

for (const scenario of [
  'open-error', 'open-throw', 'blocked', 'open-hang', 'schema-throw', 'upgrade-abort',
  'transaction-throw', 'request-throw', 'request-error', 'transaction-abort',
  'transaction-error', 'transaction-hang'
]) {
  test(`${scenario} settles load/save with safe fallbacks`, async () => {
    for (const saving of [false, true]) {
      const { idb, state } = fakeIDB({ scenario });
      const { api } = load(idb);
      assert.equal(await bounded(saving ? api.saveDestination(new DirectoryHandle()) : api.loadDestination()),
        saving ? false : null);
      if (state.transactions.length && scenario !== 'transaction-throw') {
        assert.ok(state.closes >= 1);
      }
      assert.equal(state.value, undefined);
    }
  });
}

test('late success after onblocked closes its connection without transacting', async () => {
  const { idb, state } = fakeIDB({ existing: true, scenario: 'blocked-late-success' });
  assert.equal(await load(idb).api.loadDestination(), null);
  await new Promise(resolve => setImmediate(() => setImmediate(resolve)));
  assert.equal(state.closes, 1);
  assert.deepEqual(state.transactions, []);
});

test('missing schema in existing v1 fails closed without reset or migration', async () => {
  const { idb, state } = fakeIDB({ existing: true, missingSchema: true });
  const { api } = load(idb);
  assert.equal(await api.loadDestination(), null);
  assert.equal(await api.saveDestination(new DirectoryHandle()), false);
  assert.deepEqual(state.creates, []);
  assert.deepEqual(state.transactions, []);
  assert.equal(state.closes, 2);
});

test('no directory or permission methods were ever invoked', () => {
  assert.equal(handleCalls, 0);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../horus-funnel-core.js');

// Fixture heuristics matching the Command Center's consonant code conventions.
// The engine must use injected functions; these are not a dictionary or gate.
function head(w) {
  const t = w.slice(0, 2), th = w.slice(0, 3);
  if (['KN', 'GN', 'PN', 'MN'].includes(t)) return 'N';
  if (t === 'WR') return 'R';
  if (t === 'PS' || t === 'PT') return 'S';
  if (th === 'SCH') return 'SK';
  if (t === 'PH') return 'F';
  if (t === 'TH' || t === 'SH' || t === 'CH') return t;
  if (t === 'WH') return 'W';
  if (t === 'QU') return 'K';
  if (t === 'SC') return 'EIY'.includes(w[2]) ? 'S' : 'SK';
  if (w[0] === 'C') return 'EIY'.includes(w[1]) ? 'S' : 'K';
  if (w[0] === 'G') return 'EIY'.includes(w[1]) && w !== 'GET' ? 'J' : 'G';
  if (w[0] === 'X') return 'Z';
  return 'AEIOU'.includes(w[0]) ? 'VOWEL' : w[0];
}
function skel(w) {
  return w.replace(/^KN|^GN|^PN|^MN/, 'N').replace(/^WR/, 'R').replace(/^PS|^PT/, 'S')
    .replace(/TH/g, '8').replace(/SH/g, '7').replace(/CH/g, '6').replace(/NG/g, '5').replace(/PH/g, 'F')
    .replace(/CK/g, 'K').replace(/QU/g, 'KW').replace(/X/g, 'KS').replace(/GH/g, '')
    .replace(/SC([EIY])/g, 'S$1').replace(/C([EIY])/g, 'S$1').replace(/C/g, 'K')
    .replace(/G([EIY])/g, 'J$1').replace(/[AEIOUYWH']/g, '').replace(/(.)\1+/g, '$1');
}
const pretty = s => s.replace(/8/g, 'TH').replace(/7/g, 'SH').replace(/6/g, 'CH').replace(/5/g, 'NG');
const record = (text, source = 'fixture.txt', line = 1) => ({ text, source, line });
const plan = (records, options = {}) => core.planExport({ records, batchId: 'fixture-20261106-001', head, skel, pretty, ...options });
const ofKind = (result, kind) => result.entries.filter(entry => entry.kind === kind);
const lines = entry => entry.data.slice(0, -1).split('\n');
const azTexts = result => ofKind(result, 'az').flatMap(lines);
const reviewText = result => ofKind(result, 'review').map(entry => entry.data).join('');
const outputBytes = result => result.entries.reduce((total, entry) => total + (typeof entry.data === 'string' ? Buffer.byteLength(entry.data) : entry.data.byteLength), 0);

function assertLinksResolve(result) {
  const generatedFiles = new Set(result.entries.map(entry => entry.path));
  const generatedDirectories = new Set();
  for (const entry of result.entries) {
    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i++) generatedDirectories.add(parts.slice(0, i).join('/'));
  }
  const html = result.entries.find(entry => entry.path === result.indexPath).data;
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  assert.ok(hrefs.length > result.entries.length);
  for (const href of hrefs) {
    assert.doesNotMatch(href, /^(?:[a-z]+:|\/\/|\/)/i, `not a relative href: ${href}`);
    const decoded = decodeURIComponent(href);
    const resolved = path.posix.normalize(path.posix.join(result.runPath, decoded)).replace(/\/$/, '');
    assert.ok(generatedFiles.has(resolved) || generatedDirectories.has(resolved), `missing generated link target: ${href} -> ${resolved}`);
  }
  assert.doesNotMatch(html, /<script\b|<iframe\b|<img\b|<base\b|\son\w+\s*=/i);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:|javascript:|data:)/i);
  return { html, hrefs };
}

test('exports the same pure API for CommonJS and the browser global', () => {
  assert.strictEqual(globalThis.HorusFunnelCore, core);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../horus-funnel-core.js'), 'utf8'), context);
  assert.equal(typeof context.HorusFunnelCore.planExport, 'function');
  const result = context.HorusFunnelCore.planExport({ records: [record('Saint sent.')], batchId: 'browser-fixture', head, skel, pretty });
  assert.equal(result.summary.uniqueRecords, 1);
  assert.ok(result.entries.some(entry => entry.path === 'A-Z/S/browser-fixture_S_001.txt'));
  const mapped = context.HorusFunnelCore.planExport({ records: [record('Saint sent.')], batchId: 'browser-fixture', head, skel, pretty, letterDirs: { S: '19_S' } });
  assert.ok(mapped.entries.some(entry => entry.path === '19_S/browser-fixture_S_001.txt'));
  assertLinksResolve(mapped);
});

test('A-Z preserves complete lines, case, punctuation, and surrounding whitespace while sorting', () => {
  const result = plan([
    record('banana!', 'b.txt', 4), record('  Apple, with PUNCTUATION!?  ', 'a.txt', 9),
    record('apricot — a Finished line.', 'a.txt', 10), record('\tAvocado; another complete line.\t'),
    record('99 — zebra.'), record('"Élan, intact."'), record('Łódź is intact.'), record('Æther stays whole.')
  ]);
  const apple = result.entries.find(entry => entry.path.endsWith('_A_001.txt'));
  assert.deepEqual(lines(apple), ['Æther stays whole.', '  Apple, with PUNCTUATION!?  ', 'apricot — a Finished line.', '\tAvocado; another complete line.\t']);
  assert.equal(result.manifest.records[4].letter, 'Z');
  assert.equal(result.manifest.records[5].letter, 'E');
  assert.equal(result.manifest.records[6].letter, 'L');
  assert.ok(azTexts(result).includes('"Élan, intact."'));
  assert.equal(result.summary.uniqueRecords, 8);
  for (const input of result.manifest.records) {
    assert.ok(lines(result.entries.find(entry => entry.path === input.azPath)).includes(input.text));
  }
});

test('empty letterBase files directly into existing A/B/etc foundation folders', () => {
  const result = plan([record('Apple'), record('Banana')], { letterBase: '' });
  assert.ok(result.entries.some(entry => entry.path === 'A/fixture-20261106-001_A_001.txt'));
  assert.ok(result.entries.some(entry => entry.path === 'B/fixture-20261106-001_B_001.txt'));
  assert.ok(result.entries.every(entry => !entry.path.startsWith('A-Z/')));
  assert.ok(assertLinksResolve(result).hrefs.some(href => href.startsWith('../../A/')));
});

test('numbered letterDirs reuse actual A-Z folders with chunked records, duplicates, and provenance', () => {
  const letterDirs = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter, i) => [letter, `${String(i + 1).padStart(2, '0')}_${letter}`]));
  letterDirs._ = '27_Unsorted';
  const inputs = [
    record('  Apple, intact!  ', 'A-Z/source A Apple.txt', 3), record('Avocado'),
    record('Banana'), record('Zebra'), record('123 ???'),
    record('APPLE, INTACT!', 'B/source Z Apple.txt', 19)
  ];
  const originals = [{ name: 'A-Z Apple Banana Zebra.txt', data: 'A, B and Z stay unchanged.' }];
  const result = plan(inputs, { letterBase: '', letterDirs, chunkLines: 1, originals });
  const baseline = plan(inputs, { letterBase: '', chunkLines: 1, originals });
  const az = result.groups.filter(group => group.type === 'az');
  assert.deepEqual(az.map(group => [group.letter, group.path]), [['A', '01_A'], ['B', '02_B'], ['Z', '26_Z'], ['_', '27_Unsorted']]);
  assert.equal(az[0].files.length, 2);
  for (const group of az) {
    assert.ok(group.files.every(file => file.startsWith(group.path + '/')));
    assert.ok(group.files.every(file => result.entries.some(entry => entry.kind === 'az' && entry.path === file)));
  }
  assert.ok(ofKind(result, 'az').every(entry => !/^(?:A-Z|[A-Z_])\//.test(entry.path)));
  assert.deepEqual(azTexts(result), azTexts(baseline));
  assert.deepEqual(ofKind(result, 'family'), ofKind(baseline, 'family'));
  assert.deepEqual(ofKind(result, 'original'), ofKind(baseline, 'original'));
  assert.deepEqual(result.manifest.records.map(item => item.source), inputs.map(item => item.source));
  for (const item of result.manifest.records) {
    assert.ok(item.azPath.startsWith(letterDirs[item.letter] + '/'));
    assert.ok(result.entries.some(entry => entry.path === item.azPath));
  }
  assert.equal(result.manifest.records[5].azPath, result.manifest.records[0].azPath);
  assert.match(reviewText(result), /A-Z copy="01_A\//);
  const savedManifest = JSON.parse(ofKind(result, 'manifest')[0].data);
  assert.deepEqual(savedManifest.summary.letterDirs, letterDirs);
  assert.deepEqual(savedManifest.groups, result.groups);
  assert.deepEqual(savedManifest.outputs.map(item => item.path), result.entries.map(entry => entry.path));
  const provenance = ofKind(result, 'provenance').flatMap(lines).map(JSON.parse).filter(item => item.inputType === 'record');
  assert.deepEqual(provenance.map(item => item.azPath), result.manifest.records.map(item => item.azPath));
  assert.equal(result.summary.maxOutputBytes, 220 * 1024 * 1024);
  assert.ok(outputBytes(result) <= result.summary.maxOutputBytes);
  const { hrefs } = assertLinksResolve(result);
  for (const directory of ['01_A', '02_B', '26_Z', '27_Unsorted']) {
    assert.ok(hrefs.some(href => href.startsWith(`../../${directory}/`)));
  }
});

test('partial letterDirs override from the export root and missing letters retain letterBase fallback', () => {
  for (const letterBase of [undefined, '', 'Existing\\Plain']) {
    const result = plan([record('Apple'), record('Banana'), record('123!')], {
      letterBase, letterDirs: { A: 'Nested\\01_A' }
    });
    const base = letterBase === undefined ? 'A-Z' : letterBase.replace(/\\/g, '/');
    const prefix = base ? base + '/' : '';
    assert.deepEqual(result.groups.filter(group => group.type === 'az').map(group => group.path), ['Nested/01_A', prefix + 'B', prefix + '_']);
    assert.equal(result.summary.letterBase, base);
    assert.deepEqual(result.manifest.summary.letterDirs, { A: 'Nested/01_A' });
    assertLinksResolve(result);
  }
  const defaultResult = plan([record('Apple'), record('Banana')]);
  assert.deepEqual(plan([record('Apple'), record('Banana')], { letterDirs: undefined }), defaultResult);
  assert.ok(!Object.hasOwn(defaultResult.summary, 'letterDirs'));
});

test('letterDirs reject malformed maps, invalid keys, unsafe paths, and Windows invalid names even if unused', () => {
  for (const letterDirs of [null, [], '01_A', 1, true, () => {}, new Map(), new Set(), new Date()]) {
    assert.throws(() => plan([], { letterDirs }), /letterDirs.*object/i);
  }
  for (const key of ['a', 'AA', 'A/B', 'A\n', '_\r', '1', '', '__proto__', 'constructor', 'prototype']) {
    assert.throws(() => plan([], { letterDirs: { [key]: '01_A' } }), /letterDirs key/i);
  }
  assert.throws(() => plan([], { letterDirs: { [Symbol('A')]: '01_A' } }), /letterDirs key/i);
  assert.throws(() => plan([], { letterDirs: Object.defineProperty({}, 'a', { value: '01_A' }) }), /letterDirs key/i);
  assert.throws(() => plan([], { letterDirs: Object.create({ A: '01_A' }) }), /own mapping keys/i);
  for (const unsafe of [
    '', ' ', null, undefined, 1, {}, '/absolute', '\\absolute', 'D:\\01_A', 'C:01_A', '\\\\server\\share',
    '../escape', 'safe/../escape', 'safe\\..\\escape', './01_A', 'safe//01_A', 'safe/', 'safe\\\\01_A',
    'bad\0name', 'bad\u202ename', '<bad>', 'bad?', 'bad*', 'bad|name', 'bad:name', 'bad"name',
    'trailing.', 'trailing ', 'CON', 'con.txt', 'NUL', 'AUX', 'PRN', 'COM1', 'LPT9',
    'COM¹.txt', 'LPT².log', 'CON .txt', 'CLOCK$', 'CONIN$', 'CONOUT$', 'x'.repeat(256)
  ]) {
    assert.throws(() => plan([], { letterDirs: { Z: unsafe } }), /unsafe|reserved|255/i, `must reject mapping ${JSON.stringify(unsafe)}`);
  }
});

test('letterDirs reject Windows-equivalent and fallback directory collisions before unused groups can hide them', () => {
  for (const letterDirs of [
    { A: 'same', B: 'same' }, { A: 'Letters/01_A', Z: 'letters/01_a' },
    { A: 'nested\\same', B: 'nested/same' }, { A: 'café', B: 'cafe\u0301' },
    { A: 'A-Z/B' }, { _: 'A-Z/Z' }
  ]) {
    assert.throws(() => plan([], { letterDirs }), /directory collision/i);
  }
  assert.throws(() => plan([], { letterBase: '', letterDirs: { A: 'b' } }), /directory collision/i);
  assert.throws(() => plan([], { letterBase: 'Existing', letterDirs: { A: 'existing/Z' } }), /directory collision/i);
  assert.throws(() => plan([record('Apple'), record('Banana')], {
    letterDirs: { A: 'Letters/01_A', B: 'letters/02_B' }
  }), /Output path collision/i);
  assert.throws(() => plan([record('Apple')], {
    letterDirs: { A: 'HORUS_FUNNEL_RUNS/fixture-20261106-001/fixture-20261106-001_INDEX.html' }
  }), /Output path collision/i);
});

test('letterDirs input remains immutable and normalized returned routing metadata is not aliased', () => {
  const letterDirs = Object.freeze(Object.assign(Object.create(null), { A: 'Nested\\01_A', B: '02_B', _: 'Review letters/_' }));
  const inputs = Object.freeze([Object.freeze(record('Apple')), Object.freeze(record('Banana'))]);
  const options = Object.freeze({ records: inputs, batchId: 'immutable-map', head, skel, pretty, letterBase: '', letterDirs });
  const before = JSON.stringify(options);
  const result = core.planExport(options);
  assert.equal(JSON.stringify(options), before);
  assert.notStrictEqual(result.summary.letterDirs, letterDirs);
  assert.deepEqual(result.summary.letterDirs, { A: 'Nested/01_A', B: '02_B', _: 'Review letters/_' });
  result.summary.letterDirs.A = 'returned-plan-only';
  assert.equal(letterDirs.A, 'Nested\\01_A');
  assert.equal(JSON.stringify(options), before);
});

test('mapped plain and nested index links resolve URI-escaped actual paths with exact byte-budget enforcement', () => {
  const options = {
    batchId: "mapped & ' # % é", letterBase: 'Fallback',
    letterDirs: { A: "Existing & ' # % é\\01_A", B: '02_B', _: 'Nested/Unknown' }
  };
  const inputs = [record('Apple'), record('Banana'), record('Zebra'), record('123!')];
  const result = plan(inputs, options);
  const { hrefs } = assertLinksResolve(result);
  assert.ok(hrefs.some(href => href.startsWith('../../Existing%20%26%20%27%20%23%20%25%20%C3%A9/01_A/')));
  assert.ok(hrefs.some(href => href.startsWith('../../02_B/')));
  assert.ok(hrefs.some(href => href.startsWith('../../Nested/Unknown/')));
  assert.ok(hrefs.some(href => href.startsWith('../../Fallback/Z/')));
  let budget = outputBytes(plan(inputs, { ...options, maxOutputBytes: 1000000 }));
  for (let i = 0; i < 3; i++) budget = outputBytes(plan(inputs, { ...options, maxOutputBytes: budget }));
  assert.equal(outputBytes(plan(inputs, { ...options, maxOutputBytes: budget })), budget);
  assert.throws(() => plan(inputs, { ...options, maxOutputBytes: budget - 1 }), /Output byte limit exceeded/);
});

test('each unique non-stopword contributes its own family; complete phrases appear in multiple views only once per view', () => {
  const result = plan([record('Saint sent, cat cat.'), record('Sent softly.')]);
  const saint = result.groups.find(group => group.path === 'PHONETIC_FAMILIES/S/S-N-T');
  const cat = result.groups.find(group => group.path === 'PHONETIC_FAMILIES/K/K-T');
  assert.ok(saint);
  assert.ok(cat);
  assert.equal(saint.count, 2);
  assert.deepEqual(saint.words, ['SAINT', 'SENT']);
  assert.equal(cat.count, 1);
  assert.deepEqual(lines(result.entries.find(entry => entry.path === cat.files[0])), ['Saint sent, cat cat.']);
  assert.equal(result.manifest.records[0].familyPaths.length, 2);
  assert.equal(result.manifest.records[0].families[0].words.length, 1);
  assert.equal(result.summary.familyPlacements, 4);
  assert.match(result.manifest.classification.familyExplanation, /approximate.*not exact pronunciation truth/i);
  assert.doesNotMatch(JSON.stringify(result.groups), /topic|technology|nature|creativity/i);
});

test('multi-character phonetic codes get readable family segments', () => {
  const result = plan([record('Thin ships chat.')]);
  assert.ok(result.groups.some(group => group.path === 'PHONETIC_FAMILIES/TH/TH-N'));
  assert.ok(result.groups.some(group => group.path === 'PHONETIC_FAMILIES/SH/SH-P-S'));
  assert.ok(result.groups.some(group => group.path === 'PHONETIC_FAMILIES/CH/CH-T'));
});

test('stopwords are normalized and excluded without an alliteration or dictionary gate', () => {
  const result = plan([record('The saint and cat.'), record('Nonsensical blorf!'), record('The and a')], { stopWords: ['the', 'AnD', 'A'] });
  assert.equal(result.summary.uniqueRecords, 3);
  assert.deepEqual(result.manifest.records[0].families.map(family => family.words).flat().sort(), ['CAT', 'SAINT']);
  assert.ok(result.manifest.records[1].families.some(family => family.words.includes('BLORF')));
  assert.equal(result.manifest.records[2].families.length, 0);
  assert.ok(azTexts(result).includes('The and a'));
  assert.match(reviewText(result), /no-phonetic-family/);
  assert.equal(plan([record('The saint')], { stopWords: new Set(['THE']) }).manifest.records[0].families.length, 1);
});

test('case/whitespace duplicates retain exact alternate text and every source/line in Review and provenance', () => {
  const inputs = [
    record('Sun sings.', 'first source.txt', 5), record('  SUN\tSINGS.  ', 'second source.txt', 88),
    record('Sun sings!', 'different-punctuation.txt', 9), record('sun sings.', 'third source.txt', 14),
    record(' \t ', 'blank-source.txt', 15)
  ];
  const result = plan(inputs);
  assert.equal(result.summary.inputRecords, 5);
  assert.equal(result.summary.blankRecords, 1);
  assert.equal(result.summary.nonblankRecords, 4);
  assert.equal(result.summary.uniqueRecords, 2);
  assert.equal(result.summary.duplicateRecords, 2);
  assert.deepEqual(azTexts(result).sort(), ['Sun sings!', 'Sun sings.']);
  assert.match(reviewText(result), /second source\.txt.*line=88/);
  assert.ok(reviewText(result).includes(JSON.stringify(inputs[1].text)));
  assert.match(reviewText(result), /third source\.txt/);
  assert.equal(result.manifest.records[1].duplicateOf, 1);
  assert.equal(result.manifest.records[3].duplicateOf, 1);
  assert.equal(result.manifest.records[1].azPath, result.manifest.records[0].azPath);
  assert.deepEqual(result.manifest.records[1].familyPaths, result.manifest.records[0].familyPaths);
  assert.equal(result.manifest.records[4].status, 'blank');
  assert.equal(result.manifest.records[4].text, inputs[4].text);
  const provenance = ofKind(result, 'provenance').flatMap(lines).map(JSON.parse);
  assert.deepEqual(provenance.filter(input => input.inputType === 'record').map(input => ({ text: input.text, source: input.source, line: input.line })), inputs);
  const savedManifest = JSON.parse(ofKind(result, 'manifest')[0].data);
  assert.deepEqual(savedManifest.records, result.manifest.records);
  assert.equal(savedManifest.summary.outputFiles, result.entries.length);
});

test('original same-name, case-equal, and same-basename collisions get distinct safe unchanged copies', () => {
  const originals = [
    { name: 'source.txt', data: 'First original\r\nUnchanged.' },
    { name: 'source.txt', data: 'Second original' },
    { name: 'SOURCE.TXT', data: new Uint8Array([0, 255, 15, 12]) },
    { name: 'folder\\source.txt', data: 'Nested original' }
  ];
  const result = plan([], { originals });
  const copies = ofKind(result, 'original');
  assert.equal(copies.length, 4);
  assert.equal(new Set(copies.map(entry => entry.path.toUpperCase())).size, 4);
  assert.deepEqual(result.manifest.originals.map(original => original.name), originals.map(original => original.name));
  copies.forEach((copy, i) => {
    assert.ok(copy.path.startsWith(result.runPath + '/Originals/'));
    assert.ok(copy.path.split('/').pop().includes(result.batchId));
    assert.deepEqual(copy.data, originals[i].data);
    assert.equal(result.manifest.originals[i].byteLength, typeof originals[i].data === 'string' ? Buffer.byteLength(originals[i].data) : originals[i].data.byteLength);
  });
  assertLinksResolve(result);
});

test('long safe original filenames are shortened only on copies, retaining their supplied names in manifest', () => {
  const name = 'x'.repeat(250) + '.txt';
  const result = plan([], { originals: [{ name, data: 'intact' }] });
  const copy = ofKind(result, 'original')[0];
  assert.ok(copy.path.split('/').pop().length <= 255);
  assert.ok(copy.path.endsWith('.txt'));
  assert.equal(copy.data, 'intact');
  assert.equal(result.manifest.originals[0].name, name);
});

test('sanitation rejects traversal, absolute paths, unsafe empty/null names and Windows device names', () => {
  const unsafePaths = [
    '', ' ', null, undefined, '/absolute.txt', '\\absolute.txt', 'D:\\secret.txt', 'C:drive-relative.txt',
    '\\\\server\\share\\file.txt', '../escape.txt', 'folder/../escape.txt', 'folder\\..\\escape.txt',
    './file.txt', 'a//file.txt', 'a/', 'a\\\\file.txt', 'bad\0name.txt', 'file?.txt',
    'folder/<file>.txt', 'file:stream.txt', 'trailing.txt.', 'trailing.txt ', 'bad\u202ename.txt',
    'CON', 'con.txt', 'PRN.csv', 'aux', 'NUL.log', 'COM1.txt', 'LPT9', 'COM¹.txt',
    'LPT².log', 'CON .txt', 'CLOCK$', 'CONIN$', 'CONOUT$'
  ];
  for (const unsafe of unsafePaths) {
    assert.throws(() => core.validateRelativePath(unsafe), /unsafe|reserved/i, `must reject ${JSON.stringify(unsafe)}`);
    assert.throws(() => plan([], { originals: [{ name: unsafe, data: 'never copied' }] }), /unsafe|reserved/i);
  }
  for (const unsafe of ['../run', '/run', 'D:\\run', 'NUL', '', null]) {
    assert.throws(() => plan([], { batchId: unsafe }), /unsafe|reserved/i);
  }
  for (const unsafe of ['../A-Z', '/A-Z', 'D:\\A-Z', null, 'A-Z//nested']) {
    assert.throws(() => plan([], { letterBase: unsafe }), /unsafe|reserved/i);
  }
  assert.equal(core.validateRelativePath('safe folder\\nested & file#.txt'), 'safe folder/nested & file#.txt');
  assert.equal(core.validateRelativePath('COM10.txt'), 'COM10.txt');
});

test('all generated files have batch-prefixed safe Windows filenames and no generated path collisions', () => {
  const result = plan([record('Thin ships, cats sail.'), record('Apple')], { originals: [{ name: 'file.txt', data: 'hello' }] });
  const keys = new Set();
  for (const entry of result.entries) {
    assert.equal(core.validateRelativePath(entry.path), entry.path);
    assert.ok(entry.path.split('/').pop().includes(result.batchId));
    const key = entry.path.toUpperCase();
    assert.ok(!keys.has(key));
    keys.add(key);
  }
  assert.throws(() => plan([record('Alpha')], { letterBase: 'horus_funnel_runs' }), /collision/i);
  assert.throws(() => plan([record('Alpha')], { head: () => 'CON', skel: () => 'S' }), /reserved/i);
  assert.throws(() => plan([record('Alpha')], { head: () => '../S', skel: () => 'S' }), /unsafe|traversal/i);
  assert.throws(() => plan([record('Alpha')], { pretty: () => '../unsafe' }), /unsafe|traversal/i);
});

test('different raw family keys cannot silently collide after pretty formatting', () => {
  assert.throws(() => plan([record('Cat dog')], {
    head: word => word === 'CAT' ? 'C' : 'D', skel: () => 'T', pretty: () => 'S'
  }), /collision.*family/i);
});

test('unknown/non-Latin/punctuation text and vowel-only text remain intact in A-Z plus Review', () => {
  const result = plan([record('你好 世界！'), record('1234 ???'), record('😀 ---'), record('AEIOU'), record('Ж! alpha')]);
  const unknown = result.entries.find(entry => entry.path.includes('/_/'));
  assert.deepEqual(new Set(lines(unknown)), new Set(['你好 世界！', '1234 ???', '😀 ---']));
  assert.equal(result.summary.unknownLetterRecords, 3);
  assert.equal(result.summary.unclassifiedRecords, 4);
  assert.equal(result.manifest.records[4].letter, 'A');
  assert.ok(azTexts(result).includes('AEIOU'));
  assert.match(reviewText(result), /unknown-letter/);
  assert.match(reviewText(result), /no-phonetic-family/);
});

test('chunking bounds every A-Z/family/review/provenance chunk and assigns real source mappings', () => {
  const inputs = Array.from({ length: 5 }, (_, i) => record(`Saint sent ${5 - i}!`, 'chunker.txt', i + 1));
  const result = plan(inputs, { chunkLines: 2 });
  const az = result.groups.find(group => group.type === 'az');
  const family = result.groups.find(group => group.path === 'PHONETIC_FAMILIES/S/S-N-T');
  assert.equal(az.files.length, 3);
  assert.equal(family.files.length, 3);
  assert.ok(az.files[0].endsWith('_S_001.txt'));
  assert.ok(az.files[2].endsWith('_S_003.txt'));
  assert.ok(family.files[2].endsWith('_003.txt'));
  assert.deepEqual(azTexts(result), ['Saint sent 1!', 'Saint sent 2!', 'Saint sent 3!', 'Saint sent 4!', 'Saint sent 5!']);
  for (const entry of result.entries.filter(entry => ['az', 'family', 'review', 'provenance'].includes(entry.kind))) {
    assert.ok(lines(entry).length <= 2, entry.path);
    assert.ok(entry.data.endsWith('\n'));
  }
  for (const input of result.manifest.records) {
    assert.ok(lines(result.entries.find(entry => entry.path === input.azPath)).includes(input.text));
    for (const familyPath of input.familyPaths) assert.ok(lines(result.entries.find(entry => entry.path === familyPath)).includes(input.text));
  }
  assert.equal(result.summary.outputFiles, result.entries.length);
  assertLinksResolve(result);
});

test('Review and provenance themselves chunk rather than truncating duplicate/blank sources', () => {
  const inputs = [record('Saint sent'), ...Array.from({ length: 5 }, (_, i) => record('SAINT SENT', 'duplicates.txt', i + 10)), record(' ', 'blank.txt', 1)];
  const result = plan(inputs, { chunkLines: 2 });
  assert.equal(ofKind(result, 'review').length, 3);
  assert.equal(ofKind(result, 'provenance').length, 4);
  assert.equal(result.manifest.records.length, 7);
  assert.equal(result.summary.duplicateRecords, 5);
  assert.equal(result.summary.reviewRecords, 5);
});

test('record and generated-output-file limits throw instead of silently truncating', () => {
  const inputs = [record('Saint sent'), record('Sent softly'), record('Cat dog')];
  assert.throws(() => plan(inputs, { maxRecords: 2 }), /Record limit exceeded.*maxRecords=2/);
  assert.throws(() => plan([record(' '), record('')], { maxRecords: 1 }), /Record limit exceeded/);
  assert.throws(() => plan(inputs, { maxOutputFiles: 5 }), /Output file limit exceeded/);
  const full = plan(inputs, { chunkLines: 1 });
  assert.throws(() => plan(inputs, { chunkLines: 1, maxOutputFiles: full.entries.length - 1 }), /Output file limit exceeded/);
  assert.equal(plan(inputs, { chunkLines: 1, maxOutputFiles: full.entries.length }).entries.length, full.entries.length);
  assert.throws(() => plan([], { originals: [{ name: 'a.txt', data: 'a' }], maxOutputFiles: 5 }), /Output file limit exceeded/);
  assert.equal(plan([], { maxRecords: 0 }).summary.inputRecords, 0);
});

test('family-link limits are enforced per unique phrase/family placement before output strings', () => {
  assert.throws(() => plan([record('Saint cat')], { maxFamilyLinks: 1 }), /family.*link limit exceeded.*smaller batches/i);
  const result = plan([record('Saint sent saint'), record('SAINT SENT SAINT')], { maxFamilyLinks: 1 });
  assert.equal(result.summary.familyPlacements, 1);
  assert.equal(result.summary.duplicateRecords, 1);
  assert.equal(plan([record('123!')], { maxFamilyLinks: 0 }).summary.familyPlacements, 0);
});

test('very long lines retain full A-Z text and are explicitly family-analysis-skipped in Review', () => {
  const text = 'Saint '.repeat(4000) + 'the complete END!?';
  const result = plan([record(text, 'long-line.txt', 42)], { head: () => { throw new Error('must not analyze a long line'); } });
  assert.deepEqual(azTexts(result), [text]);
  assert.equal(result.summary.familyPlacements, 0);
  assert.equal(result.summary.familyAnalysisSkippedRecords, 1);
  assert.equal(result.manifest.records[0].familyAnalysis, 'skipped-long-line');
  assert.match(reviewText(result), /family-analysis-skipped.*long-line\.txt.*line=42/);
  assert.ok(reviewText(result).includes(JSON.stringify(text)));
});

test('a high unique-word count skips family expansion but preserves the whole line', () => {
  const text = 'alpha bravo charlie delta';
  const result = plan([record(text)], { maxFamilyWordsPerRecord: 3, head: () => { throw new Error('must not analyze an over-limit word set'); } });
  assert.deepEqual(azTexts(result), [text]);
  assert.equal(result.manifest.records[0].familyAnalysis, 'skipped-word-limit');
  assert.equal(result.summary.familyAnalysisSkippedRecords, 1);
  assert.match(reviewText(result), /family-analysis-skipped/);
});

test('output byte limits include original copies, family amplification, provenance, manifest, and index', () => {
  const inputs = [record('Saint sent, cat dog!'), record('  SAINT SENT, CAT DOG!  ', 'alternate.txt', 99), record('你好 “world” 😀\t')];
  const originals = [{ name: 'input.txt', data: new Uint8Array([0, 255, 1]) }];
  const full = plan(inputs, { originals });
  const bytes = outputBytes(full);
  assert.throws(() => plan(inputs, { originals, maxOutputBytes: 100 }), /Output byte limit exceeded.*smaller batches/i);
  assert.throws(() => plan(inputs, { originals, maxOutputBytes: bytes - 1000 }), /Output byte limit exceeded.*smaller batches/i);
  assert.throws(() => plan([], { originals: [{ name: 'big.txt', data: new Uint8Array(3000) }], maxOutputBytes: 1000 }), /Output byte limit exceeded/);
  const smallerLimit = plan(inputs, { originals, maxOutputBytes: bytes + 5000 });
  assert.ok(outputBytes(smallerLimit) <= bytes + 5000);
  const loudLine = 'Saint cat dog thin ship bird tree '.repeat(100);
  assert.throws(() => plan([record(loudLine)], { maxOutputBytes: 15000 }), /Output byte limit exceeded/);
});

test('exact UTF-8 output-byte boundary accounts for JSON escapes and index bytes without off-by-one errors', () => {
  const inputs = [record('Saint\t“cat” 😀 \u0000 \u0008 \\ \ud800!', 'source \u0000 \u0008 \\ " 😀.txt', 77)];
  let budget = outputBytes(plan(inputs, { maxOutputBytes: 1000000 }));
  // The configured budget is itself printed in the outputs; settle its digit width.
  for (let i = 0; i < 3; i++) budget = outputBytes(plan(inputs, { maxOutputBytes: budget }));
  assert.equal(outputBytes(plan(inputs, { maxOutputBytes: budget })), budget);
  assert.throws(() => plan(inputs, { maxOutputBytes: budget - 1 }), /Output byte limit exceeded/);
});

test('saved index resolves actual URI/HTML-escaped files and directories from the per-run directory', () => {
  const result = plan([record('Saint sent.'), record('Alpha')], {
    batchId: "run & ' # % é", letterBase: 'A-Z & letters',
    originals: [{ name: "notes & ' # % é.txt", data: '<script>must remain inert</script>' }]
  });
  const { html, hrefs } = assertLinksResolve(result);
  assert.ok(hrefs.some(href => href.startsWith('../../A-Z%20%26%20letters/')));
  assert.ok(hrefs.some(href => href.includes('%27') && href.includes('%23') && href.includes('%25') && href.includes('%C3%A9')));
  assert.match(html, /run &amp; &#39; # % é/);
  assert.doesNotMatch(html, /<script>must remain inert/);
  assert.match(html, /default-src &#39;none&#39;/);
  assert.equal(core.relativeHref(result.runPath, 'A-Z/A/file.txt'), '../../A-Z/A/file.txt');
});

test('original records, options, original contents, and byte arrays are never mutated or aliased', () => {
  const rawBytes = new Uint8Array([0, 255, 42, 10]);
  const inputs = Object.freeze([Object.freeze(record('Saint sent.')), Object.freeze(record(' SAINT SENT. ', 'copy.txt', 5))]);
  const originals = Object.freeze([Object.freeze({ name: 'raw.bin', data: rawBytes }), Object.freeze({ name: 'writing.txt', data: 'Original\r\n  text!  ' })]);
  const options = Object.freeze({ records: inputs, originals, batchId: 'immutable-fixture', head, skel, pretty, stopWords: Object.freeze(['the']) });
  const beforeInputs = JSON.stringify(inputs), beforeBytes = [...rawBytes], beforeOriginalText = originals[1].data;
  const result = core.planExport(options);
  assert.equal(JSON.stringify(inputs), beforeInputs);
  assert.deepEqual([...rawBytes], beforeBytes);
  assert.equal(originals[1].data, beforeOriginalText);
  const copiedBytes = ofKind(result, 'original')[0].data;
  assert.notStrictEqual(copiedBytes, rawBytes);
  copiedBytes[0] = 99;
  assert.deepEqual([...rawBytes], beforeBytes);
  result.manifest.records[0].text = 'Only the returned plan was edited';
  assert.equal(JSON.stringify(inputs), beforeInputs);
});

test('empty intake produces truthful readable run reports and a fully linked index', () => {
  const result = plan([]);
  assert.equal(result.summary.inputRecords, 0);
  assert.equal(result.summary.uniqueRecords, 0);
  assert.equal(result.summary.familyPlacements, 0);
  assert.equal(result.entries.length, 5);
  assert.match(ofKind(result, 'summary')[0].data, /Input records: 0/);
  assert.match(ofKind(result, 'review')[0].data, /No duplicate or unclassified records/);
  assert.equal(JSON.parse(lines(ofKind(result, 'provenance')[0])[0]).inputType, 'run');
  assertLinksResolve(result);
});

test('invalid options and multiline records give explicit errors, never partial exports', () => {
  assert.throws(() => core.planExport(), /options object/);
  assert.throws(() => plan(null), /records must be an array/);
  assert.throws(() => plan([], { originals: null }), /originals must be an array/);
  assert.throws(() => plan(new Array(2)), /dense array/i);
  assert.throws(() => plan([], { originals: new Array(2) }), /dense array/i);
  assert.throws(() => plan([record('First line\nSecond line')]), /one complete line.*split/i);
  assert.throws(() => plan([record('First line\rSecond line')]), /one complete line/i);
  assert.throws(() => plan([{ text: 'Hello', source: 'a.txt', line: 0 }]), /line must be a positive/);
  assert.throws(() => plan([{ text: 'Hello' }]), /string text and source/);
  assert.throws(() => plan([{ text: 12, source: 'a.txt' }]), /string text and source/);
  assert.throws(() => plan([], { head: null }), /injected heuristic functions/);
  assert.throws(() => plan([], { stopWords: 'the' }), /stopWords must be an array or Set/);
  assert.throws(() => plan([], { stopWords: ['two words'] }), /exactly one word/);
  assert.throws(() => plan([], { originals: [{ name: 'data.txt', data: {} }] }), /string or Uint8Array/);
  for (const [option, value] of [['chunkLines', 0], ['chunkLines', 1.5], ['maxRecords', -1], ['maxOutputFiles', 0], ['maxFamilyLinks', -1], ['maxOutputBytes', 0], ['maxFamilyLineChars', 0], ['maxFamilyWordsPerRecord', 0]]) {
    assert.throws(() => plan([], { [option]: value }), /safe integer/);
  }
});

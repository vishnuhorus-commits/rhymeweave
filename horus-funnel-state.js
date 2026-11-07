/*
 * Opt-in destination-handle persistence only. Loading this script performs no I/O.
 * The caller must pass an explicitly user-chosen directory handle to saveDestination.
 * Permission checks, reconnect UI, and all file operations belong to the caller.
 * This module never stores writing, credentials, or other application state.
 */
(function (global) {
  'use strict';

  const DATABASE = 'HORUS_SOLAR_FUNNEL_LOCAL_V1';
  const VERSION = 1;
  const STORE = 'preferences';
  const KEY = 'destination';
  const TIMEOUT_MS = 3000;

  function isDirectoryHandle(handle) {
    try {
      if (!handle || typeof handle !== 'object' || handle.kind !== 'directory' ||
          typeof handle.getDirectoryHandle !== 'function' ||
          typeof handle.queryPermission !== 'function') {
        return false;
      }
      // Structured-cloned native handles retain their native prototype/brand;
      // JSON/plain mock objects do not. Do not invoke any handle methods here.
      const prototype = Object.getPrototypeOf(handle);
      if (!prototype || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null ||
          Object.prototype.toString.call(handle) !== '[object FileSystemDirectoryHandle]') {
        return false;
      }
      const Constructor = global.FileSystemDirectoryHandle;
      return typeof Constructor !== 'function' || handle instanceof Constructor;
    } catch (_) {
      return false;
    }
  }

  function transact(mode, handle) {
    const failure = mode === 'readwrite' ? false : null;
    return new Promise(function (resolve) {
      let database = null;
      let transaction = null;
      let opening = null;
      let finished = false;
      let destination = null;
      const timer = global.setTimeout(function () {
        finish(failure, true);
      }, TIMEOUT_MS);

      function close(connection) {
        if (connection) {
          try { connection.close(); } catch (_) { /* Best-effort cleanup. */ }
        }
      }

      function abort(active) {
        if (active) {
          try { active.abort(); } catch (_) { /* May already be finished. */ }
        }
      }

      function finish(result, cancel) {
        if (finished) return;
        finished = true;
        global.clearTimeout(timer);
        if (cancel) abort(transaction);
        close(database);
        resolve(result);
      }

      try {
        const indexedDB = global.indexedDB;
        if (!indexedDB || typeof indexedDB.open !== 'function') {
          finish(failure, true);
          return;
        }
        opening = indexedDB.open(DATABASE, VERSION);
        opening.onerror = function () { finish(failure, true); };
        opening.onblocked = function () { finish(failure, true); };
        opening.onupgradeneeded = function () {
          // An open request cannot be cancelled. If it arrives after our deadline
          // or onblocked, abort its upgrade rather than doing late schema work.
          if (finished) {
            try { abort(opening.transaction); close(opening.result); } catch (_) {}
            return;
          }
          try {
            database = opening.result;
            transaction = opening.transaction;
            transaction.onabort = function () { finish(failure, true); };
            transaction.onerror = function () { finish(failure, true); };
            if (!database.objectStoreNames.contains(STORE)) {
              database.createObjectStore(STORE);
            }
          } catch (_) {
            finish(failure, true);
          }
        };
        opening.onsuccess = function () {
          let connection;
          try {
            connection = opening.result;
            if (finished) {
              close(connection);
              return;
            }
            database = connection;
            database.onversionchange = function () { finish(failure, true); close(database); };
            // A malformed existing v1 database cannot be repaired at v1 without
            // deleting it. Fail closed; never delete, reset, or upgrade to v2.
            if (!database.objectStoreNames.contains(STORE)) {
              finish(failure, true);
              return;
            }
            transaction = database.transaction(STORE, mode);
            transaction.onabort = function () { finish(failure, true); };
            transaction.onerror = function () { finish(failure, true); };
            transaction.oncomplete = function () {
              finish(mode === 'readwrite' ? true : destination, false);
            };
            const store = transaction.objectStore(STORE);
            const request = mode === 'readwrite'
              ? store.put(handle, KEY)
              : store.get(KEY);
            request.onerror = function () { finish(failure, true); };
            if (mode === 'readonly') {
              request.onsuccess = function () {
                if (finished) return;
                try {
                  destination = isDirectoryHandle(request.result) ? request.result : null;
                } catch (_) {
                  finish(failure, true);
                }
              };
            }
          } catch (_) {
            close(connection);
            finish(failure, true);
          }
        };
      } catch (_) {
        finish(failure, true);
      }
    });
  }

  const api = Object.freeze({
    async loadDestination() {
      return transact('readonly');
    },
    async saveDestination(handle) {
      if (!isDirectoryHandle(handle)) return false;
      return transact('readwrite', handle);
    }
  });

  Object.defineProperty(global, 'HorusFunnelState', {
    value: api,
    enumerable: true,
    configurable: false,
    writable: false
  });
})(window);

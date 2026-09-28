/* Service Log (V 1.1): per-machine record of work done. Stored on this device in IndexedDB.
   Deliberately NO reminders / schedules / "due" logic (Nestor owns that). */
(function (w) {
  'use strict';
  var DB = 'fmb-servicelog', STORE = 'entries', dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!w.indexedDB) return rej(new Error('IndexedDB unavailable'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () {
        var s = r.result.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('machine', 'machine', { unique: false });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function all() { return tx('readonly', function (s) { return s.getAll(); }); }
  function list(machine) {
    return all().then(function (rows) {
      return rows.filter(function (r) { return !machine || r.machine === machine; })
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || (b.created || 0) - (a.created || 0); });
    });
  }
  function put(e) {
    if (!e.id) e.id = 'sl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    if (!e.created) e.created = Date.now();
    e.updated = Date.now();
    return tx('readwrite', function (s) { s.put(e); }).then(function () { return e; });
  }
  function remove(id) { return tx('readwrite', function (s) { s.delete(id); }); }

  function exportJSON() {
    return all().then(function (rows) {
      return JSON.stringify({ kind: 'fmb-service-log', version: 1, exported: new Date().toISOString(), entries: rows }, null, 2);
    });
  }
  function importJSON(text) {
    var j = JSON.parse(text);
    var rows = Array.isArray(j) ? j : (j.entries || []);
    return rows.reduce(function (p, r) {
      return p.then(function () { if (r && r.machine) return put(r); });
    }, Promise.resolve()).then(function () { return rows.length; });
  }

  /* Downscale a photo to keep storage small (max 1024px JPEG). */
  function photoToDataURL(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(fr.error); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { res(fr.result); };
        img.onload = function () {
          var max = 1024, sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          try { res(c.toDataURL('image/jpeg', 0.8)); } catch (e) { res(fr.result); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  w.FMBServiceLog = { list: list, all: all, put: put, remove: remove, exportJSON: exportJSON, importJSON: importJSON, photoToDataURL: photoToDataURL };
})(window);

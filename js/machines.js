/* Multi-machine loader (V 1.1). Contract: see CONTRACT.md in the repo root. */
(function (w) {
  'use strict';

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) { var e = new Error(url + ' -> ' + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }
  function asList(j, key) {
    if (Array.isArray(j)) return j;
    return (j && (j[key] || j.pages || j.items)) || [];
  }
  function resolveImg(base, img) {
    if (!img) return img;
    if (/^(https?:|data:|\/|data\/)/.test(img)) return img;
    if (/^img\//.test(img)) return base + img;
    return base + 'img/' + img;
  }

  function loadLegacy(m) {
    return getJSON('data/index.json').then(function (idx) {
      var shards = idx.pageShards || [];
      var p = idx.pages && idx.pages.length ? Promise.resolve(idx.pages) :
        Promise.all(shards.map(function (s) { return getJSON(s).then(function (j) { return asList(j, 'pages'); }); }))
          .then(function (arr) { return arr.reduce(function (a, b) { return a.concat(b); }, []); });
      return p.then(function (pages) {
        pages.forEach(function (pg) { pg.machine = m.slug; });
        var parts = (w.FMBParts && w.FMBParts.all ? w.FMBParts.all() : []).filter(function (x) {
          return !x.machine || x.machine === m.legacyId || x.machine === m.slug;
        });
        parts.forEach(function (x) { x.machine = m.slug; });
        m.status = 'ready';
        m.stats = { pages: (idx.stats && (idx.stats.pageCount || idx.stats.pages)) || pages.length };
        return { pages: pages, parts: [] };
      });
    });
  }

  function loadMachine(m) {
    var base = 'data/machines/' + m.slug + '/';
    return getJSON(base + 'manifest.json').then(function (man) {
      m.manifest = man;
      if (man.status === 'soon' || !(man.pageShards || []).length) { m.status = 'soon'; return { pages: [], parts: [] }; }
      if (man.name) m.name = man.name;
      var shardP = Promise.all((man.pageShards || []).map(function (s) {
        return getJSON(base + s).then(function (j) { return asList(j, 'pages'); }).catch(function () { return []; });
      }));
      var partsP = man.parts ? getJSON(base + man.parts).then(function (j) { return asList(j, 'parts'); }).catch(function () { return []; }) : Promise.resolve([]);
      var refsP = man.refs ? getJSON(base + man.refs).then(function (j) { return asList(j, 'refs'); }).catch(function () { return []; }) : Promise.resolve([]);
      return Promise.all([shardP, partsP, refsP]).then(function (r) {
        var pages = r[0].reduce(function (a, b) { return a.concat(b); }, []);
        var refs = r[2];
        pages.concat(refs).forEach(function (pg) {
          pg.machine = m.slug;
          if (pg.image) pg.image = resolveImg(base, pg.image);
          if (pg.full) pg.full = resolveImg(base, pg.full);
          if (!pg.type) pg.type = 'manual-page';
        });
        refs.forEach(function (pg) { if (String(pg.type).indexOf('reference') !== 0) pg.type = 'reference'; });
        r[1].forEach(function (x) { x.machine = m.slug; });
        m.status = 'ready';
        m.stats = { pages: pages.length, refs: refs.length, parts: r[1].length };
        return { pages: pages.concat(refs), parts: r[1] };
      });
    }).catch(function () {
      m.status = 'soon';
      return { pages: [], parts: [] };
    });
  }

  function loadAll() {
    return getJSON('data/machines.json').catch(function () {
      return { machines: [{ slug: 'mf-135', name: 'Massey Ferguson 135', short: 'MF 135', legacy: true, legacyId: 'mf135' }] };
    }).then(function (reg) {
      var machines = reg.machines || [];
      return Promise.all(machines.map(function (m) {
        return (m.legacy ? loadLegacy(m) : loadMachine(m)).catch(function () { m.status = 'soon'; return { pages: [], parts: [] }; });
      })).then(function (res) {
        var pages = [], parts = [];
        res.forEach(function (r) { pages = pages.concat(r.pages); parts = parts.concat(r.parts); });
        if (parts.length && w.FMBParts && w.FMBParts.add) w.FMBParts.add(parts);
        return { machines: machines, pages: pages };
      });
    });
  }

  function legacyToSlug(id, machines) {
    var m = (machines || []).find(function (x) { return x.legacyId === id; });
    return m ? m.slug : id;
  }

  w.FMBMachines = { loadAll: loadAll, legacyToSlug: legacyToSlug, resolveImg: resolveImg };
})(window);

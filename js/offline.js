/* Offline diagram packs (V 1.2): per-machine "Download all diagrams" into the image cache. */
(function (w) {
  'use strict';
  var IMG_CACHE = w.FMB_IMG_CACHE || 'fmb-full-v1';
  var running = {};

  function base(m) { return m.legacy ? 'data/img/' : 'data/machines/' + m.slug + '/img/'; }
  function abs(u) { return new URL(u, location.href).href; }
  function mb(b) { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }

  function info(m) {
    return fetch(base(m) + 'full/index.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('no index');
      return r.json();
    }).then(function (j) {
      var b = base(m), urls = [], bytes = 0;
      (j.files || []).forEach(function (f) {
        urls.push(abs(b + f[0])); bytes += f[1] || 0;
        urls.push(abs(b + f[0].replace(/^full\//, '').replace(/\.(png|webp)$/, '.webp'))); bytes += f[4] || 0;
      });
      return { count: (j.files || []).length, bytes: bytes, urls: urls };
    });
  }
  function cachedCount(urls) {
    if (!w.caches) return Promise.resolve(0);
    return caches.open(IMG_CACHE).then(function (c) {
      return Promise.all(urls.map(function (u) { return c.match(u, { ignoreSearch: true }); }));
    }).then(function (r) { return r.filter(Boolean).length; });
  }
  function download(m, onProgress) {
    if (running[m.slug]) return running[m.slug];
    if (!w.caches) return Promise.reject(new Error('This browser cannot store files offline.'));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    var p = Promise.all([info(m), caches.open(IMG_CACHE)]).then(function (r) {
      var inf = r[0], cache = r[1], i = 0, done = 0, failed = 0, got = 0;
      return Promise.all(inf.urls.map(function (u) { return cache.match(u, { ignoreSearch: true }); })).then(function (hits) {
        var todo = inf.urls.filter(function (u, k) { return !hits[k]; });
        done = inf.urls.length - todo.length;
        onProgress && onProgress(done, inf.urls.length, inf.bytes, 0);
        function worker() {
          if (i >= todo.length) return Promise.resolve();
          var u = todo[i++];
          return fetch(u, { cache: 'no-cache' }).then(function (res) {
            if (!res.ok) throw new Error(res.status);
            got += Number(res.headers.get('content-length')) || 0;
            return cache.put(u, res);
          }).catch(function () { failed++; }).then(function () {
            done++; onProgress && onProgress(done, inf.urls.length, inf.bytes, failed);
            return worker();
          });
        }
        return Promise.all([worker(), worker(), worker(), worker()]).then(function () {
          return { total: inf.urls.length, failed: failed, bytes: inf.bytes };
        });
      });
    });
    running[m.slug] = p;
    var clear = function () { delete running[m.slug]; };
    p.then(clear, clear);
    return p;
  }

  function sectionHtml(machines, esc) {
    var rows = machines.filter(function (m) { return m.status === 'ready'; }).map(function (m) {
      return '<div class="off-row" data-off-row="' + esc(m.slug) + '"><div class="off-head"><b>' + esc(m.short || m.name) +
        '</b><span class="off-meta">Checking\u2026</span></div><div class="off-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>' +
        '<button type="button" class="off-btn" data-offline-dl="' + esc(m.slug) + '">Download all diagrams for offline</button></div>';
    }).join('');
    return '<h3 class="set-h">Offline diagrams</h3><p class="meta">Every diagram you open is kept for offline use. ' +
      'Use these buttons to save a whole machine before heading out to the shop or field.</p>' + rows;
  }
  function setRow(row, done, total, bytes, msg) {
    var pct = total ? Math.round(done * 100 / total) : 0;
    var bar = row.querySelector('.off-bar'), meta = row.querySelector('.off-meta');
    bar.querySelector('i').style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct);
    meta.textContent = msg || (Math.round(total / 2) + ' diagrams \u00b7 ~' + mb(bytes) + ' \u00b7 ' + pct + '% saved');
  }
  function fillSection(box, machines) {
    Array.prototype.forEach.call(box.querySelectorAll('[data-off-row]'), function (row) {
      var m = machines.find(function (x) { return x.slug === row.getAttribute('data-off-row'); });
      info(m).then(function (inf) {
        return cachedCount(inf.urls).then(function (n) {
          setRow(row, n, inf.urls.length, inf.bytes);
          if (n >= inf.urls.length) row.querySelector('.off-btn').textContent = 'Saved \u2713 (tap to re-check)';
        });
      }).catch(function () {
        setRow(row, 0, 0, 0, 'No diagrams to save yet');
        row.querySelector('.off-btn').disabled = true;
      });
    });
  }
  function startFromButton(btn, machines) {
    var slug = btn.getAttribute('data-offline-dl');
    var m = machines.find(function (x) { return x.slug === slug; });
    var row = btn.closest('[data-off-row]');
    if (!m || !row) return;
    btn.disabled = true; btn.textContent = 'Downloading\u2026';
    download(m, function (done, total, bytes, failed) {
      setRow(row, done, total, bytes, 'Saving ' + Math.round(done / 2) + ' / ' + Math.round(total / 2) +
        ' \u00b7 ~' + mb(bytes) + (failed ? ' \u00b7 ' + failed + ' failed' : ''));
    }).then(function (r) {
      btn.disabled = false;
      btn.textContent = r.failed ? 'Retry (' + r.failed + ' failed)' : 'Saved \u2713 (tap to re-check)';
      setRow(row, r.total - r.failed, r.total, r.bytes, r.failed ? r.failed + ' files failed \u2014 check signal and retry'
        : 'All ' + Math.round(r.total / 2) + ' diagrams saved \u00b7 ' + mb(r.bytes));
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Retry download';
      setRow(row, 0, 0, 0, 'Download failed: ' + (e.message || e));
    });
  }

  w.FMBOffline = { info: info, download: download, sectionHtml: sectionHtml, fillSection: fillSection,
    startFromButton: startFromButton, IMG_CACHE: IMG_CACHE };
})(window);

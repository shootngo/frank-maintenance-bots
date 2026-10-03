/* Frank's Maintenance Bots, V 1.2 (multi-machine + Service Log + sharp diagrams) */
(function () {
  'use strict';
  var VERSION = window.FMB_VERSION || 'V 1.2';
  var UI = window.FMBUI;
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    chat: $('chat'), q: $('q'), btnSend: $('btnSend'), btnMic: $('btnMic'), btnMenu: $('btnMenu'),
    menu: $('menu'), machineRow: $('machineRow'), btnSymptom: $('btnSymptom'), btnParts: $('btnParts'),
    overlay: $('overlay'), headerSub: $('headerSub')
  };

  var machines = [];          // registry from data/machines.json (+ status/stats)
  var index = null;           // search index over all loaded machines
  var current = localStorage.getItem('fmb_machine') || 'mf-135';
  if (current === 'mf135') current = 'mf-135';
  var history = [];
  try { history = JSON.parse(localStorage.getItem('fmb_chat') || '[]'); } catch (e) {}
  var causeState = null, recog = null, listening = false, logMachine = null;

  function mById(slug) { return machines.find(function (m) { return m.slug === slug; }); }
  function mLabel(slug) { var m = mById(slug); return m ? (m.short || m.name) : 'All machines'; }
  function saveChat() { try { localStorage.setItem('fmb_chat', JSON.stringify(history.slice(-40))); } catch (e) {} }

  function addBubble(role, html) {
    if (el.chat.querySelector('.empty')) el.chat.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'bubble ' + (role === 'user' ? 'user' : 'bot');
    d.innerHTML = html;
    el.chat.appendChild(d);
    el.chat.scrollTop = el.chat.scrollHeight;
    history.push({ role: role, html: html }); saveChat();
    return d;
  }
  function renderChat() {
    el.chat.innerHTML = '';
    if (!history.length) {
      el.chat.innerHTML = '<div class="empty">Ask about the <b>' + UI.esc(mLabel(current)) +
        '</b> — filters, belts, fluids, noises…<br><br>Tap <b>What\'s wrong?</b> for a symptom walkthrough, or ☰ → <b>Service log</b> to record work.</div>';
      return;
    }
    history.forEach(function (h) {
      var d = document.createElement('div');
      d.className = 'bubble ' + (h.role === 'user' ? 'user' : 'bot');
      d.innerHTML = h.html; el.chat.appendChild(d);
    });
    el.chat.scrollTop = el.chat.scrollHeight;
  }
  function renderMachines() {
    var chips = [{ slug: '', short: 'All', status: 'ready' }].concat(machines);
    el.machineRow.innerHTML = chips.map(function (m) {
      var soon = m.status !== 'ready';
      return '<button type="button" class="chip' + (m.slug === current ? ' active' : '') + '" data-machine="' + UI.esc(m.slug) + '"' +
        (soon ? ' disabled' : '') + '>' + UI.esc(m.short || m.name) + (soon ? ' (soon)' : '') + '</button>';
    }).join('');
  }
  function updateHeader() {
    var ready = machines.filter(function (m) { return m.status === 'ready'; });
    var m = mById(current);
    var txt = 'Shop Q&A · ' + VERSION + ' · ';
    txt += m ? ((m.stats && m.stats.pages) || 0) + ' ' + (m.short || m.name) + ' pages' : ready.length + ' machines';
    if (el.headerSub) el.headerSub.textContent = txt;
  }

  function gather(q) {
    var hits = FMBSearch.search(index, q, { machine: current, limit: 10 });
    if (FMBSearch.DIAGRAM_BOOST && FMBSearch.DIAGRAM_BOOST.test(q)) {
      FMBSearch.search(index, q + ' diagram figure', { machine: current, limit: 8 }).forEach(function (h) {
        if (!hits.find(function (x) { return x.page.id === h.page.id; })) hits.push(h);
      });
    }
    var pages = hits.map(function (h) { return h.page; });
    return {
      hits: hits,
      manuals: pages.filter(function (p) { return p.type === 'manual-page'; }),
      refs: pages.filter(function (p) { return String(p.type || '').indexOf('reference') === 0; }),
      diagrams: pages.filter(function (p) { return p.isDiagram; }).slice(0, 4)
    };
  }

  function ask(text, opts) {
    opts = opts || {};
    var q = String(text || '').trim();
    if (!q) return;
    addBubble('user', UI.esc(q));
    el.q.value = '';
    var bubble = addBubble('bot', '<span class="typing">Looking through manuals…</span>');
    var mode = opts.mode || (FMBSymptoms.isSymptomQuestion(q) ? 'symptom' : (FMBParts.isPartsQuestion(q) ? 'parts' : 'qa'));
    var g = gather(q);
    var parts = (mode === 'parts' || FMBParts.isPartsQuestion(q)) ? FMBParts.find(q, current) : [];
    var mName = current ? (mById(current) || {}).name : 'any of my machines';
    FMBGemini.answer({ question: q, machine: mName, pages: g.manuals.slice(0, 8), refs: g.refs.slice(0, 6), parts: parts, mode: mode })
      .catch(function () { return { ok: false, reason: 'error' }; })
      .then(function (r) {
        r = r || { ok: false };
        var html = '';
        if (mode === 'symptom') {
          var causes = [];
          if (r.ok && r.parsed && Array.isArray(r.parsed.causes)) {
            causes = r.parsed.causes.map(function (c, i) {
              return {
                id: 'c' + i, name: c.name, check: c.check || [], tools: c.tools || 'none', difficulty: c.difficulty || 1,
                cost: c.cost || '', safety: r.parsed.safety || c.safety || '',
                sources: {
                  official: g.manuals.filter(function (p) { return (c.officialPageIds || []).indexOf(p.id) >= 0; }).slice(0, 3),
                  community: g.refs.slice(0, 3)
                }
              };
            });
          }
          if (!causes.length) causes = (current === 'mf-135' || !current) ? FMBSymptoms.fallbackCauses(q, g.hits) : [];
          causeState = { causes: causes, idx: 0 };
          html = '<div class="section"><h3>Symptom check</h3><p>' +
            UI.esc((r.parsed && r.parsed.summary) || (causes.length ? 'Cheapest / most common checks first.' : 'Manual matches below. Add a Gemini key in Settings for a step-by-step walkthrough.')) + '</p>' +
            (r.parsed && r.parsed.safety ? '<div class="safety">⚠ ' + UI.esc(r.parsed.safety) + '</div>' : '') +
            (causes.length ? UI.renderCauseCard(causes, 0) : '') + UI.thumbsHtml(g.diagrams) +
            UI.sourceChips(g.manuals.concat(g.refs), r.grounded || []) + '</div>';
        } else {
          var off = (r.ok && r.parsed && (r.parsed.official || r.parsed.summary)) ||
            (g.manuals[0] ? String(g.manuals[0].text || '').slice(0, 700) + '…' : 'No manual hit — try different words, or add a Gemini key in Settings.');
          var com = (r.ok && r.parsed && r.parsed.community) ||
            (g.refs[0] ? String(g.refs[0].text || g.refs[0].title || '').slice(0, 500) : 'No stored community note matched. Add a Gemini key to search forums live.');
          html = '<div class="section"><h3>' + UI.badge('official') + ' Official (manual)</h3><p>' + UI.esc(off) + '</p>' +
            UI.thumbsHtml(g.diagrams.length ? g.diagrams : g.manuals) + UI.sourceChips(g.manuals, []) + '</div>' +
            '<div class="section"><h3>' + UI.badge('community') + ' From the community</h3><p>' + UI.esc(com) + '</p>' +
            UI.sourceChips(g.refs, r.grounded || []) + '</div>';
          if (r.ok && r.parsed && r.parsed.disagreement) html += '<div class="safety">Manual vs community: ' + UI.esc(r.parsed.disagreement) + '</div>';
          if (parts.length) html += UI.partsHtml(parts);
          if (!r.ok && r.reason === 'no-key') html += '<p class="meta">Search-only mode. ☰ → Settings to paste your Gemini key.</p>';
          else if (!r.ok) html += '<p class="meta">Gemini unavailable (' + UI.esc(r.reason || 'error') + '). Showing search matches.</p>';
        }
        bubble.innerHTML = html;
        history[history.length - 1] = { role: 'bot', html: html }; saveChat();
      });
  }

  /* ---------- overlay sheets ---------- */
  function openSheet(html, cls) {
    el.overlay.classList.remove('hidden');
    el.overlay.innerHTML = '<div class="sheet' + (cls ? ' ' + cls : '') + '">' + html + '</div>';
  }
  function closeSheet() { el.overlay.classList.add('hidden'); el.overlay.innerHTML = ''; }

  function today() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function money(v) { return v == null || v === '' ? '' : '$' + Number(v).toFixed(2); }

  function openLog(slug) {
    logMachine = slug || current || 'mf-135';
    var m = mById(logMachine) || { name: logMachine, meter: 'hours' };
    var opts = machines.map(function (x) {
      return '<option value="' + UI.esc(x.slug) + '"' + (x.slug === logMachine ? ' selected' : '') + '>' + UI.esc(x.name) + '</option>';
    }).join('');
    openSheet('<h2>Service log</h2><label for="slMachine">Machine</label><select id="slMachine">' + opts + '</select>' +
      '<div class="row"><button type="button" data-sl-new>+ Add entry</button><button type="button" data-sl-export>Export</button>' +
      '<button type="button" data-sl-import>Import</button><input type="file" id="slImportFile" accept="application/json,.json" hidden></div>' +
      '<div id="slList" class="sl-list"><p class="meta">Loading…</p></div>' +
      '<p class="meta">Stored on this device only. Export to back up. Reminders/schedules live in Nestor.</p>' +
      '<div class="row"><button type="button" class="primary" data-close>Done</button></div>', 'log');
    FMBServiceLog.list(logMachine).then(function (rows) {
      var box = $('slList'); if (!box) return;
      if (!rows.length) { box.innerHTML = '<p class="meta">No entries yet for ' + UI.esc(m.name) + '.</p>'; return; }
      box.innerHTML = rows.map(function (r) {
        return '<div class="sl-entry"><div class="sl-head"><b>' + UI.esc(r.date) + '</b>' +
          (r.meter != null && r.meter !== '' ? ' · ' + UI.esc(r.meter) + ' ' + UI.esc(r.meterUnit || m.meter || 'hours') : '') +
          (r.cost != null && r.cost !== '' ? ' · ' + money(r.cost) : '') + '</div>' +
          '<div>' + UI.esc(r.done) + '</div>' +
          (r.parts ? '<div class="meta">Parts: ' + UI.esc(r.parts) + '</div>' : '') +
          (r.notes ? '<div class="meta">' + UI.esc(r.notes) + '</div>' : '') +
          (r.photo ? '<button type="button" class="sl-photo" data-lb="' + UI.esc(r.photo) + '"><img src="' + UI.esc(r.photo) + '" alt="Service photo"></button>' : '') +
          '<div class="sl-actions"><button type="button" data-sl-edit="' + UI.esc(r.id) + '">Edit</button>' +
          '<button type="button" data-sl-del="' + UI.esc(r.id) + '">Delete</button></div></div>';
      }).join('');
    }).catch(function (e) { var b = $('slList'); if (b) b.innerHTML = '<p class="meta">Service log unavailable: ' + UI.esc(e.message || e) + '</p>'; });
  }

  function openLogForm(entry) {
    var m = mById(logMachine) || { name: logMachine, meter: 'hours' };
    var e = entry || { machine: logMachine, date: today(), meterUnit: m.meter || 'hours' };
    var unit = e.meterUnit || m.meter || 'hours';
    openSheet('<h2>' + (entry ? 'Edit' : 'New') + ' entry · ' + UI.esc(m.short || m.name) + '</h2>' +
      '<label for="slDate">Date</label><input id="slDate" type="date" value="' + UI.esc(e.date || today()) + '">' +
      '<label for="slMeter">' + (unit === 'miles' ? 'Miles' : 'Hours') + '</label><input id="slMeter" type="number" inputmode="decimal" step="any" value="' + UI.esc(e.meter == null ? '' : e.meter) + '">' +
      '<label for="slDone">What was done</label><textarea id="slDone" rows="3">' + UI.esc(e.done || '') + '</textarea>' +
      '<label for="slParts">Parts used</label><input id="slParts" type="text" value="' + UI.esc(e.parts || '') + '">' +
      '<label for="slCost">Cost ($)</label><input id="slCost" type="number" inputmode="decimal" step="0.01" value="' + UI.esc(e.cost == null ? '' : e.cost) + '">' +
      '<label for="slNotes">Notes</label><textarea id="slNotes" rows="2">' + UI.esc(e.notes || '') + '</textarea>' +
      '<label for="slPhoto">Photo (optional)</label><input id="slPhoto" type="file" accept="image/*">' +
      (e.photo ? '<p class="meta">Current photo kept unless you pick a new one. <label><input type="checkbox" id="slPhotoDel"> remove</label></p>' : '') +
      '<div class="row"><button type="button" data-sl-back>Cancel</button><button type="button" class="primary" data-sl-save>Save</button></div>', 'log');
    el.overlay._editing = e;
    el.overlay._unit = unit;
  }

  function saveLogForm() {
    var e = el.overlay._editing || {};
    var done = ($('slDone').value || '').trim();
    if (!done) { alert('Please fill in "What was done".'); return; }
    var num = function (v) { v = String(v || '').trim(); return v === '' ? null : Number(v); };
    var rec = Object.assign({}, e, {
      machine: logMachine, date: $('slDate').value || today(), meter: num($('slMeter').value), meterUnit: el.overlay._unit,
      done: done, parts: ($('slParts').value || '').trim(), cost: num($('slCost').value), notes: ($('slNotes').value || '').trim()
    });
    var del = $('slPhotoDel');
    if (del && del.checked) rec.photo = null;
    var f = $('slPhoto') && $('slPhoto').files && $('slPhoto').files[0];
    (f ? FMBServiceLog.photoToDataURL(f) : Promise.resolve(rec.photo || null)).then(function (ph) {
      rec.photo = ph;
      return FMBServiceLog.put(rec);
    }).then(function () { openLog(logMachine); }).catch(function (err) { alert('Could not save: ' + (err.message || err)); });
  }

  function exportLog() {
    FMBServiceLog.exportJSON().then(function (txt) {
      var blob = new Blob([txt], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fmb-service-log-' + today() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }

  function checkUpdate() {
    var latest = null;
    var verP = fetch('data/machines.json', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (j) { latest = j.appVersion || null; }).catch(function () {});
    if (!('serviceWorker' in navigator)) {
      verP.then(function () {
        if (latest && latest !== VERSION && confirm('Version ' + latest + ' is available (you have ' + VERSION + '). Reload now?')) location.reload();
        else alert('You are on ' + VERSION);
      });
      return;
    }
    navigator.serviceWorker.getRegistration('./').then(function (reg) {
      return reg || navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    }).then(function (reg) {
      return Promise.all([reg.update().catch(function () {}), verP]).then(function () {
        var nw = reg.installing || reg.waiting;
        if (!nw) return false;
        return new Promise(function (res) {
          if (nw.state === 'activated') return res(true);
          nw.addEventListener('statechange', function () { if (nw.state === 'activated' || nw.state === 'installed') res(true); });
          setTimeout(function () { res(true); }, 8000);
        }).then(function () { if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); return true; });
      });
    }).then(function (found) {
      var newer = latest && latest !== VERSION;
      if (found || newer) {
        if (confirm('New version found' + (latest ? ' (' + latest + ')' : '') + '. Update now?\n\nCurrently ' + VERSION)) {
          setTimeout(function () { location.reload(); }, 300);
        }
        return;
      }
      alert('You are on ' + VERSION + ' — already latest.');
    }).catch(function () { alert('Could not check.\n\nYou are on ' + VERSION + '.'); });
  }

  function bind() {
    renderMachines(); renderChat(); updateHeader();

    el.machineRow.addEventListener('click', function (e) {
      var b = e.target.closest('[data-machine]');
      if (!b || b.disabled) return;
      current = b.getAttribute('data-machine');
      localStorage.setItem('fmb_machine', current);
      renderMachines(); updateHeader();
      if (!history.length) renderChat();
    });
    el.btnSend.addEventListener('click', function () { ask(el.q.value); });
    el.q.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(el.q.value); } });
    el.btnSymptom.addEventListener('click', function () {
      if (current === 'mf-135') ask('Tractor running rough with black smoke — what should I check?', { mode: 'symptom' });
      else { el.q.placeholder = 'Describe the symptom (won\'t start, noise, leak…)'; el.q.focus(); }
    });
    el.btnParts.addEventListener('click', function () { el.q.placeholder = 'Which part? (oil filter, belt, blade…)'; el.q.focus(); });
    el.btnMenu.addEventListener('click', function () { el.menu.classList.toggle('hidden'); });
    document.addEventListener('click', function (e) {
      if (!el.menu.classList.contains('hidden') && !e.target.closest('#menu,#btnMenu')) el.menu.classList.add('hidden');
    });
    el.menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]'); if (!b) return;
      var a = b.getAttribute('data-action');
      el.menu.classList.add('hidden');
      if (a === 'settings') {
        openSheet('<h2>Settings</h2><label for="apiKey">Gemini API key (this phone only)</label><input id="apiKey" type="password" autocomplete="off" placeholder="AIza…" value="' +
          UI.esc(FMBGemini.getKey()) + '"><p class="meta">Answers + Google Search grounding. Never committed.</p><div class="row"><button type="button" data-close>Cancel</button><button type="button" class="primary" data-save-key>Save</button></div>' +
          '<div id="offBox">' + FMBOffline.sectionHtml(machines, UI.esc) + '</div>');
        FMBOffline.fillSection($('offBox'), machines);
      } else if (a === 'about') {
        var lines = machines.map(function (m) {
          return '<p class="meta">' + UI.esc(m.name) + ': ' + (m.status === 'ready' ? ((m.stats && m.stats.pages) || 0) + ' pages' : 'coming soon') + '</p>';
        }).join('');
        openSheet('<h2>About</h2><p><b>Frank\'s Maintenance Bots</b> · ' + UI.esc(VERSION) + '</p>' + lines +
          '<p class="meta">Schedules live in Nestor — not here.</p><div class="row"><button type="button" class="primary" data-close>OK</button></div>');
      } else if (a === 'service-log') openLog();
      else if (a === 'check-update') checkUpdate();
      else if (a === 'clear-chat') { history = []; saveChat(); renderChat(); }
    });

    el.overlay.addEventListener('change', function (e) {
      if (e.target.id === 'slMachine') openLog(e.target.value);
      if (e.target.id === 'slImportFile' && e.target.files[0]) {
        e.target.files[0].text().then(FMBServiceLog.importJSON).then(function (n) { alert('Imported ' + n + ' entries.'); openLog(logMachine); })
          .catch(function (err) { alert('Import failed: ' + (err.message || err)); });
      }
    });
    el.overlay.addEventListener('click', function (e) {
      var t = e.target;
      if (t === el.overlay || t.matches('[data-close]')) { closeSheet(); return; }
      if (t.matches('[data-save-key]')) { var k = $('apiKey'); FMBGemini.setKey(k ? k.value.trim() : ''); closeSheet(); return; }
      if (t.matches('[data-sl-new]')) { openLogForm(null); return; }
      if (t.matches('[data-sl-back]')) { openLog(logMachine); return; }
      if (t.matches('[data-sl-save]')) { saveLogForm(); return; }
      if (t.matches('[data-sl-export]')) { exportLog(); return; }
      if (t.matches('[data-sl-import]')) { var f = $('slImportFile'); if (f) f.click(); return; }
      var ed = t.closest('[data-sl-edit]');
      if (ed) { FMBServiceLog.all().then(function (rows) { openLogForm(rows.find(function (r) { return r.id === ed.getAttribute('data-sl-edit'); })); }); return; }
      var dl = t.closest('[data-sl-del]');
      if (dl && confirm('Delete this entry?')) { FMBServiceLog.remove(dl.getAttribute('data-sl-del')).then(function () { openLog(logMachine); }); return; }
      var off = t.closest('[data-offline-dl]');
      if (off) { FMBOffline.startFromButton(off, machines); return; }
      var lb = t.closest('[data-lb]');
      if (lb) FMBViewer.openFrom(lb);
    });
    el.chat.addEventListener('click', function (e) {
      var lb = e.target.closest('[data-lb]');
      if (lb) { FMBViewer.openFrom(lb); return; }
      var d = e.target.closest('[data-cause-done]');
      if (d && causeState) { causeState.idx = Number(d.getAttribute('data-cause-done')) + 1; addBubble('bot', UI.renderCauseCard(causeState.causes, causeState.idx)); }
      if (e.target.closest('[data-cause-fixed]')) { addBubble('bot', '<p>Glad that sorted it. Ask anytime if something else acts up.</p>'); causeState = null; }
    });

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      recog = new SR(); recog.lang = 'en-US'; recog.interimResults = false;
      recog.onstart = function () { listening = true; el.btnMic.classList.add('active'); };
      recog.onend = function () { listening = false; el.btnMic.classList.remove('active'); };
      recog.onresult = function (e) { el.q.value = e.results[0][0].transcript; ask(el.q.value); };
      el.btnMic.addEventListener('click', function () { if (listening) recog.stop(); else { try { recog.start(); } catch (e) {} } });
    } else el.btnMic.style.display = 'none';

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(function () {});
  }

  FMBParts.load().then(function () { return FMBMachines.loadAll(); }).then(function (res) {
    machines = res.machines;
    var cm = mById(current);
    if (current && (!cm || cm.status !== 'ready')) current = 'mf-135';
    index = FMBSearch.buildIndex(res.pages);
    FMBViewer.setPages(res.pages, machines);
  }).then(bind).catch(function (e) {
    el.chat.innerHTML = '<div class="empty">Could not load data. ' + UI.esc(e.message || e) + '</div>';
    bind();
  });
})();

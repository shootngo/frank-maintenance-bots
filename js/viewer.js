/* Fullscreen diagram viewer (V 1.2): full-res image, pinch / pan / double-tap zoom, prev-next. */
(function (w) {
  'use strict';
  var d = document, root, stage, img, spin, note, label, count, prevB, nextB;
  var items = [], idx = 0, token = 0, open = false, preview = false;
  var s = 1, fit = 1, tx = 0, ty = 0, iw = 1, ih = 1, raf = 0;
  var pts = {}, npts = 0, pinch = null, pan = null, lastTap = null;
  var byImage = {}, shortOf = {};
  var NAMES = [[/^Massey Ferguson 135\b/i, 'MF 135'], [/^John Deere F725\b/i, 'JD F725'],
    [/^Ford F-250 2017\b/i, 'F-250'], [/^Subaru Forester 2020\b/i, 'Forester']];

  function labelFor(p) {
    if (!p) return '';
    var t = String(p.manualTitle || '');
    var m = t.split(' - ');
    var left = m[0], right = m.slice(1).join(' - ');
    NAMES.forEach(function (n) { left = left.replace(n[0], n[1]); });
    var name = t ? (right ? left + ' ' + right : left) : (shortOf[p.machine] || '') + ' ' + (p.title || 'Manual');
    return name.replace(/\s+/g, ' ').trim() + (p.page ? ' p.' + p.page : '');
  }
  function setPages(pages, machines) {
    byImage = {};
    (machines || []).forEach(function (m) { shortOf[m.slug] = m.short || m.name; });
    (pages || []).forEach(function (p) { if (p && p.image) byImage[p.image] = p; });
  }
  function itemFromButton(b) {
    var thumb = b.getAttribute('data-lb') || '';
    var p = byImage[thumb];
    var full = b.getAttribute('data-full') || (p && p.full) || (/^data:image\//.test(thumb) ? thumb : '');
    return { thumb: thumb, full: full, label: b.getAttribute('data-label') || (p ? labelFor(p) : (full === thumb ? 'Photo' : '')) };
  }

  function build() {
    root = d.createElement('div');
    root.className = 'lbv hidden';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Diagram viewer');
    root.innerHTML = '<div class="lbv-stage"><img class="lbv-img" alt="" draggable="false"></div>' +
      '<div class="lbv-spin" role="status" aria-label="Loading full image"></div><p class="lbv-note hidden"></p>' +
      '<div class="lbv-top"><span class="lbv-label"></span><button type="button" class="lbv-btn lbv-close" aria-label="Close">\u2715</button></div>' +
      '<button type="button" class="lbv-btn lbv-prev" aria-label="Previous image">\u2039</button>' +
      '<button type="button" class="lbv-btn lbv-next" aria-label="Next image">\u203a</button><div class="lbv-count"></div>';
    d.body.appendChild(root);
    var q = function (c) { return root.querySelector(c); };
    stage = q('.lbv-stage'); img = q('.lbv-img'); spin = q('.lbv-spin'); note = q('.lbv-note');
    label = q('.lbv-label'); count = q('.lbv-count'); prevB = q('.lbv-prev'); nextB = q('.lbv-next');
    q('.lbv-close').addEventListener('click', function () { close(true); });
    prevB.addEventListener('click', function () { show(idx - 1); });
    nextB.addEventListener('click', function () { show(idx + 1); });
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) {
      e.preventDefault(); zoomAt(s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY, false);
    }, { passive: false });
    root.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    w.addEventListener('resize', function () { if (open) reset(false); });
    d.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') close(true);
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
    });
    w.addEventListener('popstate', function () { if (open) close(false); });
  }

  /* ---------- transform helpers ---------- */
  function vw() { return stage.clientWidth || w.innerWidth; }
  function vh() { return stage.clientHeight || w.innerHeight; }
  function maxS() { return Math.max(fit * 6, preview ? 1 : 2); }
  function clamp() {
    var W = iw * s, H = ih * s;
    tx = W <= vw() ? (vw() - W) / 2 : Math.min(0, Math.max(vw() - W, tx));
    ty = H <= vh() ? (vh() - H) / 2 : Math.min(0, Math.max(vh() - H, ty));
  }
  function apply() {
    if (raf) return;
    raf = w.requestAnimationFrame(function () {
      raf = 0;
      img.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + s.toFixed(5) + ')';
      root.classList.toggle('lbv-zoomed', s > fit * 1.01);
    });
  }
  function animate() {
    img.classList.add('anim');
    clearTimeout(animate.t); animate.t = setTimeout(function () { img.classList.remove('anim'); }, 260);
  }
  function reset(anim) {
    var top = 56;
    fit = Math.min(vw() / iw, (vh() - top) / ih);
    if (preview) fit = Math.min(fit, 1);
    s = fit; tx = (vw() - iw * s) / 2; ty = Math.max(top, (vh() - ih * s) / 2);
    if (ih * s > vh() - top) ty = top;
    if (anim) animate();
    apply();
  }
  function zoomAt(ns, cx, cy, anim) {
    ns = Math.max(fit, Math.min(maxS(), ns));
    tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns;
    if (s <= fit * 1.001) { reset(anim); return; }
    clamp(); if (anim) animate(); apply();
  }

  /* ---------- gestures ---------- */
  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    pts[e.pointerId] = { x: e.clientX, y: e.clientY }; npts = Object.keys(pts).length;
    img.style.willChange = 'transform';
    if (npts === 2) {
      var a = two();
      pinch = { d: a.d, mx: a.x, my: a.y, s: s, tx: tx, ty: ty }; pan = null;
    } else if (npts === 1) {
      pan = { x: e.clientX, y: e.clientY, tx: tx, ty: ty, moved: false, t: Date.now() };
    }
  }
  function two() {
    var k = Object.keys(pts), p = pts[k[0]], q = pts[k[1]];
    return { d: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }
  function move(e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch && npts >= 2) {
      var a = two();
      var ns = Math.max(fit * 0.85, Math.min(maxS() * 1.15, pinch.s * a.d / pinch.d));
      s = ns;
      tx = a.x - (pinch.mx - pinch.tx) * ns / pinch.s;
      ty = a.y - (pinch.my - pinch.ty) * ns / pinch.s;
      apply();
    } else if (pan) {
      var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) pan.moved = true;
      if (!pan.moved) return;
      if (s > fit * 1.01) { tx = pan.tx + dx; ty = pan.ty + dy; clamp(); }
      else if (items.length > 1) { tx = pan.tx + dx; }
      apply();
    }
  }
  function up(e) {
    if (!pts[e.pointerId]) return;
    delete pts[e.pointerId]; npts = Object.keys(pts).length;
    if (pinch) {
      if (npts < 2) {
        pinch = null;
        if (s < fit) reset(true); else if (s > maxS()) zoomAt(maxS(), e.clientX, e.clientY, true); else { clamp(); animate(); apply(); }
        if (npts === 1) { var k = Object.keys(pts)[0]; pan = { x: pts[k].x, y: pts[k].y, tx: tx, ty: ty, moved: true, t: Date.now() }; }
      }
      return;
    }
    if (pan && npts === 0) {
      var dx = e.clientX - pan.x;
      if (!pan.moved) {
        var now = Date.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          lastTap = null;
          if (s > fit * 1.05) reset(true);
          else zoomAt(Math.min(maxS(), fit * 3), e.clientX, e.clientY, true);
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      } else if (s <= fit * 1.01 && items.length > 1 && Math.abs(dx) > 60) {
        show(idx + (dx < 0 ? 1 : -1));
      } else if (s <= fit * 1.01) reset(true);
      pan = null;
    }
    if (npts === 0) setTimeout(function () { if (!npts) img.style.willChange = 'auto'; }, 300);
  }

  /* ---------- open / show ---------- */
  function fail(it, msg) {
    spin.classList.add('hidden');
    note.textContent = msg; note.classList.remove('hidden');
    if (!it.thumb || it.thumb === it.full) return;
    var my = token, t = new Image();
    t.onload = function () {      // small preview at its own size, never stretched
      if (my !== token) return;
      preview = true; iw = t.naturalWidth; ih = t.naturalHeight;
      img.src = it.thumb; img.style.width = iw + 'px'; img.style.height = ih + 'px';
      reset(false); img.style.visibility = 'visible';
    };
    t.src = it.thumb;
  }
  function show(i) {
    if (!items.length) return;
    idx = (i + items.length) % items.length;
    var it = items[idx], my = ++token;
    preview = false; pinch = null; pan = null; pts = {}; npts = 0;
    img.style.visibility = 'hidden'; img.removeAttribute('src');
    spin.classList.remove('hidden'); note.classList.add('hidden');
    label.textContent = it.label || '';
    count.textContent = items.length > 1 ? (idx + 1) + ' / ' + items.length : '';
    prevB.classList.toggle('hidden', items.length < 2); nextB.classList.toggle('hidden', items.length < 2);
    if (!it.full) { fail(it, 'A sharp version of this page is not available yet.'); return; }
    var pre = new Image();
    pre.onload = function () {
      if (my !== token) return;
      iw = pre.naturalWidth || 1; ih = pre.naturalHeight || 1;
      img.style.width = iw + 'px'; img.style.height = ih + 'px';
      img.src = it.full;
      var ready = function () {
        if (my !== token) return;
        reset(false); img.style.visibility = 'visible'; spin.classList.add('hidden');
        [idx + 1, idx - 1].forEach(function (j) {          // warm neighbours
          var n = items[(j + items.length) % items.length];
          if (n && n.full && n !== it) { var x = new Image(); x.src = n.full; }
        });
      };
      if (img.decode) img.decode().then(ready, ready); else ready();
    };
    pre.onerror = function () {
      if (my !== token) return;
      fail(it, navigator.onLine === false
        ? 'Offline \u2014 this diagram is not saved on the phone yet. Settings \u2192 Download all diagrams for offline.'
        : 'Could not load the full image. Check your connection and try again.');
    };
    pre.src = it.full;
  }
  function openItems(list, i) {
    if (!root) build();
    items = (list || []).filter(function (x) { return x && (x.full || x.thumb); });
    if (!items.length) return;
    if (!open) {
      open = true; root.classList.remove('hidden'); d.documentElement.classList.add('lbv-open');
      try { w.history.pushState({ lbv: 1 }, ''); } catch (x) {}
    }
    show(i || 0);
  }
  function openFrom(btn) {
    var group = btn.closest('.thumbs');
    var btns = group ? Array.prototype.slice.call(group.querySelectorAll('[data-lb]')) : [btn];
    openItems(btns.map(itemFromButton), Math.max(0, btns.indexOf(btn)));
  }
  function close(viaUi) {
    if (!open) return;
    open = false; token++;
    root.classList.add('hidden'); d.documentElement.classList.remove('lbv-open');
    img.removeAttribute('src');
    if (viaUi && w.history.state && w.history.state.lbv) { try { w.history.back(); } catch (x) {} }
  }

  w.FMBViewer = { open: openItems, openFrom: openFrom, close: close, setPages: setPages, labelFor: labelFor,
    isOpen: function () { return open; } };
})(window);

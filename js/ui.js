(function (w) {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function badge(kind) {
    if (kind === 'official') return '<span class="badge official">Official</span>';
    if (kind === 'verify') return '<span class="badge verify">Verify</span>';
    return '<span class="badge community">Community</span>';
  }
  function thumbsHtml(pages) {
    var imgs = (pages || []).filter(function (p) { return p && p.image; }).slice(0, 6);
    if (!imgs.length) return '';
    return '<div class="thumbs">' + imgs.map(function (p) {
      return '<button type="button" data-lb="' + esc(p.image) + '" title="' + esc(p.title || '') + '">' +
        '<img src="' + esc(p.image) + '" alt=""></button>';
    }).join('') + '</div>';
  }
  function sourceChips(pages, grounded) {
    var bits = [];
    (pages || []).slice(0, 5).forEach(function (p) {
      if (p.type === 'manual-page' || p.manualTitle) {
        bits.push(badge('official') + '<span class="source-line">' +
          esc((p.manualTitle || 'Manual') + (p.page ? ' p.' + p.page : '')) + '</span>');
      } else if (p.url) {
        bits.push('<a class="chip-link" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
          badge('community') + esc(p.title || p.url) + '</a>');
      }
    });
    (grounded || []).slice(0, 6).forEach(function (g) {
      bits.push('<a class="chip-link" href="' + esc(g.url) + '" target="_blank" rel="noopener">' +
        badge('community') + esc(g.site || g.title) + '</a>');
    });
    return bits.length ? '<div class="chips">' + bits.join(' ') + '</div>' : '';
  }
  function partsHtml(parts) {
    if (!parts || !parts.length) return '';
    return '<div class="section"><h3>Parts</h3>' + parts.map(function (p) {
      var oem = (p.oem || []).map(function (o) {
        return '<div class="nums">' + badge(o.confidence === 'verify' ? 'verify' :
          (o.confidence === 'official' ? 'official' : 'community')) +
          '<b>' + esc(o.number) + '</b> · ' + esc(o.brand) + '</div>';
      }).join('');
      var cross = (p.cross || []).map(function (o) {
        return '<div class="nums">' + badge(o.confidence === 'verify' ? 'verify' : 'community') +
          '<b>' + esc(o.number) + '</b> · ' + esc(o.brand) + '</div>';
      }).join('');
      var num = (p.oem && p.oem[0] && p.oem[0].number) ||
        (p.cross && p.cross[0] && p.cross[0].number) || '';
      var buys = '';
      if (num && w.FMBParts && w.FMBParts.buyLinks) {
        buys = w.FMBParts.buyLinks(num).map(function (b) {
          return '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(b.label) + '</a>';
        }).join('');
      }
      return '<div class="part-card"><h4>' + esc(p.name) + '</h4>' + oem + cross +
        (p.notes ? '<p class="meta">' + esc(p.notes) + '</p>' : '') +
        '<div class="buy-row">' + buys + '</div></div>';
    }).join('') + '</div>';
  }
  function renderCauseCard(causes, idx) {
    var c = causes[idx];
    if (!c) return '<p>That is all I lined up. Ask a more specific question if it still is not fixed.</p>';
    var checks = (c.check || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var safety = c.safety ? '<div class="safety">⚠ ' + esc(c.safety) + '</div>' : '';
    var off = ((c.sources && c.sources.official) || []).slice(0, 3).map(function (h) {
      return h.page ? h.page : h;
    });
    var wrenches = (w.FMBSymptoms && w.FMBSymptoms.wrenchIcons)
      ? w.FMBSymptoms.wrenchIcons(c.difficulty || 1) : '🔧';
    return '<div class="cause-card"><h4>Cause ' + (idx + 1) + ' of ' + causes.length + ': ' +
      esc(c.name) + '</h4><div><span class="wrenches">' + wrenches +
      '</span> · ~' + esc(c.cost || '?') + '</div><p><b>Tools:</b> ' + esc(c.tools || 'none') +
      '</p><p><b>What to check</b></p><ol>' + checks + '</ol>' + safety + thumbsHtml(off) +
      '<div class="cause-actions"><button type="button" data-cause-done="' + idx +
      '">Checked — still broken</button><button type="button" class="primary" data-cause-fixed="' +
      idx + '">That fixed it</button></div></div>';
  }
  w.FMBUI = { badge: badge, esc: esc, partsHtml: partsHtml, renderCauseCard: renderCauseCard, sourceChips: sourceChips, thumbsHtml: thumbsHtml };
})(window);

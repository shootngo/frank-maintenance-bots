/* Client-side keyword / light BM25 over index.json */
(function (w) {
  'use strict';

  const DIAGRAM_BOOST = /\b(belt|diagram|show|routing|illustration|figure|wiring|how does|where (is|does)|picture|photo|image)\b/i;
  const STOP = new Set(('a an the of to for in on at by with from is are was were be been being it this that these those and or '
    + 'my me i how what when where why which do does did can could should would please help').split(' '));

  function tokens(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9./+-]+/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t) && t.length > 1);
  }

  function buildIndex(pages) {
    const docs = pages.map((p, i) => {
      const text = ((p.title || '') + ' ' + (p.manualTitle || '') + ' ' + (p.text || '')).toLowerCase();
      const tf = {};
      for (const t of tokens(text)) tf[t] = (tf[t] || 0) + 1;
      return { i, page: p, tf, len: Object.keys(tf).length || 1 };
    });
    const df = {};
    for (const d of docs) for (const t of Object.keys(d.tf)) df[t] = (df[t] || 0) + 1;
    return { docs, df, n: docs.length };
  }

  function search(idx, query, opts) {
    opts = opts || {};
    const q = tokens(query);
    if (!q.length || !idx) return [];
    const machine = opts.machine || '';
    const wantDiagram = DIAGRAM_BOOST.test(query);
    const k1 = 1.2, b = 0.75;
    const avg = idx.docs.reduce((s, d) => s + d.len, 0) / (idx.n || 1);
    const scored = [];
    for (const d of idx.docs) {
      if (machine && d.page.machine !== machine) continue;
      let score = 0;
      for (const t of q) {
        const f = d.tf[t] || 0;
        if (!f) continue;
        const idf = Math.log(1 + (idx.n - (idx.df[t] || 0) + 0.5) / ((idx.df[t] || 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avg))));
      }
      if (!score) continue;
      if (wantDiagram && d.page.isDiagram) score *= 1.85;
      if (d.page.type === 'reference-notes') score *= 1.15;
      if (d.page.type === 'reference') score *= 1.05;
      scored.push({ page: d.page, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts.limit || 12);
  }

  w.FMBSearch = { buildIndex, search, tokens, DIAGRAM_BOOST };
})(window);

(function (w) {
  'use strict';

  let PARTS = [];

  async function load() {
    try {
      const r = await fetch('data/parts.json', { cache: 'no-cache' });
      const j = await r.json();
      PARTS = j.parts || [];
    } catch (e) {
      PARTS = [];
    }
    return PARTS;
  }

  function isPartsQuestion(q) {
    return /\b(part|parts|filter|belt|blade|washer|gasket|spark\s*plug|oem|cross|wix|napa|buy|order|number|#)\b/i.test(q);
  }

  function find(query, machine) {
    const toks = (w.FMBSearch.tokens(query) || []).concat(
      String(query).toLowerCase().split(/\s+/),
    );
    const scored = [];
    for (const p of PARTS) {
      if (machine && p.machine !== machine) continue;
      const hay = (p.name + ' ' + (p.keywords || []).join(' ') + ' ' + p.category).toLowerCase();
      let s = 0;
      for (const t of toks) if (t && hay.includes(t)) s += 1;
      if (s) scored.push({ part: p, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((x) => x.part);
  }

  function buyLinks(number) {
    const q = encodeURIComponent(number);
    return [
      { label: 'Amazon', url: 'https://www.amazon.com/s?k=' + q },
      { label: 'NAPA', url: 'https://www.napaonline.com/en/search?text=' + q },
      { label: 'RockAuto', url: 'https://www.rockauto.com/en/partsearch/?partnum=' + q },
      { label: "Tractor Supply", url: 'https://www.tractorsupply.com/tsc/search/' + q },
      { label: "Messick's", url: 'https://www.messicks.com/search?q=' + q },
      { label: "Yesterday's Tractors", url: 'https://www.yesterdaystractors.com/cgi-bin/shop_search.cgi?search=' + q },
      { label: 'AGCO Parts', url: 'https://www.agcopartsbooks.com/' },
    ];
  }

  function badge(confidence, sourceType) {
    if (sourceType === 'official' || confidence === 'official') return 'official';
    if (confidence === 'verify') return 'verify';
    return 'community';
  }

  w.FMBParts = { load, find, isPartsQuestion, buyLinks, badge, all: () => PARTS };
})(window);

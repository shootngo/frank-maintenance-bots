(function (w) {
  'use strict';

  function isSymptomQuestion(q) {
    return /\b(won'?t\s+start|no\s+start|hard\s+start|running\s+rough|rough\s+idle|black\s+smoke|white\s+smoke|blue\s+smoke|miss(?:ing|fire)?|overheat|no\s+power|won'?t\s+fire|stalls?|dies\s+out|leak(?:ing)?|knock|symptom|what'?s\s+wrong|troubleshoot)\b/i.test(q)
      || /\b(smoke|rough|won'?t|cant|can't|not\s+working)\b/i.test(q);
  }

  /** Build cause cards from gemini JSON or heuristic fallback using hits */
  function fallbackCauses(query, hits) {
    const q = query.toLowerCase();
    const causes = [];
    if (/smoke|rough|start|fire|fuel/.test(q)) {
      causes.push({
        name: 'Air in the fuel system',
        check: [
          'Look for wet spots at fuel bowl gaskets and banjo washers.',
          'Hand-tighten the glass bowl after cleaning the gasket seat.',
          'Bleed at the injection pump bleed screw using the lift-pump primer lever until fuel runs bubble-free.',
        ],
        tools: 'Wrenches, shop rags, catch pan',
        difficulty: 1,
        cost: '$0–$20 (gaskets/washers)',
        safety: 'Keep rags away from hot exhaust. Wipe spilled diesel.',
      });
      causes.push({
        name: 'Clogged fuel filter or dirty sediment bowl',
        check: [
          'Shut the tank valve (often under left/rear of tank on MF 135).',
          'Remove glass bowl, scrape old gasket clean, inspect for algae/dirt.',
          'Fit a new gasket; fill bowl; hand-snug only; reopen fuel; bleed.',
        ],
        tools: 'Bowl wrench/bail, new gasket, rags',
        difficulty: 1,
        cost: '$5–$25',
        safety: 'Support the tractor. Catch fuel. No smoking.',
      });
      causes.push({
        name: 'Weak lift pump or stuck shutoff',
        check: [
          'Confirm shutoff is fully open / stop control fully in run.',
          'Work the lift-pump primer — you should feel firm resistance.',
          'If primer is limp, lift-pump diaphragm may be failed (also check for diesel in engine oil).',
        ],
        tools: 'Basic hand tools',
        difficulty: 2,
        cost: '$40–$150 if pump rebuild/replace',
        safety: 'If oil level is rising, do not keep running — diesel may be diluting the oil.',
      });
    }
    if (/hydraul|lift|hitch|3[\s-]?point/.test(q)) {
      causes.push({
        name: 'Hydraulic suction screen plugged',
        check: [
          'On live/2-stage clutch models the screen is behind the PTO shift cover.',
          'Cut safety wire, lift filter cup as a unit, clean or replace screen, re-wire nut.',
          'Refill with UTF meeting MF M-1129A (or M-1143 / Permatran III if Multi-Power/IPTO).',
        ],
        tools: 'Hand tools, catch pan (~8 gal capacity)',
        difficulty: 2,
        cost: '$40–$120 fluid + screen',
        safety: 'Support hitch implements on the ground before opening the system.',
      });
    }
    // attach sources from hits
    const official = hits.filter((h) => h.page && h.page.type === 'manual-page').slice(0, 3);
    const community = hits.filter((h) => h.page && String(h.page.type).startsWith('reference')).slice(0, 3);
    return causes.map((c, i) => Object.assign({ id: 'cause-' + i, sources: { official, community } }, c));
  }

  function wrenchIcons(n) {
    n = Math.max(1, Math.min(3, Number(n) || 1));
    return '🔧'.repeat(n) + '·'.repeat(3 - n);
  }

  w.FMBSymptoms = { isSymptomQuestion, fallbackCauses, wrenchIcons };
})(window);

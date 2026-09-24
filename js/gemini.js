(function (w) {
  'use strict';

  const LS_KEY = 'fmb_gemini_key';
  const MODEL = 'gemini-2.5-flash';
  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

  function getKey() {
    try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
  }
  function setKey(k) {
    try {
      if (k) localStorage.setItem(LS_KEY, k.trim());
      else localStorage.removeItem(LS_KEY);
    } catch (e) {}
  }

  function siteName(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }

  function parseGrounding(data) {
    const out = [];
    const cands = (data && data.candidates) || [];
    for (const c of cands) {
      const gm = c.groundingMetadata || c.grounding_metadata;
      if (!gm) continue;
      const chunks = gm.groundingChunks || gm.grounding_chunks || [];
      for (const ch of chunks) {
        const web = ch.web || ch.retrievedContext || {};
        const uri = web.uri || web.url;
        const title = web.title || siteName(uri || '');
        if (uri) out.push({ url: uri, title: title, site: siteName(uri) });
      }
    }
    // dedupe
    const seen = new Set();
    return out.filter((x) => {
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    });
  }

  async function fetchImageAsInline(url) {
    try {
      const abs = new URL(url, location.href).href;
      const r = await fetch(abs);
      if (!r.ok) return null;
      const blob = await r.blob();
      const buf = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return {
        inline_data: {
          mime_type: blob.type || 'image/webp',
          data: btoa(binary),
        },
      };
    } catch (e) {
      return null;
    }
  }

  async function answer({ question, machine, pages, refs, parts, mode }) {
    const key = getKey();
    if (!key) return { ok: false, reason: 'no-key' };

    const pageBlocks = (pages || []).slice(0, 8).map((p, i) => {
      return '[' + (i + 1) + '] id=' + p.id + ' OFFICIAL source="' + (p.manualTitle || '') + ' p.' + (p.page || '?') + '" diagram=' + !!p.isDiagram + '\n' + (p.text || '').slice(0, 2500);
    }).join('\n\n');

    const refBlocks = (refs || []).slice(0, 6).map((p, i) => {
      return '[R' + (i + 1) + '] COMMUNITY stored title="' + (p.title || '') + '" url="' + (p.url || '') + '"\n' + (p.text || '').slice(0, 1200);
    }).join('\n\n');

    const partBlocks = (parts || []).slice(0, 4).map((p) => JSON.stringify(p)).join('\n');

    const communitySites = 'reddit.com, yesterdaystractors.com, tractorbynet.com, masseyforums, ford-trucks.com, powerstrokenation, powerstroke.org, subaruforester.org, mytractorforum, greentractortalk.com';

    let system = 'You are Frank\'s Maintenance Bots, a shop helper for a non-mechanic owner. Use plain English. Short sentences. Define jargon in a few words.\n';
    system += 'Always separate OFFICIAL (manual) advice from COMMUNITY advice. If they disagree, say so clearly.\n';
    system += 'Cite official pages by their id. Never invent URLs. Community live links must come only from Google Search grounding.\n';
    system += 'Machine: ' + (machine || 'unknown') + '. Mode: ' + (mode || 'qa') + '.\n';

    if (mode === 'symptom') {
      system += 'Return JSON only with shape: {"summary":"","safety":"","causes":[{"name":"","check":[""],"tools":"","difficulty":1,"cost":"","officialPageIds":[],"notes":""}],"disagreement":""}. Difficulty 1=Easy 2=Medium 3=Hard. Order causes cheapest/most common first.\n';
    } else if (mode === 'parts') {
      system += 'Return JSON only: {"summary":"","parts":[{"name":"","oem":[{"number":"","brand":"","confidence":"official|community|verify"}],"cross":[{"number":"","brand":"","confidence":"official|community|verify"}],"notes":""}],"disagreement":""}. Never guess part numbers — use verify when unsure.\n';
    } else {
      system += 'Return JSON only: {"official":"","community":"","disagreement":"","citePageIds":[],"safety":""}.\n';
    }

    const userText = [
      'Question: ' + question,
      '',
      'OFFICIAL MANUAL EXCERPTS:',
      pageBlocks || '(none)',
      '',
      'STORED COMMUNITY REFERENCES:',
      refBlocks || '(none)',
      '',
      'SEED PARTS TABLE:',
      partBlocks || '(none)',
      '',
      'Also search the live web for community fixes on: ' + communitySites + '. Prefer recent practical threads.',
    ].join('\n');

    const partsContent = [{ text: system + '\n\n' + userText }];

    // Attach top diagram images for visual questions
    const diagrams = (pages || []).filter((p) => p.isDiagram && p.image).slice(0, 3);
    for (const d of diagrams) {
      const inline = await fetchImageAsInline(d.image);
      if (inline) {
        partsContent.push({ text: 'Diagram page id=' + d.id + ' (' + d.manualTitle + ' p.' + d.page + ')' });
        partsContent.push(inline);
      }
    }

    const body = {
      contents: [{ role: 'user', parts: partsContent }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    };

    const url = ENDPOINT + '?key=' + encodeURIComponent(key);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { ok: false, reason: 'http', status: resp.status, errText };
    }
    const data = await resp.json();
    const grounded = parseGrounding(data);
    let text = '';
    try {
      text = data.candidates[0].content.parts.map((p) => p.text || '').join('');
    } catch (e) {}
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch (e2) {}
    }
    return { ok: true, parsed, raw: text, grounded, diagrams };
  }

  w.FMBGemini = { getKey, setKey, answer, siteName, MODEL };
})(window);

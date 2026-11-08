// Phone web app: a stand-in for the few chrome.* APIs that lib.js / popup.js use,
// so the extension code runs unchanged in a normal browser page.
(() => {
  const P = new URLSearchParams(location.search);
  // Android share target sends title/text/url; the Funda app often puts the link inside "text".
  const shared = ['url', 'text', 'title'].map((k) => P.get(k) || '').join(' ');
  const link = ((shared.match(/https?:\/\/[^\s"'<>]+/) || [])[0] || '').replace(/[)\].,;]+$/, '');
  const typed = link ? '' : (P.get('url') || P.get('q') || P.get('text') || '').trim();
  const num = (s) => (s ? Number(String(s).replace(/[^\d]/g, '')) || null : null);
  const priceText = P.get('price') || (shared.match(/€\s?(\d{1,3}(?:[.\s]\d{3})+)/) || [])[1];
  window.HZ = { link, typed, price: num(priceText), area: num(P.get('m2')), type: P.get('type') || '' };

  const area = (load, save) => ({
    async get(keys) {
      const out = {};
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) { for (const k of keys) { const v = load(k); if (v !== undefined) out[k] = v; } return out; }
      for (const [k, d] of Object.entries(keys || {})) { const v = load(k); out[k] = v === undefined ? d : v; }
      return out;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) save(k, v); },
  });
  const mem = {};
  const ls = (prefix) => area(
    (k) => { try { const v = localStorage.getItem(prefix + k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } },
    (k, v) => { try { localStorage.setItem(prefix + k, JSON.stringify(v)); } catch { /* private mode */ } },
  );

  window.chrome = {
    storage: { session: area((k) => mem[k], (k, v) => { mem[k] = v; }), local: ls('hz.'), sync: ls('hz.sync.') },
    // The web app lives in /app/ of the huisinzicht-data repo; data/nvm.json sits one level up.
    runtime: { getURL: (p) => new URL(`../${p}`, location.href).href },
    tabs: {
      query: async () => [{
        id: 1,
        url: link || location.href,
        address: link ? null : (typed ? { street: typed, city: '' } : null),
      }],
    },
    // There is no listing page to read on a phone: hand back what the user typed or the share text held.
    scripting: {
      executeScript: async () => [{ result: {
        heading: '', bodyStart: '',
        price: window.HZ.price, livingArea: window.HZ.area, houseType: window.HZ.type || undefined,
      } }],
    },
  };
})();

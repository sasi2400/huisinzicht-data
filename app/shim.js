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
  // Shared words around the link (the Funda app's short /detail/<id> links carry no address in the URL).
  const rest = link ? ['title', 'text'].map((k) => (P.get(k) || '').replace(link, ' ')).join(' ').replace(/\s+/g, ' ').trim() : '';
  window.HZ = { link, typed, rest, price: num(priceText), area: num(P.get('m2')), type: P.get('type') || '' };

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

  // Recently viewed houses (this phone only). popup.js stores every finished lookup in storage.session,
  // so that write is where we note it.
  const RECENT = 'hz.recent';
  window.HZ.recent = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; } };
  const listIO = (key) => [
    () => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
    (list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* private mode */ } },
  ];
  [window.HZ.saved, window.HZ.setSaved] = listIO('hz.saved');   // bookmarks: kept until removed
  window.HZ.saveRecent = (list) => { try { localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 20))); } catch { /* private mode */ } };
  function remember(res) {
    const H = window.HZ;
    const q = H.link || H.typed;
    if (!res?.loc || !q) return;
    const lbm = res.data?.clippedgridscore24 || res.data?.buurtscore24;
    const item = {
      name: res.loc.weergavenaam, place: [res.loc.buurtnaam, res.loc.gemeentenaam].filter(Boolean).join(' · '),
      q, price: H.price || null, type: H.type || '', lbm: lbm?.kscore || null,
      woz: res.woz?.values?.at(-1)?.value || null, t: Date.now(),
    };
    H.current = item;
    H.saveRecent([item, ...H.recent().filter((r) => r.name !== item.name)]);
    // keep a bookmark's figures fresh
    const sv = H.saved();
    if (sv.some((r) => r.name === item.name)) H.setSaved(sv.map((r) => (r.name === item.name ? { ...item, price: item.price || r.price } : r)));
    window.dispatchEvent(new Event('hz-result'));
  }
  const session = area((k) => mem[k], (k, v) => { mem[k] = v; if (k.startsWith('r:')) remember(v); });

  window.chrome = {
    storage: { session, local: ls('hz.'), sync: ls('hz.sync.') },
    // The web app lives in /app/ of the huisinzicht-data repo; data/nvm.json sits one level up.
    runtime: { getURL: (p) => new URL(`../${p}`, location.href).href },
    tabs: {
      query: async () => [{
        id: 1,
        url: window.HZ.link || location.href,
        address: window.HZ.link ? null : (window.HZ.typed ? { street: window.HZ.typed, city: '' } : null),
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

// Shared logic: Funda listing -> address -> PDOK coordinates -> Leefbaarometer (WMS GetFeatureInfo).

const PDOK = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const WMS = 'https://geo.leefbaarometer.nl/lbm3/wms';

export const YEARS = ['02', '08', '12', '14', '16', '18', '20', '22', '24'];
export const LATEST = '24';

// Overall class (kscore 1..9), labels and colours from the official legend.
export const SCORE_CLASSES = [
  null,
  { nl: 'Zeer onvoldoende', en: 'Very poor', color: '#CF783F' },
  { nl: 'Ruim onvoldoende', en: 'Poor', color: '#D7995E' },
  { nl: 'Onvoldoende', en: 'Insufficient', color: '#E0B881' },
  { nl: 'Zwak', en: 'Weak', color: '#FBF2C4' },
  { nl: 'Voldoende', en: 'Sufficient', color: '#D0D2A6' },
  { nl: 'Ruim voldoende', en: 'More than sufficient', color: '#A7B38A' },
  { nl: 'Goed', en: 'Good', color: '#819470' },
  { nl: 'Zeer goed', en: 'Very good', color: '#5E7658' },
  { nl: 'Uitstekend', en: 'Excellent', color: '#3C5941' },
];

// 2024 legend thresholds for the overall score (used when a layer lacks kscore, e.g. postcode areas).
const SCORE_CUTS_2024 = [3.674, 3.7484, 3.8208, 3.9552, 3.9955, 4.1126, 4.1918, 4.2689];
export function scoreClass(p) {
  if (!p) return null;
  if (p.kscore) return p.kscore;
  if (typeof p.lbm !== 'number') return null;
  return 1 + SCORE_CUTS_2024.filter((t) => p.lbm >= t).length;
}

// Diverging classes 1..9 used for dimensions, deviation and development.
export const DIV_COLORS = [null, '#D66982', '#DD899A', '#E5A9B4', '#F3C9D1', '#F8FCE3', '#D6DDAF', '#B5BE7E', '#96A04A', '#798233'];
const DIV_WORDS = [null, 'Very large negative', 'Large negative', 'Negative', 'Small negative', 'Neutral', 'Small positive', 'Positive', 'Large positive', 'Very large positive'];
const DEV_WORDS = [null, 'Strong decline', 'Large decline', 'Decline', 'Slight decline', 'No change', 'Slight improvement', 'Improvement', 'Large improvement', 'Strong improvement'];
export const divLabel = (k) => DIV_WORDS[k] || '–';
export const devLabel = (k) => DEV_WORDS[k] || '–';

export const DIMENSIONS = [
  { key: 'won', en: 'Housing stock', nl: 'Woningvoorraad' },
  { key: 'fys', en: 'Physical environment', nl: 'Fysieke omgeving' },
  { key: 'vrz', en: 'Amenities', nl: 'Voorzieningen' },
  { key: 'soc', en: 'Social cohesion', nl: 'Sociale samenhang' },
  { key: 'onv', en: 'Nuisance & safety', nl: 'Overlast & onveiligheid' },
];

const LISTING_TYPES = new Set([
  'huis', 'appartement', 'parkeergelegenheid', 'bouwgrond', 'woonboot', 'woonwagen', 'standplaats',
  'garage', 'parkeerplaats', 'berging', 'opslagruimte', 'kamer', 'object', 'ligplaats',
]);

// ---------- Supported sites ----------
// Each site: does a URL look like a single listing, and what address can we read from the URL itself?
const slugWords = (s) => decodeURIComponent(s).replace(/-/g, ' ').trim();

export const SITES = {
  funda: {
    name: 'Funda',
    host: /(^|\.)funda\.nl$/,
    isListing: (p) => /\/(detail\/)?(koop|huur)\/[^/]+\/[^/]+/.test(p),
    // "/detail/koop/breukelen/huis-stinzenlaan-zuid-210/80884310/" or old "/koop/breukelen/huis-42123456-stinzenlaan-zuid-210/"
    fromUrl(p) {
      const parts = p.split('/').filter(Boolean);
      if (parts[0] === 'detail') parts.shift();
      if (parts[0] === 'en') parts.shift();
      if (!['koop', 'huur'].includes(parts[0]) || parts.length < 3) return null;
      let tokens = parts[2].split('-');
      if (LISTING_TYPES.has(tokens[0])) tokens = tokens.slice(1);
      tokens = tokens.filter((t) => !/^\d{7,9}$/.test(t));
      return tokens.length ? { street: tokens.join(' '), city: slugWords(parts[1]) } : null;
    },
  },
  pararius: {
    name: 'Pararius',
    host: /(^|\.)pararius\.(nl|com)$/,
    // "/appartement-te-huur/amsterdam/6b5c1b7e/van-woustraat" or English "/apartment-for-rent/amsterdam/…"
    isListing: (p) => /^\/[a-z-]+-(te-(koop|huur)|for-(sale|rent))\/[^/]+\/[0-9a-f]{6,}\/[^/]+/.test(p),
    fromUrl(p) {
      const parts = p.split('/').filter(Boolean);
      if (parts.length < 4) return null;
      return { street: slugWords(parts[3]), city: slugWords(parts[1]) }; // street only, no house number
    },
  },
  jaap: {
    name: 'Jaap',
    host: /(^|\.)jaap\.nl$/,
    // Detail pages contain /te-koop/ or /te-huur/ with several more segments, often incl. a postcode.
    isListing: (p) => /\/(te-koop|te-huur)\/(?:[^/]+\/){2,}[^/]+/.test(p) || /\/\d{4}[a-z]{2}\/[^/]+-\d+/i.test(p),
    fromUrl(p) {
      const parts = p.split('/').filter(Boolean);
      const i = parts.findIndex((s) => /^\d{4}[a-z]{2}$/i.test(s));
      if (i >= 0 && parts[i + 1]) return { street: slugWords(parts[i + 1]), postcode: parts[i].toUpperCase() };
      const s = parts.find((x) => /^[a-z][a-z-]*-\d+[a-z]?$/i.test(x));
      return s ? { street: slugWords(s), city: slugWords(parts[parts.length - 3] || '') } : null;
    },
  },
};

export function siteFor(url) {
  try {
    const u = new URL(url);
    for (const [key, s] of Object.entries(SITES)) {
      if (s.host.test(u.hostname) && s.isListing(u.pathname)) return { key, ...s, path: u.pathname };
    }
  } catch { /* not a URL */ }
  return null;
}
export const isListing = (url) => !!siteFor(url);
export const isFundaListing = isListing; // backwards compatibility

export function addressFromUrl(url) {
  const s = siteFor(url);
  return s ? s.fromUrl(s.path) : null;
}

// Best-effort: "Street 210" followed by "3621 TH Breukelen" somewhere in the heading / page text.
const ADDR_RE = /([A-Za-zÀ-ÿ'.\-]+(?: [A-Za-zÀ-ÿ'.\-]+){0,4} \d{1,5}(?:[ -]?[A-Za-z0-9]{1,4})?)\s*,?\s*(\d{4}\s?[A-Z]{2})\b/;
export function addressFromPageText(...texts) {
  for (const text of texts) {
    if (!text) continue;
    const t = text.replace(/\s+/g, ' ');
    const m = t.match(ADDR_RE);
    if (m) {
      const street = m[1].trim().replace(/^(?:(?:huis|appartement|woning|apartment|house)\s+)?(?:te koop|te huur|for sale|for rent|koop|huur)[: ]+/i, '');
      return { street, postcode: m[2].replace(' ', '') };
    }
  }
  return null;
}

export async function geocode(addr) {
  const q = addr.postcode ? `${addr.street} ${addr.postcode}` : `${addr.street} ${addr.city}`;
  const params = new URLSearchParams({
    q, fq: 'type:adres', rows: '1',
    fl: 'weergavenaam,centroide_rd,centroide_ll,postcode,woonplaatsnaam,buurtnaam,buurtcode,wijknaam,gemeentenaam,gemeentecode,provinciecode,provincienaam,nummeraanduiding_id,adresseerbaarobject_id',
  });
  const r = await fetch(`${PDOK}?${params}`);
  if (!r.ok) throw new Error(`Address lookup failed (PDOK ${r.status})`);
  const doc = (await r.json()).response?.docs?.[0];
  if (!doc) throw new Error(`Address not found: "${q}"`);
  const [x, y] = doc.centroide_rd.match(/[\d.]+/g).map(Number);
  const [lon, lat] = doc.centroide_ll.match(/[\d.]+/g).map(Number);
  return { ...doc, x, y, lat, lon, query: q };
}

function layerList() {
  const L = [];
  for (const yy of YEARS) L.push(`lbm3:clippedgridscore${yy}`, `lbm3:buurtscore${yy}`);
  L.push(`lbm3:wijkscore${LATEST}`, `lbm3:gemeentescore${LATEST}`, `lbm3:pc4score${LATEST}`);
  L.push('lbm3:clippedgridontwikkeling22_24', 'lbm3:clippedgridontwikkeling14_24', 'lbm3:buurtontwikkeling22_24', 'lbm3:buurtontwikkeling14_24');
  return L;
}

export async function leefbaarometer(x, y) {
  const layers = layerList().join(',');
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
    LAYERS: layers, QUERY_LAYERS: layers, FEATURE_COUNT: '100',
    SRS: 'EPSG:28992', BBOX: `${x - 5},${y - 5},${x + 5},${y + 5}`,
    WIDTH: '11', HEIGHT: '11', X: '5', Y: '5', INFO_FORMAT: 'application/json',
  });
  const r = await fetch(`${WMS}?${params}`);
  if (!r.ok) throw new Error(`Leefbaarometer request failed (${r.status})`);
  const json = await r.json();
  const out = {};
  for (const f of json.features || []) {
    const layer = String(f.id).split('.')[0]; // e.g. "clippedgridscore24"
    out[layer] = f.properties;
  }
  if (!out[`clippedgridscore${LATEST}`] && !out[`buurtscore${LATEST}`]) {
    throw new Error('No Leefbaarometer data for this location.');
  }
  return out;
}

// ---------- Listing facts from the Funda page (runs inside the page) ----------
function scrapeListingPage() {
  const num = (s) => (s ? Number(String(s).replace(/[^\d]/g, '')) || null : null);
  const out = {
    heading: [document.querySelector('h1')?.innerText || '', document.title].join(' | '),
    bodyStart: (document.querySelector('main') || document.body)?.innerText?.slice(0, 4000) || '',
  };
  // 1) Structured data, if present.
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        const offer = Array.isArray(o.offers) ? o.offers[0] : o.offers;
        if (offer?.price && !out.price) out.price = num(offer.price);
        if (o.floorSize?.value && !out.livingArea) out.livingArea = num(o.floorSize.value);
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(s.textContent));
    } catch { /* ignore */ }
  }
  // 2) Visible text.
  const text = (document.body?.innerText || '').replace(/ /g, ' ');
  const pm = text.match(/€\s?([\d.,]{5,})\s*(k\.k\.|v\.o\.n\.|kosten koper|vrij op naam)/i);
  const rm = text.match(/€\s?([\d.,]{3,6}?)(?:,-)?\s*(?:per maand|p\/m|\/\s?mnd|\/\s?maand|per month|\/month)/i);
  if (pm) { out.price = out.price || num(pm[1]); out.priceCond = /v\.o\.n|vrij/i.test(pm[2]) ? 'v.o.n.' : 'k.k.'; }
  else if (rm) { out.rent = num(rm[1]); out.price = null; }
  const grab = (re) => { const m = text.match(re); return m ? m[1] : null; };
  out.livingArea = out.livingArea
    || num(grab(/(?:Woonoppervlakte|Gebruiksoppervlakte wonen|\bWonen)\s*[:\n\t ]\s*([\d.]+)\s?m²/i))
    || num(grab(/([\d.]+)\s?m²\s*(?:wonen|woonoppervlakte)/i));
  out.plotArea = num(grab(/(?:Perceeloppervlakte|\bPerceel)\s*[:\n\t ]\s*([\d.]+)\s?m²/i));
  out.rooms = num(grab(/Aantal kamers\s*[:\n\t ]\s*(\d+)/i));
  out.energyLabel = grab(/Energielabel\s*[:\n\t ]\s*([A-G](?:\+{1,4})?)\b/);
  out.buildYear = num(grab(/Bouwjaar\s*[:\n\t ]\s*(\d{4})/i));
  // Time on market: "Aangeboden sinds 3 weken" / "6 maanden" / "12 september 2026" / "Vandaag".
  const since = grab(/(?:Aangeboden sinds|Listed since|Offered since)\s*[:\n\t ]\s*([^\n|]{3,40})/i);
  if (since) {
    const t = since.toLowerCase().trim();
    const n = Number((t.match(/\d+/) || [])[0]);
    const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    const dm = t.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (/vandaag|today/.test(t)) out.listedDays = 0;
    else if (dm && MONTHS.indexOf(dm[2]) >= 0) out.listedDays = Math.max(0, Math.round((Date.now() - new Date(Number(dm[3]), MONTHS.indexOf(dm[2]), Number(dm[1]))) / 864e5));
    else if (n && /dag|day/.test(t)) out.listedDays = n;
    else if (n && /we+k/.test(t)) out.listedDays = n * 7;
    else if (n && /maand|month/.test(t)) out.listedDays = n * 30;
    else if (/\d+\+?\s*(jaar|year)/.test(t)) out.listedDays = (n || 1) * 365;
    if (out.listedDays != null) out.listedText = since.trim();
  }
  // House type (for NVM figures per type).
  const ht = text.match(/\b(tussenwoning|hoekwoning|eindwoning|twee-onder-een-kap|2-onder-1-kap|halfvrijstaande woning|vrijstaande woning|geschakelde woning|appartement|bovenwoning|benedenwoning|portiekflat|portiekwoning|galerijflat|maisonnette|penthouse)\b/i);
  if (ht) {
    const t = ht[1].toLowerCase();
    out.houseType = /tussen/.test(t) ? 'tussen' : /hoek|eind/.test(t) ? 'hoek'
      : /twee|2-onder|halfvrij|geschakeld/.test(t) ? 'twee1kap' : /^vrijstaande/.test(t) ? 'vrijstaand' : 'appartement';
  } else if (/appartement|apartment/i.test(location.pathname)) out.houseType = 'appartement';
    // Listing status shown near the top of the page (badge next to the title/price).
  const top = (out.heading + ' ' + out.bodyStart.slice(0, 1500));
  const st = top.match(/\b(Verkocht onder voorbehoud|Verhuurd onder voorbehoud|Onder bod|Onder optie|Verkocht|Verhuurd|Under offer|Sold subject to contract|Sold)\b/i);
  if (st) {
    const t = st[1].toLowerCase();
    out.status = t.includes('voorbehoud') || t.includes('subject') ? 'sold (conditional)'
      : t.includes('bod') || t.includes('optie') || t.includes('offer') ? 'under offer'
      : t.startsWith('verhuurd') ? 'rented' : 'sold';
  }
  return out;
}

// ---------- WOZ (Kadaster WOZ-waardeloket) ----------
export async function woz(nummeraanduidingId) {
  const r = await fetch(`https://api.kadaster.nl/lvwoz/wozwaardeloket-api/v1/wozwaarde/nummeraanduiding/${nummeraanduidingId}`);
  if (!r.ok) throw new Error(`WOZ ${r.status}`);
  const j = await r.json();
  const values = (j.wozWaarden || [])
    .map((w) => ({ date: w.peildatum, year: Number(w.peildatum.slice(0, 4)), value: w.vastgesteldeWaarde }))
    .sort((a, b) => a.year - b.year);
  return { values, plot: j.wozObject?.grondoppervlakte ?? null };
}

// ---------- BAG (official floor area, use, building year) ----------
export async function bag(verblijfsobjectId) {
  const base = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections';
  const r = await fetch(`${base}/verblijfsobject/items?f=json&identificatie=${verblijfsobjectId}`);
  if (!r.ok) throw new Error(`BAG ${r.status}`);
  const p = (await r.json()).features?.[0]?.properties;
  if (!p) throw new Error('BAG object not found');
  let bouwjaar = null;
  const href = [].concat(p['pand.href'] || [])[0];
  if (href) {
    try { bouwjaar = (await (await fetch(`${href}${href.includes('?') ? '&' : '?'}f=json`)).json()).properties?.bouwjaar ?? null; } catch { /* ignore */ }
  }
  return { area: p.oppervlakte ?? null, use: p.gebruiksdoel ?? null, bouwjaar };
}

// ---------- CBS Kerncijfers wijken en buurten (latest non-missing value per field) ----------
export const CBS_FIELDS = [
  ['aantal_inwoners', 'Inhabitants', 'n'],
  ['gemiddelde_woningwaarde', 'Average WOZ value', 'k€'],
  ['percentage_koopwoningen', 'Owner-occupied homes', '%'],
  ['percentage_huishoudens_met_kinderen', 'Households with children', '%'],
  ['percentage_personen_65_jaar_en_ouder', 'Aged 65+', '%'],
  ['percentage_huishoudens_met_hoog_inkomen', 'Households with high income', '%'],
  ['percentage_huishoudens_met_laag_inkomen', 'Households with low income', '%'],
  ['percentage_woningen_met_zonnestroom', 'Homes with solar panels', '%'],
  ['gemiddeld_aardgasverbruik', 'Avg gas use per home', 'm³'],
  ['personenautos_per_huishouden', 'Cars per household', 'n'],
];
export const CBS_DIST = [
  ['grote_supermarkt_gemiddelde_afstand_in_km', 'Supermarket'],
  ['huisartsenpraktijk_gemiddelde_afstand_in_km', 'GP'],
  ['basisonderwijs_gemiddelde_afstand_in_km', 'Primary school'],
  ['kinderdagverblijf_gemiddelde_afstand_in_km', 'Daycare'],
  ['treinstation_gemiddelde_afstand_in_km', 'Train station'],
  ['oprit_hoofdverkeersweg_gemiddelde_afstand_in_km', 'Highway on-ramp'],
];
const CBS_YEARS = [2025, 2024, 2023];
const valid = (v) => typeof v === 'number' && v > -99990;

async function cbsArea(collection, field, code) {
  const rows = await Promise.all(CBS_YEARS.map(async (y) => {
    try {
      const r = await fetch(`https://api.pdok.nl/cbs/wijken-en-buurten-${y}/ogc/v1/collections/${collection}/items?f=json&${field}=${code}`);
      if (!r.ok) return null;
      return { y, p: (await r.json()).features?.[0]?.properties };
    } catch { return null; }
  }));
  const out = {};
  for (const [k] of [...CBS_FIELDS, ...CBS_DIST]) {
    for (const row of rows) {
      if (row?.p && valid(row.p[k])) { out[k] = { v: row.p[k], y: row.y }; break; }
    }
  }
  return out;
}

export async function cbs(loc) {
  const [buurt, gemeente] = await Promise.all([
    cbsArea('buurten', 'buurtcode', loc.buurtcode),
    cbsArea('gemeenten', 'gemeentecode', `GM${String(loc.gemeentecode).padStart(4, '0')}`),
  ]);
  return { buurt, gemeente };
}

// ---------- CBS house price index (PBK, quarterly; provinces + G4 cities) ----------
const G4 = { '0363': 'GM0363', '0518': 'GM0518', '0599': 'GM0599', '0344': 'GM0344' };
export async function priceIndex(loc) {
  const gm = String(loc.gemeentecode).padStart(4, '0');
  const region = G4[gm] || loc.provinciecode;
  if (!region) throw new Error('No region for price index');
  const params = new URLSearchParams({
    $filter: `startswith(RegioS,'${region}') and Perioden ge '2012KW01'`,
    $select: 'Perioden,PrijsindexVerkoopprijzen_1',
    $format: 'json',
  });
  const r = await fetch(`https://opendata.cbs.nl/ODataApi/OData/85792NED/TypedDataSet?${params}`);
  if (!r.ok) throw new Error(`CBS index ${r.status}`);
  const q = (await r.json()).value
    .filter((x) => /KW0\d$/.test(x.Perioden) && x.PrijsindexVerkoopprijzen_1 != null)
    .map((x) => ({ p: x.Perioden, v: x.PrijsindexVerkoopprijzen_1 }));
  return { region, regionName: G4[gm] ? loc.gemeentenaam : loc.provincienaam, quarters: q };
}

// Index level on 1 January of a year = average of Q4 of the previous year and Q1 of that year.
export function indexOnJan1(idx, year) {
  const get = (p) => idx.quarters.find((x) => x.p === p)?.v;
  const a = get(`${year - 1}KW04`), b = get(`${year}KW01`);
  if (a && b) return (a + b) / 2;
  return a || b || null;
}

export function estimateValue(res) {
  const last = res.woz?.values?.at(-1);
  const idx = res.index;
  if (!last || !idx?.quarters?.length) return null;
  const base = indexOnJan1(idx, last.year);
  const latest = idx.quarters.at(-1);
  if (!base) return null;
  const factor = latest.v / base;
  return {
    value: last.value * factor, factor, wozYear: last.year,
    latestPeriod: latest.p.replace('KW0', ' Q'), regionName: idx.regionName,
  };
}


// ---------- NVM regional market figures (bundled data/nvm.json, refreshed per quarter) ----------
export const HOUSE_TYPES = { tussen: 'Terraced (tussenwoning)', hoek: 'End-of-terrace (hoekwoning)', twee1kap: 'Semi-detached (2-onder-1-kap)', vrijstaand: 'Detached (vrijstaand)', appartement: 'Apartment', totaal: 'All homes' };
let NVM = null;
// Latest quarterly figures are published online; the copy bundled with the extension is the fallback.
export const NVM_URL = 'https://raw.githubusercontent.com/sasi2400/huisinzicht-data/main/data/nvm.json';
const qKey = (q) => (q || '').replace(/Q(\d) (\d{4})/, '$2$1');
async function loadNvm() {
  const bundled = await (await fetch(chrome.runtime.getURL('data/nvm.json'))).json();
  let cached = null;
  try { cached = (await chrome.storage.local.get('nvmCache')).nvmCache; } catch { /* no storage */ }
  if (!cached || Date.now() - cached.t > 864e5) {
    try {
      const r = await fetch(NVM_URL, { cache: 'no-cache' });
      if (r.ok) {
        const data = await r.json();
        if (data?.regions && data?.gemeenteToRegion) {
          cached = { t: Date.now(), data };
          try { await chrome.storage.local.set({ nvmCache: cached }); } catch { /* ignore */ }
        }
      }
    } catch { /* offline or not published: use what we have */ }
  }
  const remote = cached?.data;
  return remote && qKey(remote.quarter) >= qKey(bundled.quarter) ? remote : bundled;
}
export async function nvm(loc) {
  NVM ||= await loadNvm();
  const code = `GM${String(loc.gemeentecode).padStart(4, '0')}`;
  const region = NVM.gemeenteToRegion[code];
  if (!region) throw new Error('No NVM region for this municipality');
  return { region, quarter: NVM.quarter, periods: NVM.periods, data: NVM.regions[region].data };
}

// ---------- CBS average sale price per municipality (83625NED, yearly) ----------
export async function gemeentePrices(loc) {
  const code = `GM${String(loc.gemeentecode).padStart(4, '0')}`;
  const params = new URLSearchParams({ $filter: `startswith(RegioS,'${code}') or startswith(RegioS,'NL01')`, $format: 'json' });
  const r = await fetch(`https://opendata.cbs.nl/ODataApi/OData/83625NED/TypedDataSet?${params}`);
  if (!r.ok) throw new Error(`CBS prices ${r.status}`);
  const rows = (await r.json()).value.filter((x) => x.GemiddeldeVerkoopprijs_1 != null);
  const pick = (pre) => rows.filter((x) => x.RegioS.startsWith(pre)).map((x) => ({ year: Number(x.Perioden.slice(0, 4)), v: x.GemiddeldeVerkoopprijs_1 })).slice(-6);
  return { gemeente: pick(code), nl: pick('NL01') };
}

// ---------- Environment: RIVM (noise, air) + Klimaateffectatlas (flood, foundations, subsidence, heat) ----------
async function wmsPoint(base, layer, x, y) {
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', LAYERS: layer, QUERY_LAYERS: layer,
    SRS: 'EPSG:28992', BBOX: `${x - 5},${y - 5},${x + 5},${y + 5}`, WIDTH: '11', HEIGHT: '11', X: '5', Y: '5',
    INFO_FORMAT: 'application/json',
  });
  const r = await fetch(`${base}?${params}`);
  if (!r.ok) return null;
  const p = (await r.json()).features?.[0]?.properties;
  if (!p) return null;
  return p;
}
const RIVM = 'https://data.rivm.nl/geo/alo/wms';
const KEA = 'https://cas.cloud.sogelink.com/public/data/org/gws/YWFMLMWERURF/kea_public/wms';
const ENV_LAYERS = {
  noiseAll: [RIVM, 'rivm_Geluid_lden_allebronnen_actueel', 'GRAY_INDEX'],
  noiseRoad: [RIVM, 'rivm_Geluid_lden_wegverkeer_actueel', 'GRAY_INDEX'],
  noiseRail: [RIVM, 'rivm_Geluid_lden_treinverkeer_actueel', 'GRAY_INDEX'],
  noiseAir: [RIVM, 'rivm_20241201_Geluid_lden_vliegverkeer_2022', 'GRAY_INDEX'],
  no2: [RIVM, 'rivm_jaargemiddeld_NO2_actueel', 'GRAY_INDEX'],
  pm25: [RIVM, 'rivm_jaargemiddeld_PM25_actueel', 'GRAY_INDEX'],
  floodClass: [KEA, 'plaatsgebonden_overstromingskans_huidig_50_cm_20251120', 'GRAY_INDEX'],
  floodDepth: [KEA, 'maximale_waterdiepte_nederland_kleine_kans_20260128', 'GRAY_INDEX'],
  pileRotPct: [KEA, 'risicopaalrot_huidig', 'no_cc_risi'],
  settlementPct: [KEA, 'risicoverschilzetting_2050hoog', 'sterke_c_1'],
  subsidence: [KEA, 'nl_bodemdaling_totaal_v20260623', 'snelheid'],
  heatIsland: [KEA, 'hitteeiland', 'GRAY_INDEX'],
};
export async function environment(x, y) {
  const entries = await Promise.all(Object.entries(ENV_LAYERS).map(async ([k, [base, layer, field]]) => {
    try {
      const p = await wmsPoint(base, layer, x, y);
      const v = p?.[field];
      return [k, typeof v === 'number' && v > -9000 ? v : null];
    } catch { return [k, null]; }
  }));
  return Object.fromEntries(entries);
}

// ---------- Crime: police registrations per buurt / gemeente (CBS dataderden 47018NED, yearly) ----------
export const CRIME = [
  ['0.0.0', 'All registered crime'],
  ['1.1.1', 'Home burglary'],
  ['1.2.3', 'Bike / moped theft'],
  ['violence', 'Violence (assault, threats, robbery)'],
  ['2.2.1', 'Vandalism'],
];
const VIOLENCE = ['1.4.3', '1.4.4', '1.4.5', '1.4.6', '1.4.7'];
export async function crime(loc) {
  const codes = ['0.0.0', '1.1.1', '1.2.3', '2.2.1', ...VIOLENCE];
  const gm = `GM${String(loc.gemeentecode).padStart(4, '0')}`;
  const areas = [loc.buurtcode, gm, 'NL00'];
  const cat = codes.map((c) => `SoortMisdrijf eq '${c} '`).join(' or ');
  const reg = areas.map((a) => `startswith(WijkenEnBuurten,'${a}')`).join(' or ');
  const out = {};
  for (const year of [2025, 2024]) {
    const params = new URLSearchParams({ $filter: `(${reg}) and (${cat}) and Perioden eq '${year}JJ00'`, $select: 'SoortMisdrijf,WijkenEnBuurten,GeregistreerdeMisdrijven_1', $format: 'json' });
    const r = await fetch(`https://dataderden.cbs.nl/ODataApi/OData/47018NED/TypedDataSet?${params}`);
    if (!r.ok) continue;
    const rows = (await r.json()).value;
    if (!rows.some((x) => x.WijkenEnBuurten.trim() === loc.buurtcode && x.GeregistreerdeMisdrijven_1 != null)) continue;
    for (const a of areas) {
      const get = (c) => rows.find((x) => x.WijkenEnBuurten.trim() === a && x.SoortMisdrijf.trim() === c)?.GeregistreerdeMisdrijven_1 ?? null;
      const o = {};
      for (const [c] of CRIME) o[c] = c === 'violence' ? VIOLENCE.reduce((s, v) => s + (get(v) || 0), 0) : get(c);
      out[a === loc.buurtcode ? 'buurt' : a === gm ? 'gemeente' : 'nl'] = o;
    }
    out.year = year;
    break;
  }
  if (!out.year) throw new Error('No crime data');
  return out;
}
export const NL_POPULATION = 18_000_000; // approx. inhabitants 2025, only used for the national rate

export async function lookupFromTab(tab) {
  let addr = null;
  let page = {};
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapeListingPage });
    page = result || {};
    addr = addressFromPageText(page.heading, page.bodyStart);
  } catch { /* page not ready or not scriptable: fall back to the URL */ }
  // tab.address: typed address from the phone web app (no listing page to read).
  const fromUrl = tab.address || addressFromUrl(tab.url);
  if (!addr && !fromUrl) throw new Error('Could not read an address from this page.');
  let loc;
  try {
    loc = await geocode(addr || fromUrl);
  } catch (e) {
    if (addr && fromUrl) loc = await geocode(fromUrl); else throw e;
  }
  const [lbm, wozR, bagR, cbsR, idxR, nvmR, gpR, envR, crimeR] = await Promise.allSettled([
    leefbaarometer(loc.x, loc.y),
    woz(loc.nummeraanduiding_id),
    bag(loc.adresseerbaarobject_id),
    cbs(loc),
    priceIndex(loc),
    nvm(loc),
    gemeentePrices(loc),
    environment(loc.x, loc.y),
    crime(loc),
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  if (lbm.status === 'rejected' && !val(wozR)) throw lbm.reason;
  return {
    url: tab.url, site: siteFor(tab.url)?.name, loc, page, fetchedAt: Date.now(),
    approximate: !addr && !/\d/.test((fromUrl?.street) || ''),
    data: val(lbm), lbmError: lbm.reason?.message,
    woz: val(wozR), bag: val(bagR), cbs: val(cbsR), index: val(idxR),
    nvm: val(nvmR), gemeentePrices: val(gpR), env: val(envR), crime: val(crimeR),
  };
}

// ---------- Overbid estimate for one listing ----------
// Blend of three signals, each turned into "% above asking", then a time-on-market correction.
// Weights are a transparent rule of thumb, not a fitted model.
export function overbidEstimate({ price, area, est, nvm: n, type, listedDays }) {
  if (!price) return null;
  const clamp = (v) => Math.max(-10, Math.min(20, v));
  const parts = [];
  const t = type && n?.data?.overbidPct?.[type] ? type : 'totaal';
  if (n?.data?.overbidPct?.[t]) {
    parts.push({ key: 'nvm', label: `NVM ${n.region}, ${t === 'totaal' ? 'all homes' : HOUSE_TYPES[t].split(' (')[0].toLowerCase()}`, value: n.data.overbidPct[t].at(-1), weight: 0.4,
      note: `${n.data.aboveAskingPct?.[t]?.at(-1)}% of these sell above asking` });
  }
  if (est?.value) {
    parts.push({ key: 'woz', label: 'WOZ value brought to today', value: clamp((est.value / price - 1) * 100), weight: 0.35,
      note: `estimate ${Math.round(est.value / 1000)}k vs asking ${Math.round(price / 1000)}k` });
  }
  const m2 = n?.data?.pricePerM2?.[t]?.at(-1);
  if (area && m2) {
    parts.push({ key: 'm2', label: 'Size × regional sale price per m²', value: clamp((area * m2 / price - 1) * 100), weight: 0.25,
      note: `${area} m² × €${Math.round(m2).toLocaleString('nl-NL')}/m²` });
  }
  if (!parts.length) return null;
  const wsum = parts.reduce((s, p) => s + p.weight, 0);
  parts.forEach((p) => { p.w = p.weight / wsum; });
  let value = parts.reduce((s, p) => s + p.w * p.value, 0);
  const sd = Math.sqrt(parts.reduce((s, p) => s + p.w * (p.value - value) ** 2, 0));
  let tom = null;
  if (listedDays != null) {
    // NVM Q3 2026: homes that take 1-2 quarters to sell go for 1.8% below asking, longer ones 2.9% below.
    const target = listedDays > 180 ? -2.9 : listedDays > 90 ? -1.8 : null;
    if (target != null) {
      const before = value;
      value = Math.min(value, 0.5 * value + 0.5 * target);
      tom = { days: listedDays, target, shift: value - before };
    } else tom = { days: listedDays, target: null, shift: 0 };
  }
  const half = Math.max(1.5, sd);
  return { value, low: value - half, high: value + half, parts, tom, price: price * (1 + value / 100),
    priceLow: price * (1 + (value - half) / 100), priceHigh: price * (1 + (value + half) / 100) };
}

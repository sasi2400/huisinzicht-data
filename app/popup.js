import {
  isListing, lookupFromTab, SCORE_CLASSES, DIV_COLORS, DIMENSIONS, YEARS, LATEST, divLabel, devLabel, scoreClass, CBS_FIELDS, CBS_DIST, estimateValue, HOUSE_TYPES, CRIME, NL_POPULATION, overbidEstimate,
} from './lib.js';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const textOn = (k) => (k >= 7 || k <= 2 ? '#fff' : '#1d2420');

function pill(k, color, title) {
  if (!k) return '<span class="muted">–</span>';
  return `<span class="pill" style="background:${color};color:${textOn(k)}" title="${esc(title)}">${k}</span>`;
}

function bar(v) {
  // Dimension contribution, roughly -0.15..+0.15 around the national average.
  const clamp = Math.max(-0.15, Math.min(0.15, v || 0));
  const w = (Math.abs(clamp) / 0.15) * 50;
  const left = clamp >= 0 ? 50 : 50 - w;
  const color = clamp >= 0 ? '#96A04A' : '#D66982';
  return `<span class="bar"><span class="fill" style="left:${left}%;width:${w}%;background:${color}"></span><span class="mid"></span></span>`;
}

function sparkline(series) {
  // series: [{label, values:[{yy, v}]}]
  const W = 348, H = 90, P = { l: 26, r: 8, t: 8, b: 16 };
  const all = series.flatMap((s) => s.values.map((p) => p.v)).filter((v) => v != null);
  if (all.length < 2) return '';
  const min = Math.min(...all) - 0.01, max = Math.max(...all) + 0.01;
  const xs = (i) => P.l + (i / (YEARS.length - 1)) * (W - P.l - P.r);
  const ys = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const colors = ['#3c5941', '#c07a3a'];
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Score history">`;
  // national class thresholds as faint gridlines (2024 legend): Voldoende / Goed / Uitstekend
  for (const [t, name] of [[3.9552, 'voldoende'], [4.1126, 'goed'], [4.2689, 'uitstekend']]) {
    if (t > min && t < max) svg += `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(t)}" y2="${ys(t)}" stroke="currentColor" stroke-opacity=".15" stroke-dasharray="2 3"/><text x="${W - P.r}" y="${ys(t) - 2}" text-anchor="end">${name}</text>`;
  }
  YEARS.forEach((yy, i) => { svg += `<text x="${xs(i)}" y="${H - 3}" text-anchor="middle">'${yy}</text>`; });
  series.forEach((s, si) => {
    const pts = s.values.map((p, i) => (p.v == null ? null : [xs(i), ys(p.v)])).filter(Boolean);
    svg += `<polyline fill="none" stroke="${colors[si]}" stroke-width="2" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
    pts.forEach(([x, y]) => { svg += `<circle cx="${x}" cy="${y}" r="2.2" fill="${colors[si]}"/>`; });
  });
  svg += '</svg>';
  const legend = series.map((s, i) => `<span style="color:${colors[i]}">●</span> ${esc(s.label)}`).join(' &nbsp; ');
  return `${svg}<div class="small muted">${legend}</div>`;
}

const eur = (v) => (v == null ? '–' : '€ ' + Math.round(v).toLocaleString('nl-NL'));
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
const dec = (v, n = 1) => v.toFixed(n).replace('.', ',');
const row = (k, v, note = '') => `<tr><td>${k}</td><td class="num">${v}${note ? `<div class="note">${note}</div>` : ''}</td></tr>`;
const k1000 = (v) => Math.round(v / 1000) * 1000;

// ---------- derived numbers used by several tabs ----------
function facts(res) {
  const { page = {}, woz, bag } = res;
  const area = page.livingArea || bag?.area;
  const last = woz?.values?.at(-1);
  const first = woz?.values?.[0];
  const nb = res.cbs?.buurt?.gemiddelde_woningwaarde;
  const data = res.data;
  const grid = data?.[`clippedgridscore${LATEST}`];
  const buurt = data?.[`buurtscore${LATEST}`];
  const est = estimateValue(res);
  const n = res.nvm;
  const type = page.houseType || (/appartement|apartment/i.test(res.url || '') ? 'appartement' : null);
  const nvmFor = (t) => (n?.data?.overbidPct?.[t] ? {
    type: t, overbid: n.data.overbidPct[t].at(-1), above: n.data.aboveAskingPct?.[t]?.at(-1),
    days: n.data.daysToSell?.[t]?.at(-1), perM2: n.data.pricePerM2?.[t]?.at(-1),
  } : null);
  const nv = n ? { ...(nvmFor(type) || nvmFor('totaal')), region: n.region, quarter: n.quarter, total: nvmFor('totaal') } : null;
  return { page, woz, bag, area, last, first, nb, data, grid, buurt, main: grid || buurt, price: page.price, rent: page.rent, est, nv,
    ob: page.rent ? null : overbidEstimate({ price: page.price, area, est, nvm: n, type, listedDays: page.listedDays }) };
}

// ---------- Overview tab: tiles + charts only ----------
function tile(label, value, sub = '', style = '') {
  return `<div class="tile" style="${style}"><div class="tlabel">${label}</div><div class="tvalue">${value}</div><div class="tsub">${sub}</div></div>`;
}

function tilesHtml(f) {
  const t = [];
  if (f.main) {
    const c = SCORE_CLASSES[f.main.kscore];
    t.push(tile('Liveability', `${f.main.kscore}<span class="of">/9</span>`, esc(c?.en), `background:${c?.color};color:${textOn(f.main.kscore)}`));
  }
  if (f.rent && f.area) t.push(tile('Rent per m²', `€ ${dec(f.rent / f.area, 2)}`, `${eur(f.rent)} / month · ${f.area} m²`));
  else if (f.price && f.area) t.push(tile('Price per m²', eur(f.price / f.area), `${eur(f.price)} · ${f.area} m²`));
  else if (f.area) t.push(tile('Living area', `${f.area} m²`, 'price not found on page'));
  if (f.est && !f.rent) {
    t.push(tile('Estimated value now', eur(k1000(f.est.value)), `WOZ ${f.est.wozYear} + ${pct((f.est.factor - 1) * 100)} market (${esc(f.est.regionName)})`));
  }
  if (f.nv && !f.rent) {
    const typeName = f.nv.type === 'totaal' ? 'all homes' : HOUSE_TYPES[f.nv.type].split(' (')[0].toLowerCase();
    const hot = f.nv.overbid >= 4 ? 'background:var(--hot-bg);color:var(--hot-fg);border-color:var(--hot-line)' : '';
    t.push(tile('Typical overbid here', `${f.nv.overbid > 0 ? '+' : ''}${dec(f.nv.overbid)}%`,
      `region average · ${typeName}, ${esc(f.nv.region)} ${esc(f.nv.quarter)} · ${f.nv.above}% above asking`, hot));
  }
  if (!f.nv && f.last) t.push(tile(`WOZ ${f.last.year}`, eur(f.last.value), f.area ? `${eur(f.last.value / f.area)} per m²` : ''));
  if (f.rent && f.last) t.push(tile('Gross yield', `${dec((f.rent * 12) / f.last.value * 100)}%`, 'annual rent ÷ WOZ'));
  return `<div class="tiles">${t.join('')}</div>`;
}

function driversChart(main) {
  // Horizontal diverging bars: contribution of each dimension vs the Dutch average.
  const W = 348, rowH = 20, H = DIMENSIONS.length * rowH + 14, x0 = 150, half = (W - x0 - 6) / 2, mid = x0 + half;
  const lim = Math.max(0.1, ...DIMENSIONS.map((d) => Math.abs(main[d.key] || 0)));
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Liveability drivers">`;
  svg += `<line x1="${mid}" x2="${mid}" y1="0" y2="${H - 12}" stroke="currentColor" stroke-opacity=".35"/>`;
  DIMENSIONS.forEach((d, i) => {
    const v = main[d.key] || 0, w = (Math.abs(v) / lim) * half, y = i * rowH + 3;
    const k = main['k' + d.key];
    svg += `<text class="lbl" x="0" y="${y + 11}">${esc(d.en)}</text>`;
    svg += `<rect x="${v >= 0 ? mid : mid - w}" y="${y}" width="${Math.max(w, 1.5)}" height="13" rx="3" fill="${k && k !== 5 ? DIV_COLORS[k] : (v >= 0 ? '#B5BE7E' : '#E5A9B4')}"><title>${esc(d.nl)}: ${divLabel(k)} (${v.toFixed(3)})</title></rect>`;
  });
  svg += `<text x="${x0}" y="${H - 1}">worse than NL avg</text><text x="${W - 6}" y="${H - 1}" text-anchor="end">better</text></svg>`;
  return svg;
}

function compareChart(cbsR) {
  const b = cbsR?.buurt, g = cbsR?.gemeente;
  const keys = [
    ['percentage_koopwoningen', 'Owner-occupied'], ['percentage_huishoudens_met_kinderen', 'With children'],
    ['percentage_personen_65_jaar_en_ouder', 'Aged 65+'], ['percentage_huishoudens_met_hoog_inkomen', 'High income'],
    ['percentage_huishoudens_met_laag_inkomen', 'Low income'], ['percentage_woningen_met_zonnestroom', 'Solar panels'],
  ].filter(([k]) => b?.[k]);
  if (!keys.length) return '';
  const W = 348, rowH = 22, H = keys.length * rowH + 4, x0 = 104, span = W - x0 - 34;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Buurt vs gemeente">`;
  keys.forEach(([k, label], i) => {
    const y = i * rowH + 2, bv = b[k].v, gv = g?.[k]?.v;
    svg += `<text class="lbl" x="0" y="${y + 13}">${label}</text>`;
    svg += `<rect x="${x0}" y="${y + 2}" width="${(bv / 100) * span}" height="9" rx="2" fill="#3c5941"><title>Buurt: ${bv}%</title></rect>`;
    if (gv != null) svg += `<rect x="${x0}" y="${y + 13}" width="${(gv / 100) * span}" height="5" rx="2" fill="#c07a3a" opacity=".8"><title>Gemeente: ${gv}%</title></rect>`;
    svg += `<text x="${x0 + (bv / 100) * span + 4}" y="${y + 10}">${bv}%</text>`;
  });
  svg += '</svg>';
  return `${svg}<div class="small muted"><span style="color:#3c5941">■</span> buurt &nbsp; <span style="color:#c07a3a">■</span> gemeente</div>`;
}

function historySeries(f) {
  const hist = (prefix) => YEARS.map((yy) => ({ yy, v: f.data?.[`${prefix}${yy}`]?.lbm ?? null }));
  const s = [];
  if (f.grid) s.push({ label: '100 m grid', values: hist('clippedgridscore') });
  if (f.buurt) s.push({ label: `Buurt ${f.buurt.name}`, values: hist('buurtscore') });
  return s;
}

function overviewHtml(res) {
  const f = facts(res);
  return `
    ${tilesHtml(f)}
    ${f.nv ? `<h2>Overbid by house type · ${esc(f.nv.region)} ${esc(f.nv.quarter)}</h2>${overbidChart(res.nvm, f.nv.type)}` : ''}
    ${f.main ? `<h2>What drives liveability here</h2>${driversChart(f.main)}` : ''}
    ${f.woz?.values?.length > 1 ? `<h2>WOZ value ${f.first.year}–${f.last.year}</h2>${wozChart(f.woz.values)}` : ''}
    ${f.data ? `<h2>Liveability 2002–2024</h2>${sparkline(historySeries(f))}` : ''}
    ${res.cbs?.buurt ? `<h2>Who lives here: buurt vs gemeente</h2>${compareChart(res.cbs)}` : ''}`;
}


function overbidChart(n, highlight) {
  const types = ['tussen', 'hoek', 'twee1kap', 'vrijstaand', 'appartement', 'totaal'].filter((t) => n.data.overbidPct?.[t]);
  const W = 348, rowH = 20, H = types.length * rowH + 4, x0 = 112, mid = x0 + 30, span = W - mid - 96;
  const max = Math.max(5, ...types.map((t) => Math.abs(n.data.overbidPct[t].at(-1))));
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Overbid by house type">`;
  svg += `<line x1="${mid}" x2="${mid}" y1="0" y2="${H}" stroke="currentColor" stroke-opacity=".3"/>`;
  types.forEach((t, i) => {
    const v = n.data.overbidPct[t].at(-1), prev = n.data.overbidPct[t][0], y = i * rowH + 3;
    const w = (Math.abs(v) / max) * span, hl = t === highlight;
    svg += `<text class="lbl" x="0" y="${y + 11}" style="font-weight:${hl ? 700 : 400}">${esc(HOUSE_TYPES[t].split(' (')[0])}</text>`;
    svg += `<rect x="${v >= 0 ? mid : mid - w}" y="${y}" width="${Math.max(w, 1.5)}" height="13" rx="3" fill="${hl ? '#c07a3a' : v >= 0 ? '#B5BE7E' : '#E5A9B4'}"><title>${HOUSE_TYPES[t]}: ${v}% (a year earlier ${prev}%)</title></rect>`;
    svg += `<text x="${(v >= 0 ? mid + w : mid) + 4}" y="${y + 11}">${v > 0 ? '+' : ''}${String(v).replace('.', ',')}% · ${n.data.aboveAskingPct?.[t]?.at(-1)}% above</text>`;
  });
  return `${svg}</svg><div class="small muted">Average sale price vs last asking price (NVM). Orange = this listing's type.</div>`;
}

function lineChart(series, { yFmt = (v) => v, labels = [] } = {}) {
  const W = 348, H = 100, P = { l: 4, r: 4, t: 12, b: 16 };
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return '';
  const min = Math.min(...all), max = Math.max(...all), n = Math.max(...series.map((s) => s.values.length));
  const xs = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const ys = (v) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;
  labels.forEach((l, i) => { if (l) svg += `<text x="${xs(i)}" y="${H - 3}" text-anchor="middle">${l}</text>`; });
  series.forEach((s) => {
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${s.values.map((v, i) => `${xs(i)},${ys(v)}`).join(' ')}"/>`;
    const lv = s.values.at(-1);
    svg += `<text x="${W - P.r}" y="${ys(lv) - 4}" text-anchor="end">${yFmt(lv)}</text>`;
  });
  return `${svg}</svg>`;
}

// ---------- Market tab ----------
function highlightHtml(res) {
  const f = facts(res);
  const o = f.ob;
  if (!o) return '';
  const sign = (v) => `${v > 0 ? '+' : ''}${dec(v)}%`;
  return `<button class="highlight" data-goto="market" title="How this is estimated: Market tab">
      <span class="hl-label">Expected overbid</span>
      <span class="hl-value">${sign(o.value)}</span>
      <span class="hl-price">≈ ${eur(k1000(o.price))}<span class="hl-range">${eur(k1000(o.priceLow))} – ${eur(k1000(o.priceHigh))}</span></span>
    </button>`;
}

function estimateBlock(f) {
  const o = f.ob;
  if (!o) return f.rent ? '' : '<p class="muted small">No overbid estimate: asking price not found on the page.</p>';
  const sign = (v) => `${v > 0 ? '+' : ''}${dec(v)}%`;
  // range bar from -10% to +20%
  const X = (v) => ((Math.max(-10, Math.min(20, v)) + 10) / 30) * 100;
  const bar = `<div class="obbar"><span class="obzero" style="left:${X(0)}%"></span>
    <span class="obrange" style="left:${X(o.low)}%;width:${X(o.high) - X(o.low)}%"></span>
    <span class="obdot" style="left:${X(o.value)}%"></span></div>
    <div class="obaxis small muted"><span>−10%</span><span style="left:${X(0)}%">asking</span><span>+20%</span></div>`;
  const parts = o.parts.map((p) => `<tr><td>${esc(p.label)}<div class="note" style="text-align:left;margin:0">${esc(p.note)}</div></td>
    <td class="num">${sign(p.value)}</td><td class="num small muted">${Math.round(p.w * 100)}%</td></tr>`).join('');
  const tom = o.tom ? `<tr><td>Time on market<div class="note" style="text-align:left;margin:0">listed ${esc(f.page.listedText || o.tom.days + ' days')}${o.tom.target != null ? ` · long-listed homes sell ~${dec(-o.tom.target)}% below asking (NVM)` : ' · no correction'}</div></td>
    <td class="num">${o.tom.shift ? sign(o.tom.shift) : '0'}</td><td></td></tr>` : '<tr><td colspan="3" class="small muted">Listing date not found on the page: no time-on-market correction.</td></tr>';
  return `<div class="obcard">
      <div class="small muted">Overbid estimate for this home</div>
      <div class="obbig">${sign(o.value)} <span class="small muted">range ${sign(o.low)} to ${sign(o.high)}</span></div>
      ${bar}
      <table>
        ${row('Expected sale price', `<b>${eur(k1000(o.price))}</b>`, `${eur(k1000(o.priceLow))} – ${eur(k1000(o.priceHigh))}`)}
        ${row('Asking price', eur(f.price))}
      </table>
    </div>
    <h2>How the estimate is built</h2>
    <table><tr><td></td><td class="num small muted">says</td><td class="num small muted">weight</td></tr>${parts}${tom}</table>
    <p class="small muted">Rule of thumb, not a valuation. The range widens when the three signals disagree. Real bids also depend on the
      condition, the agent's pricing strategy (low asking = more overbid) and the number of viewers, which no data source captures.</p>`;
}

function marketHtml(res) {
  const f = facts(res);
  const n = res.nvm;
  let html = estimateBlock(f);
  if (n) {
    const types = ['tussen', 'hoek', 'twee1kap', 'vrijstaand', 'appartement', 'totaal'].filter((t) => n.data.overbidPct?.[t]);
    const v = (k, t, i = -1) => n.data[k]?.[t]?.at(i);
    const [p0, , p2] = n.periods;
    html += `<h2>NVM ${esc(n.region)} · ${esc(n.quarter)}</h2>
      <div class="tablewrap"><table class="grid">
      <tr><td></td><td class="num small muted">overbid</td><td class="num small muted">above ask</td><td class="num small muted">sale €/m²</td><td class="num small muted">days</td></tr>
      ${types.map((t) => `<tr class="${t === f.nv?.type ? 'hl' : ''}"><td>${esc(HOUSE_TYPES[t].split(' (')[0])}</td>
        <td class="num"><b>${v('overbidPct', t) > 0 ? '+' : ''}${dec(v('overbidPct', t))}%</b><div class="note">${p0}: ${dec(v('overbidPct', t, 0))}%</div></td>
        <td class="num">${v('aboveAskingPct', t)}%</td>
        <td class="num">${eur(v('pricePerM2', t))}</td>
        <td class="num">${v('daysToSell', t)}</td></tr>`).join('')}
      </table></div>
      <table>
        ${row('Average sale price (all homes)', eur(v('price', 'totaal') * 1000), `${p0}: ${eur(v('price', 'totaal', 0) * 1000)}`)}
        ${row('Homes sold this quarter', Math.round(v('sold', 'totaal')).toLocaleString('nl-NL'), `for sale: ${Math.round(v('forSale', 'totaal')).toLocaleString('nl-NL')}`)}
        ${row('Scarcity indicator', dec(v('scarcity', 'totaal')), 'months of supply; below 5 = sellers’ market')}
        ${f.area && f.price ? row('This listing per m² vs region sales', pct((f.price / f.area / v('pricePerM2', f.nv?.type || 'totaal') - 1) * 100), `region ${eur(v('pricePerM2', f.nv?.type || 'totaal'))}/m² (${esc(HOUSE_TYPES[f.nv?.type || 'totaal'].split(' (')[0].toLowerCase())})`) : ''}
      </table>
      <p class="small muted">Source: NVM / Brainbay market overview per COROP region (${esc(p2)}). Covers sales by NVM agents (~70% of the market).</p>`;
  }
  const idx = res.index;
  if (idx?.quarters?.length) {
    const q = idx.quarters.filter((x) => x.p >= '2015KW01');
    html += `<h2>House price index · ${esc(idx.regionName)} (CBS)</h2>
      ${lineChart([{ values: q.map((x) => x.v), color: '#3c5941' }], { yFmt: (v) => dec(v), labels: q.map((x) => (x.p.endsWith('KW01') && Number(x.p.slice(2, 4)) % 2 ? `'${x.p.slice(2, 4)}` : '')) })}
      <div class="small muted">2020 = 100, quarterly, sale prices of existing homes. Latest ${esc(q.at(-1).p.replace('KW0', ' Q'))}.</div>`;
  }
  const gp = res.gemeentePrices;
  if (gp?.gemeente?.length) {
    html += `<h2>Average sale price per year (CBS)</h2><table>
      <tr><td></td><td class="num small muted">${esc(res.loc.gemeentenaam)}</td><td class="num small muted">Netherlands</td></tr>
      ${gp.gemeente.slice().reverse().map((g) => `<tr><td>${g.year}</td><td class="num">${eur(g.v)}</td><td class="num small muted">${eur(gp.nl.find((x) => x.year === g.year)?.v)}</td></tr>`).join('')}
    </table><p class="small muted">Small municipalities jump around year to year because the mix of homes sold changes.</p>`;
  }
  return html || '<p class="muted">No market data.</p>';
}

// ---------- Environment & risk + crime (Area tab) ----------
const FLOOD = [null, 'Extremely small (<1/30,000 yr)', 'Very small (1/3,000–1/30,000 yr)', 'Small (1/300–1/3,000 yr)', 'Medium (1/30–1/300 yr)', 'Large (>1/30 yr)'];
const riskWord = (v, cuts) => ['Very low', 'Low', 'Moderate', 'High', 'Very high'][cuts.filter((c) => v > c).length];
function envHtml(res) {
  const e = res.env;
  if (!e) return '';
  const db = (v) => (v == null ? '–' : `${Math.round(v)} dB`);
  const noiseWord = (v) => (v == null ? '' : v < 45 ? 'quiet' : v < 50 ? 'fairly quiet' : v < 55 ? 'moderate' : v < 60 ? 'loud' : v < 65 ? 'very loud' : 'extremely loud');
  const rows = [
    row('Noise, all sources', `${db(e.noiseAll)}`, `${noiseWord(e.noiseAll)} · road ${db(e.noiseRoad)}, rail ${db(e.noiseRail)}, air ${db(e.noiseAir)} (Lden)`),
    e.no2 != null ? row('NO₂ (air)', `${dec(e.no2)} µg/m³`, `WHO guideline 10 · EU limit 40`) : '',
    e.pm25 != null ? row('Fine particles PM2.5', `${dec(e.pm25)} µg/m³`, `WHO guideline 5 · EU limit 25`) : '',
    e.floodClass ? row('Flood chance (> 50 cm water)', esc(FLOOD[e.floodClass] || '–'), e.floodDepth != null ? `max. depth in a rare flood: ${dec(e.floodDepth)} m` : '') : '',
    e.pileRotPct != null ? row('Foundation: pile-rot risk', riskWord(e.pileRotPct, [0.8, 3, 6, 15]), `${dec(e.pileRotPct)}% of buildings in the buurt at risk`) : '',
    e.settlementPct != null ? row('Foundation: uneven settlement 2050', riskWord(e.settlementPct, [1, 5, 10, 25]), `${dec(e.settlementPct)}% of buildings, high-climate scenario`) : '',
    e.subsidence != null ? row('Ground subsidence', `${dec(e.subsidence)} mm/yr`, 'satellite measured') : '',
    e.heatIsland != null ? row('Urban heat island', `+${dec(e.heatIsland)} °C`, 'warmer than surrounding countryside') : '',
  ].join('');
  return `<h2>Environment & risk</h2><table>${rows}</table>
    <p class="small muted">Sources: RIVM Atlas Leefomgeving (noise, air), Klimaateffectatlas (flood, foundations, subsidence, heat). Foundation risk is per buurt, not this building.</p>`;
}

function crimeHtml(res) {
  const c = res.crime, b = res.cbs?.buurt, g = res.cbs?.gemeente;
  if (!c?.buurt) return '';
  const popB = b?.aantal_inwoners?.v, popG = g?.aantal_inwoners?.v;
  const rate = (n, pop) => (n == null || !pop ? '–' : dec((n / pop) * 1000));
  const rows = CRIME.map(([k, label]) => `<tr><td>${label}</td><td class="num">${rate(c.buurt[k], popB)}</td><td class="num small muted">${rate(c.gemeente?.[k], popG)}</td><td class="num small muted">${rate(c.nl?.[k], NL_POPULATION)}</td></tr>`).join('');
  return `<h2>Crime ${c.year} · per 1,000 inhabitants</h2>
    <table><tr><td></td><td class="num small muted">Buurt</td><td class="num small muted">Gemeente</td><td class="num small muted">NL</td></tr>${rows}</table>
    <p class="small muted">Police registrations (data.politie.nl via CBS). Buurt: ${c.buurt['0.0.0']} registered crimes in ${c.year}. Busy centres and shopping areas score high because of visitors.</p>`;
}

// ---------- Value tab ----------
function valueHtml(res) {
  const f = facts(res);
  const { page, bag, woz, area, last, first, nb, price, rent } = f;
  const areaSrc = page.livingArea ? (res.site || 'listing') : 'BAG';
  const rows = [];
  if (rent) rows.push(row('Rent', `<b>${eur(rent)}</b>`, 'per month'));
  else rows.push(row('Asking price', price ? `<b>${eur(price)}</b>` : '<span class="muted">not found on page</span>', price ? esc(page.priceCond || '') : ''));
  if (area) rows.push(row('Living area', `${area} m²`, page.livingArea && bag?.area && bag.area !== page.livingArea ? `BAG: ${bag.area} m²` : areaSrc));
  if (price && area) rows.push(row('<b>Asking price per m²</b>', `<b>${eur(price / area)}</b>`));
  if (rent && area) rows.push(row('<b>Rent per m²</b>', `<b>€ ${dec(rent / area, 2)}</b>`, 'per month'));
  if (rent && last) rows.push(row('Gross yield vs WOZ', `${dec((rent * 12) / last.value * 100)}%`, 'annual rent ÷ WOZ'));
  if (last) rows.push(row(`WOZ value (1 Jan ${last.year})`, eur(last.value)));
  if (last && area) rows.push(row('WOZ per m²', eur(last.value / area)));
  if (price && last) rows.push(row('Asking vs WOZ', pct((price / last.value - 1) * 100), `${dec(price / last.value, 2)}× WOZ`));
  if (last && first && last.year > first.year) {
    const cagr = (Math.pow(last.value / first.value, 1 / (last.year - first.year)) - 1) * 100;
    rows.push(row(`WOZ growth ${first.year}–${last.year}`, pct((last.value / first.value - 1) * 100), `${dec(cagr)}%/yr`));
  }
  const est = f.est;
  if (est) {
    rows.push(row('<b>Estimated value now</b>', `<b>${eur(k1000(est.value))}</b>`, `WOZ × ${dec(est.factor, 3)}`));
    rows.push(row('Market change since WOZ date', pct((est.factor - 1) * 100), `CBS index ${esc(est.regionName)}, 1 Jan ${est.wozYear} → ${esc(est.latestPeriod)}`));
    if (price) rows.push(row('<b>Implied bid vs asking</b>', `<b>${pct((est.value / price - 1) * 100)}</b>`, 'estimate ÷ asking'));
    if (area) rows.push(row('Estimated value per m²', eur(est.value / area)));
  }
  if (last && nb) rows.push(row('vs. buurt avg WOZ', pct((last.value / (nb.v * 1000) - 1) * 100), `buurt avg ${eur(nb.v * 1000)} (${nb.y})`));
  const bouwjaar = page.buildYear || bag?.bouwjaar;
  if (bouwjaar) rows.push(row('Build year', bouwjaar));
  const plot = page.plotArea || woz?.plot;
  if (plot) rows.push(row('Plot', `${plot} m²`));
  if (page.rooms) rows.push(row('Rooms', page.rooms));
  if (page.energyLabel) rows.push(row('Energy label', esc(page.energyLabel)));
  if (bag?.use) rows.push(row('Registered use (BAG)', esc(bag.use)));
  const wozRows = (woz?.values || []).slice().reverse().map((v, i, a) => {
    const prev = a[i + 1];
    return `<tr><td>1 Jan ${v.year}</td><td class="num">${eur(v.value)}</td><td class="num small muted">${prev ? pct((v.value / prev.value - 1) * 100) : ''}</td></tr>`;
  }).join('');
  return `<h2>Price & value</h2><table>${rows.join('')}</table>
    ${est ? '<p class="small muted">Estimate = latest WOZ value × change in the CBS price index for existing homes in this region since the WOZ reference date. Typically within ±10% for ordinary homes; less reliable for unusual or recently renovated homes.</p>' : ''}
    ${wozRows ? `<h2>WOZ per year</h2><table>${wozRows}</table>` : ''}`;
}

function wozChart(values) {
  if (!values || values.length < 2) return '';
  const W = 348, H = 80, P = { l: 4, r: 4, t: 14, b: 14 };
  const max = Math.max(...values.map((v) => v.value)), min = Math.min(...values.map((v) => v.value));
  const bw = (W - P.l - P.r) / values.length;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="WOZ history">`;
  values.forEach((v, i) => {
    const h = 8 + ((v.value - min) / (max - min || 1)) * (H - P.t - P.b - 8);
    const x = P.l + i * bw;
    svg += `<rect x="${x + 2}" y="${H - P.b - h}" width="${bw - 4}" height="${h}" rx="2" fill="#819470"><title>${v.year}: ${eur(v.value)}</title></rect>`;
    if (i % 2 === values.length % 2 || i === values.length - 1) svg += `<text x="${x + bw / 2}" y="${H - 3}" text-anchor="middle">'${String(v.year).slice(2)}</text>`;
  });
  const lx = P.l + (values.length - 1) * bw + bw / 2;
  svg += `<text x="${Math.min(lx, W - 30)}" y="10" text-anchor="middle">${eur(values.at(-1).value)}</text>`;
  svg += `<text x="${P.l + bw / 2}" y="${H - P.b - 12}" text-anchor="start">${eur(values[0].value)}</text></svg>`;
  return svg;
}

// ---------- Liveability tab ----------
function lbmHtml(res) {
  const f = facts(res);
  const { data, grid, buurt, main } = f;
  if (!data) return `<h2>Leefbaarometer</h2><p class="err small">${esc(res.lbmError || 'No data')}</p>`;
  const cls = SCORE_CLASSES[main.kscore];
  const levels = [
    ['100 m grid', grid],
    [`Buurt · ${buurt?.name ?? ''}`, buurt],
    [`Wijk · ${data[`wijkscore${LATEST}`]?.name ?? ''}`, data[`wijkscore${LATEST}`]],
    [`Postcode ${data[`pc4score${LATEST}`]?.code ?? ''}`, data[`pc4score${LATEST}`]],
    [`Gemeente · ${data[`gemeentescore${LATEST}`]?.name ?? ''}`, data[`gemeentescore${LATEST}`]],
  ].filter(([, p]) => p);
  const dimRows = DIMENSIONS.map((d) => `
    <tr><td title="${esc(d.nl)}">${esc(d.en)}</td>
      <td class="num small muted">${esc(divLabel(main['k' + d.key]))}</td>
      <td class="num">${pill(main['k' + d.key], DIV_COLORS[main['k' + d.key]], d.nl)}</td></tr>`).join('');
  const levelRows = levels.map(([name, p]) => {
    const k = scoreClass(p);
    return `<tr><td>${esc(name)}</td><td class="num small muted">${esc(SCORE_CLASSES[k]?.en)}</td>
      <td class="num">${pill(k, SCORE_CLASSES[k]?.color, SCORE_CLASSES[k]?.nl)}</td></tr>`;
  }).join('');
  const devRows = [
    ['100 m grid, 2022→2024', data.clippedgridontwikkeling22_24],
    ['100 m grid, 2014→2024', data.clippedgridontwikkeling14_24],
    ['Buurt, 2022→2024', data.buurtontwikkeling22_24],
    ['Buurt, 2014→2024', data.buurtontwikkeling14_24],
  ].filter(([, p]) => p).map(([name, p]) => `<tr><td>${esc(name)}</td>
      <td class="num small muted">${esc(devLabel(p.kscore))}</td>
      <td class="num">${pill(p.kscore, DIV_COLORS[p.kscore], devLabel(p.kscore))}</td></tr>`).join('');
  return `
    <div class="hero">
      <div class="badge" style="background:${cls?.color};color:${textOn(main.kscore)}">${main.kscore}</div>
      <div>
        <div class="label">${esc(cls?.en)} <span class="muted">(${esc(cls?.nl)})</span></div>
        <div class="small muted">Leefbaarometer ${2000 + Number(LATEST)} · ${grid ? '100 m grid around the address' : 'neighbourhood (buurt)'} · class ${main.kscore} of 9</div>
      </div>
    </div>
    <h2>Sub-scores (vs. Dutch average)</h2><table>${dimRows}</table>
    <h2>Score at each level</h2><table>${levelRows}</table>
    <h2>Development</h2><table>${devRows}</table>
    <p class="small muted">Scale 1–9: 1 = very poor … 5 = sufficient … 9 = excellent. Sub-scores: 5 = Dutch average.</p>`;
}

// ---------- Neighbourhood tab ----------
function neighbourhoodHtml(res) {
  const b = res.cbs?.buurt, g = res.cbs?.gemeente;
  if (!b || !Object.keys(b).length) return '<p class="muted">No CBS figures for this neighbourhood.</p>';
  const fmt = (x, unit) => {
    if (!x) return '–';
    if (unit === '%') return `${x.v}%`;
    if (unit === 'k€') return eur(x.v * 1000);
    if (unit === 'm³') return `${x.v} m³`;
    return x.v.toLocaleString('nl-NL');
  };
  const rows = CBS_FIELDS.filter(([k]) => b[k]).map(([k, label, unit]) =>
    `<tr><td>${label} <span class="small muted">'${String(b[k].y).slice(2)}</span></td><td class="num">${fmt(b[k], unit)}</td><td class="num small muted">${fmt(g?.[k], unit)}</td></tr>`).join('');
  const dist = CBS_DIST.filter(([k]) => b[k]).map(([k, label]) => `<tr><td>${label}</td><td class="num">${dec(b[k].v)} km</td><td class="num small muted">${g?.[k] ? dec(g[k].v) + ' km' : '–'}</td></tr>`).join('');
  return `${envHtml(res)}${crimeHtml(res)}<h2>CBS key figures</h2>
    <table><tr><td></td><td class="num small muted">Buurt</td><td class="num small muted">Gemeente</td></tr>${rows}</table>
    ${dist ? `<h2>Average distance to…</h2><table><tr><td></td><td class="num small muted">Buurt</td><td class="num small muted">Gemeente</td></tr>${dist}</table>` : ''}
    <p class="small muted">'25 = CBS year of the figure. Source: CBS Kerncijfers wijken en buurten.</p>`;
}


// ---------- Shell with tabs ----------
const TABS = [
  ['overview', 'Overview', overviewHtml],
  ['value', 'Value', valueHtml],
  ['market', 'Market', marketHtml],
  ['live', 'Liveability', lbmHtml],
  ['area', 'Area', neighbourhoodHtml],
];

function render(res) {
  const { loc } = res;
  app.innerHTML = `
    <header>
      <h1>${esc(loc.weergavenaam)}</h1>
      <div class="small muted">${esc(loc.buurtnaam)} · ${esc(loc.wijknaam)} · ${esc(loc.gemeentenaam)}${res.site ? ` · via ${esc(res.site)}` : ''}</div>
      ${res.approximate ? '<p class="err small">House number not found on the page: figures are for an address on this street and may not be this exact house. Scroll the listing and press Refresh.</p>' : ''}
      ${highlightHtml(res)}
      <nav class="tabs" role="tablist">${TABS.map(([id, label], i) => `<button role="tab" data-tab="${id}" aria-selected="${i === 0}">${label}</button>`).join('')}</nav>
    </header>
    ${TABS.map(([id, , fn], i) => `<section class="panel" data-panel="${id}" ${i ? 'hidden' : ''}>${fn(res)}</section>`).join('')}
    <footer>
      <span class="small muted">Sources: <a href="https://www.leefbaarometer.nl/kaart/" target="_blank">Leefbaarometer</a>,
        <a href="https://www.wozwaardeloket.nl/" target="_blank">WOZ-waardeloket</a>, BAG/PDOK, CBS. Price & m² from the listing page.</span>
      <button id="refresh" title="Fetch again">Refresh</button>
    </footer>
    ${optionHtml()}`;
  app.querySelector('[data-goto]')?.addEventListener('click', () => app.querySelector('[data-tab="market"]')?.click());
  app.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.onclick = () => {
      app.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      app.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
    };
  });
  document.getElementById('refresh').onclick = () => load(true);
  wireOption();
}

function optionHtml() {
  return `<label class="option"><input type="checkbox" id="opt-map"> Show Leefbaarometer on Funda search pages
    <span class="small muted">(colour layer on the map, class under the mouse, badge per listing)</span></label>`;
}
async function wireOption() {
  const box = document.getElementById('opt-map');
  if (!box) return;
  box.checked = (await chrome.storage.sync.get({ lbmMap: true })).lbmMap;
  box.onchange = () => chrome.storage.sync.set({ lbmMap: box.checked });
}

async function load(force = false) {
  app.innerHTML = '<p class="muted">Loading data…</p>';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.address && (!tab?.url || !isListing(tab.url))) {
    app.innerHTML = `<h1>HuisInZicht</h1>
      <p class="muted">Open a single listing on Funda, Pararius or Jaap and click this icon again.</p>
      ${optionHtml()}`;
    wireOption();
    return;
  }
  const key = `r:${tab.url}`;
  try {
    let res = force ? null : (await chrome.storage.session.get(key))[key];
    if (!res) {
      res = await lookupFromTab(tab);
      await chrome.storage.session.set({ [key]: res });
    }
    render(res);
  } catch (e) {
    app.innerHTML = `<h1>HuisInZicht</h1><p class="err">${esc(e.message)}</p>
      <button id="retry">Try again</button>`;
    document.getElementById('retry').onclick = () => load(true);
  }
}

load();

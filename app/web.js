import { isListing, addressFromPageText, SCORE_CLASSES } from './lib.js';

// Find "Street 12a" (+ postcode / town) in free text such as the Funda app's share message.
function addressInText(t) {
  if (!t) return null;
  const withPc = addressFromPageText(t);
  if (withPc) return `${withPc.street} ${withPc.postcode}`;
  const tail = t.split(/:\s*/).at(-1); // drop "Bekijk deze woning op Funda:" style lead-ins
  const m = tail.match(/([A-Za-zÀ-ÿ'.\-]+(?: [A-Za-zÀ-ÿ'.\-]+){0,4} \d{1,5}(?:[ -]?[A-Za-z0-9]{1,4})?)(?:\s*,\s*([A-Za-zÀ-ÿ'.\- ]{2,40}))?/);
  return m ? [m[1], m[2]].filter(Boolean).join(' ').trim() : null;
}

const H = window.HZ;
const app = document.getElementById('app');
const form = document.getElementById('find');
const input = form.elements.url;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const seen = [...H.saved(), ...H.recent()].find((r) => r.q === (H.link || H.typed));
if (seen && !H.price && seen.price) H.price = seen.price;
if (seen && !H.type && seen.type) H.type = seen.type;
input.value = H.link || H.typed;
if (H.price) form.elements.price.value = H.price.toLocaleString('nl-NL');
form.elements.type.value = H.type;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const p = new URLSearchParams();
  const v = input.value.trim();
  if (!v) { input.focus(); return; }
  p.set('url', v);
  const price = form.elements.price.value.replace(/[^\d]/g, '');
  if (price) p.set('price', price);
  if (form.elements.type.value) p.set('type', form.elements.type.value);
  location.search = p.toString();
});

const paste = document.getElementById('paste');
if (navigator.clipboard?.readText) {
  paste.onclick = async () => {
    try { input.value = (await navigator.clipboard.readText()).trim(); input.focus(); } catch { input.focus(); }
  };
} else paste.hidden = true;

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (H.link && isListing(H.link)) {
  await import('./popup.js');
} else if (H.typed) {
  await import('./popup.js');
} else if (H.link && addressInText(H.rest)) {
  // Funda app short link (/detail/<id>): use the address from the share text instead.
  H.typed = addressInText(H.rest);
  H.link = '';
  input.value = H.typed;
  await import('./popup.js');
} else if (H.link) {
  const fundaId = (H.link.match(/funda\.nl\/(?:\w+\/)?detail\/(\d{6,})/) || [])[1];
  // Open the listing in Chrome rather than the Funda app; Chrome's address bar has the full link with the street.
  const chromeUrl = fundaId && !isIOS
    ? `intent://www.funda.nl/detail/${fundaId}/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`https://www.funda.nl/detail/${fundaId}/`)};end`
    : fundaId ? `https://www.funda.nl/detail/${fundaId}/` : '';
  app.innerHTML = `<p class="err">This link has no address in it${fundaId ? ' (the Funda app shares only a listing number)' : ''}.</p>
    ${chromeUrl ? `<p><a class="bigbtn" href="${esc(chromeUrl)}">Open this house in ${isIOS ? 'Safari' : 'Chrome'}</a></p>
    <p>Then tap <b>${isIOS ? 'Share → Copy, come back here and tap Paste' : '⋮ → Share → HuisInZicht'}</b>.</p>
    <p class="small muted">Or type the street, house number and town in the box above.</p>`
    : '<p><b>Type the street, house number and town</b> in the box above and press Check.</p>'}
    <p class="small muted" style="word-break:break-all">Shared: ${esc(H.rest || '(no text)')} · ${esc(H.link)}</p>`;
  input.value = '';
  input.placeholder = 'e.g. Stinzenlaan Zuid 210 Breukelen';
  if (!chromeUrl) input.focus();
} else {
  const recent = H.recent();
  const href = (r) => `?${new URLSearchParams({ url: r.q, ...(r.price ? { price: r.price } : {}), ...(r.type ? { type: r.type } : {}) })}`;
  const when = (t) => { const d = Math.round((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  const saved = H.saved();
  const savedNames = new Set(saved.map((r) => r.name));
  const listHtml = (items) => `<ul class="recent">${items.map((r) => {
      const c = SCORE_CLASSES[r.lbm];
      return `<li><a href="${esc(href(r))}">
        <span class="rbadge" style="background:${c ? c.color : 'var(--line)'};color:${r.lbm >= 7 || r.lbm <= 2 ? '#fff' : '#1d2420'}">${r.lbm || '–'}</span>
        <span class="rtext"><b>${esc(r.name)}</b><span class="small muted">${esc(r.place)}${r.price ? ` · € ${Math.round(r.price).toLocaleString('nl-NL')}` : ''} · ${when(r.t)}</span></span>
      </a></li>`;
    }).join('')}</ul>`;
  const others = recent.filter((r) => !savedNames.has(r.name));
  const any = saved.length || others.length;
  app.innerHTML = (saved.length ? `<h2>★ Saved</h2>${listHtml(saved)}` : '')
    + (others.length ? `<h2>Recently viewed <button type="button" id="clear-recent" class="linkbtn">Clear</button></h2>${listHtml(others)}` : '')
    + `
    ${any ? '<details><summary>How to use</summary>' : ''}
    <h2>How to use</h2>
    <p>Paste a Funda, Pararius or Jaap link, or type an address, then press <b>Check</b>.
      The asking price is optional; with it you also get the overbid estimate.</p>
    ${isIOS ? `
    <h2>On iPhone: one-time setup (2 minutes)</h2>
    <p>This puts <b>HuisInZicht</b> in the Share menu, so a house opens with two taps.</p>
    <ol class="steps">
      <li>Open the <b>Shortcuts</b> app → <b>+</b> (top right). Name it <b>HuisInZicht</b>.</li>
      <li>Search actions for <b>URL Encode</b> and add it. It should say <i>URL Encode Shortcut Input</i>
        (if it says "Text", tap that word and pick <i>Shortcut Input</i>).</li>
      <li>Add <b>Text</b> and type exactly:<br><code class="copy">${location.origin + location.pathname}?text=</code>
        then, right after the <code>=</code>, tap <b>URL Encoded Text</b> above the keyboard.</li>
      <li>Add <b>Open URLs</b> (it uses the Text automatically).</li>
      <li>Tap the <b>ⓘ</b> at the bottom → turn on <b>Show in Share Sheet</b>. Tap Done.</li>
    </ol>
    <h2>Every time</h2>
    <ol class="steps">
      <li>Look at houses on <b>funda.nl in Safari</b> (Safari → Share → Add to Home Screen gives a Funda icon).</li>
      <li>On a house: <b>Share → HuisInZicht</b>. Done.</li>
      <li class="small muted">From the Funda app it works too, but that app shares only a number: tap <b>Open this house in Safari</b>, then Share → HuisInZicht again.</li>
    </ol>` : `
    <h2>On Android</h2>
    <ol class="steps">
      <li>Chrome menu <b>⋮ → Add to Home screen → Install</b>.</li>
      <li>Then in the Funda app or website: <b>Share → HuisInZicht</b>. It opens straight on the listing.</li>
      <li class="small muted">If the Funda app's share holds no address, share from funda.nl in Chrome instead: those links include the street.</li>
    </ol>`}
    <p class="small muted">All data comes straight from public sources (Leefbaarometer, Kadaster WOZ, BAG, CBS, RIVM,
      Klimaateffectatlas, NVM). Recently viewed houses stay on this phone only.</p>
    ${any ? '</details>' : ''}`;
  // "Clear" empties the recent list only; saved houses stay.
  document.getElementById('clear-recent')?.addEventListener('click', () => { H.saveRecent([]); location.reload(); });
}

// ☆ Save / ★ Saved button next to the address on a result page.
function addStar() {
  const h1 = app.querySelector('header h1');
  if (!h1 || !H.current || document.getElementById('star')) return;
  const btn = document.createElement('button');
  btn.id = 'star'; btn.type = 'button';
  const isSaved = () => H.saved().some((r) => r.name === H.current.name);
  const paint = () => { btn.textContent = isSaved() ? '★ Saved' : '☆ Save'; btn.classList.toggle('on', isSaved()); };
  btn.onclick = () => {
    const rest = H.saved().filter((r) => r.name !== H.current.name);
    H.setSaved(isSaved() ? rest : [{ ...H.current, price: H.price || H.current.price }, ...rest]);
    paint();
  };
  paint();
  h1.before(btn);
}
window.addEventListener('hz-result', () => setTimeout(addStar));
new MutationObserver(addStar).observe(app, { childList: true });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

import { isListing, addressFromPageText } from './lib.js';

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
  app.innerHTML = `<p class="err">This link has no address in it${/funda\.nl\/detail\/\d+/.test(H.link) ? ' (the Funda app shares only a listing number)' : ''}.</p>
    <p><b>Type the street, house number and town</b> in the box above and press Check.</p>
    <p class="small muted" style="word-break:break-all">Shared: ${esc(H.rest || '(no text)')} · ${esc(H.link)}</p>`;
  input.value = '';
  input.placeholder = 'e.g. Stinzenlaan Zuid 210 Breukelen';
  input.focus();
} else {
  app.innerHTML = `
    <h2>How to use</h2>
    <p>Paste a Funda, Pararius or Jaap link, or type an address, then press <b>Check</b>.
      The asking price is optional; with it you also get the overbid estimate.</p>
    ${isIOS ? `
    <h2>On iPhone</h2>
    <ol class="steps">
      <li>Safari: tap <b>Share → Add to Home Screen</b> to keep HuisInZicht as an app.</li>
      <li>In Funda: <b>Share → Copy</b>, open HuisInZicht, tap <b>Paste</b>.</li>
    </ol>` : `
    <h2>On Android</h2>
    <ol class="steps">
      <li>Chrome menu <b>⋮ → Add to Home screen → Install</b>.</li>
      <li>Then in the Funda app or website: <b>Share → HuisInZicht</b>. It opens straight on the listing.</li>
      <li class="small muted">If the Funda app's share holds no address, share from funda.nl in Chrome instead: those links include the street.</li>
    </ol>`}
    <p class="small muted">All data comes straight from public sources (Leefbaarometer, Kadaster WOZ, BAG, CBS, RIVM,
      Klimaateffectatlas, NVM). Nothing is stored or sent anywhere else.</p>`;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

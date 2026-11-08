import { isListing } from './lib.js';

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
} else if (H.link) {
  app.innerHTML = `<p class="err">This link is not a single listing on Funda, Pararius or Jaap:</p>
    <p class="small muted" style="word-break:break-all">${esc(H.link)}</p>
    <p>Open the listing in the browser and copy its address bar, or type the address (e.g. <i>Stinzenlaan Zuid 210 Breukelen</i>).</p>`;
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
    </ol>`}
    <p class="small muted">All data comes straight from public sources (Leefbaarometer, Kadaster WOZ, BAG, CBS, RIVM,
      Klimaateffectatlas, NVM). Nothing is stored or sent anywhere else.</p>`;
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Service worker: lets Android install the app (needed for Share → HuisInZicht) and makes sure
// an update shows up straight away: the app's own files are always re-checked with the server
// (cheap: unchanged files come back as "304 not modified"). Data lookups are not touched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => fetch(e.request)));
});

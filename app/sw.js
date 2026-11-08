// Minimal service worker so Android offers "Install" (needed for the Share → HuisInZicht entry).
// No caching: every lookup needs live data anyway, and nothing stale can get stuck.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

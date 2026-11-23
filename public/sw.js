/* Keeps the app installable and its static files fast. Documents and pages always come from the server, so
   what you see is never out of date and nothing is cached across different users. */
const VERSION = 'pm-v4'; // bumped: new Cloud Packers icons

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/offline.html', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/logo.jpg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // only files whose name contains a content hash are safe to keep (they never change); everything else always comes from the network
  if (/\/_next\/static\/.*[-\/.][a-f0-9]{8,}\.(js|css|woff2)$/.test(url.pathname) || /\.png$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.mode === 'navigate') event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
});

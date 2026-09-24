/* Frank's Maintenance Bots service worker */
const CACHE = 'fmb-v1.0';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/ui.js',
  './js/app.js',
  './js/search.js',
  './js/parts.js',
  './js/symptoms.js',
  './js/gemini.js',
  './manifest.webmanifest',
  './data/parts.json',
  './data/index.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of SHELL) {
      try { await cache.add(url); } catch (e) { console.warn('[FMB SW] skip', url, e); }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('fmb-')).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'generativelanguage.googleapis.com') {
    event.respondWith(fetch(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  event.respondWith((async () => {
    if (isHTML) {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html'));
      }
    }
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      fetch(req).then((fresh) => {
        if (fresh && fresh.ok) caches.open(CACHE).then((c) => c.put(req, fresh));
      }).catch(() => {});
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      throw e;
    }
  })());
});

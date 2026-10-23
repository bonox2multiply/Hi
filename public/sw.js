const CACHE = 'kia-diamond-shell-v22',
  SHELL = [
    '/live-model.js?v=22',
    '/calendar.js?v=22',
    '/settings.js?v=22',
    '/',
    '/app.js?v=22',
    '/model.js',
    '/navigation.js?v=22',
    '/postseason.js?v=22',
    '/styles.css?v=22',
    '/icon.svg?v=22',
    '/manifest.webmanifest'
  ];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('kia-diamond-shell-') && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  if (!SHELL.some((p) => new URL(p, self.location.origin).pathname === u.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const versioned = u.searchParams.get('v') === '22';
      if (versioned) {
        const hit = await cache.match(event.request);
        if (hit) return hit;
      }
      try {
        const r = await fetch(event.request);
        if (r.ok) event.waitUntil(cache.put(event.request, r.clone()));
        return r;
      } catch (error) {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        throw error;
      }
    })()
  );
});

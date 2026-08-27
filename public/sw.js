/* Proper Service — lightweight offline shell (no build step). */
const CACHE = 'ps-shell-v4';
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/img/icons/logo.png', '/img/icons/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAdminOrApi(url) {
  const p = url.pathname;
  return p.startsWith('/admin') || p.startsWith('/api');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isAdminOrApi(url)) return;

  // Next.js build assets: always network, never cache in SW.
  // Hashed files change every deploy; cache-first here causes stale/broken shells
  // (HTML references new chunks, SW may surface opaque/error HTML as "stylesheet").
  if (url.pathname.startsWith('/_next/')) {
    return;
  }

  // Navigations: network first, offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) {
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
        }),
    );
    return;
  }

  // User uploads: always network (new files must appear without SW/PM2 tricks)
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Public img / fonts only (not Next hashed bundles)
  if (
    url.pathname.startsWith('/img/') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.otf') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.eot')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        });
      }),
    );
  }
});

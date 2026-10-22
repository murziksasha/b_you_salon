/* B_You offline shell. HTML is never stored. Navigations are network-only. */
const CACHE = 'byou-shell-v6';
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/img/icons/icon-192.png',
  '/img/icons/icon-512.png',
  '/img/icons/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of PRECACHE) {
        try {
          await cache.add(url);
        } catch {
          /* one missing file must not abort install */
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

function isBypassed(url) {
  const path = url.pathname;
  return (
    path.startsWith('/admin') ||
    path.startsWith('/api') ||
    path.startsWith('/_next') ||
    path.startsWith('/uploads')
  );
}

/** Network-only document load. Failure falls back to the precached offline page. */
async function networkNavigation(req) {
  try {
    return await fetch(req);
  } catch {
    const offline = await caches.match('/offline.html');
    return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

function isStaticAsset(url) {
  const path = url.pathname;
  return (
    path.startsWith('/img/') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    path.endsWith('.otf') ||
    path.endsWith('.ttf') ||
    path.endsWith('.eot')
  );
}

function cacheFirstStatic(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkNavigation(req));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStatic(req));
  }
});

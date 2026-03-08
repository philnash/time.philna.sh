const CACHE_NAME = 'timetime-zone-v3';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/data/cities.json',
  '/manifest.webmanifest',
  '/assets/icon.svg',
];

self.addEventListener('install', (event) => {
  const precacheRequests = PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(precacheRequests))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            return response;
          }

          const cache = await caches.open(CACHE_NAME);
          return cache.match('/index.html');
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return cache.match('/index.html');
        }),
    );
    return;
  }

  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }

        return response;
      });
    }),
  );
});

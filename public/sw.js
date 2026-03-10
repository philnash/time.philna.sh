const CACHE_NAME = 'time.philna.sh-v47';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/data/cities.json',
  '/manifest.webmanifest',
  '/assets/icon.svg',
  '/assets/icon-light.svg',
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
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', response.clone());
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

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }

        if (request.mode === 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          return cache.match('/index.html');
        }

        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
  );
});

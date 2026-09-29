// Offline support: app shell and data are cached; updates are fetched in the background.
const VERSION = 'v5';
const CACHE = `nbaeu-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'css/fonts.css',
  'fonts/rubik-hebrew.woff2',
  'fonts/rubik-latin.woff2',
  'fonts/rubik-latin-ext.woff2',
  'fonts/bebas-neue-latin.woff2',
  'fonts/bebas-neue-latin-ext.woff2',
  'js/app.js',
  'js/store.js',
  'js/model.js',
  'js/teams.js',
  'js/sync.js',
  'js/dom.js',
  'js/autocomplete.js',
  'js/nba.js',
  'js/native.js',
  'js/wiki.js',
  'data/drafts.json',
  'data/teams-israel.json',
  'data/teams-europe.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nbaeu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate for same-origin GETs; everything else (GitHub API) goes to the network.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

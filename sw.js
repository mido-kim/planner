// Offline support. App files are fetched fresh when online (falling back to
// the saved copy after a short wait, or when offline), so updates show up on
// the next open without any version bumping. The Firebase library files have
// the version in their URL, so they're served from the saved copy.

const CACHE = 'planner-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/backup.js',
  'js/cloud.js',
  'js/config.js',
  'js/dates.js',
  'js/demo.js',
  'js/dialogs.js',
  'js/icons.js',
  'js/labels.js',
  'js/main.js',
  'js/recurrence.js',
  'js/series.js',
  'js/settings.js',
  'js/store.js',
  'js/util.js',
  'js/version.js',
  'js/views/month.js',
  'js/views/bars.js',
  'js/views/agenda.js',
  'js/views/timegrid.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const SLOW_NETWORK_MS = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // 'no-cache' asks the server whether the file changed instead of trusting
  // the browser's own cache, so updates aren't held back.
  const network = fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const saved = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
  if (!saved) return network;
  const slow = new Promise((resolve) => setTimeout(() => resolve(saved), SLOW_NETWORK_MS));
  return Promise.race([network.catch(() => saved), slow]);
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

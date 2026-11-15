/* Service worker: permite usar la app sin conexión una vez cargada.
   Estrategia "red primero, caché de respaldo": si hay internet siempre obtienes la última versión. */
const CACHE = 'mi-fondo-bhd-v1';
const ASSETS = ['./', 'index.html', 'css/styles.css', 'js/calc.js', 'js/db.js', 'js/demo.js', 'js/charts.js', 'js/app.js',
  'lib/chart.umd.js', 'lib/xlsx.mini.min.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

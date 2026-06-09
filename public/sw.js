// Service Worker de Moni — cache de estáticos para uso offline/PWA
const CACHE_NAME = 'moni-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/js/main.js',
  '/js/state.js',
  '/js/calculations.js',
  '/js/ai/client.js',
  '/js/ai/prompt.js',
  '/js/ui/components.js',
  '/js/ui/dashboard.js',
  '/js/ui/history.js',
  '/js/ui/reports.js',
  '/js/ui/settings.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear la API local ni peticiones a las APIs de IA
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return; // pasa directo a la red
  }

  // Estáticos propios: network-first con fallback a caché (evita servir
  // versiones viejas tras un deploy, pero funciona offline)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
  );
});

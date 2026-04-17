// Mundo M Reparto - Service Worker
// Estrategia: network-first para la app; passthrough para Firebase / APIs externas

const CACHE_NAME = 'mundom-reparto-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  // Toma control rápido: no esperar a que cierren todas las pestañas
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Permite que la página fuerce el update via postMessage
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Estrategia por request
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca interceptar Firebase, Google APIs, reCAPTCHA, leaflet, etc.
  const bypass = [
    'firebaseio.com', 'firebaseapp.com', 'googleapis.com', 'gstatic.com',
    'google.com', 'recaptcha.net', 'openstreetmap.org', 'unpkg.com',
    'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com',
    'firebasestorage.app', 'firebase.googleapis.com'
  ];
  if (bypass.some(h => url.hostname.includes(h))) return;

  // Para la app (same-origin): network-first con fallback a caché
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })());
  }
});

// Notificaciones push (preparado para FCM en Paso H)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Mundo M Reparto';
  const options = {
    body: data.body || 'Nueva actualización',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'mundom-reparto',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: !!data.urgent
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./');
  })());
});

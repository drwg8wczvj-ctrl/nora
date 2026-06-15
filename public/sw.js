'use strict';

// Increment CACHE_NAME to bust old caches on deploy
const CACHE_NAME = 'nora-cache-v2';

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', '/offline.html'].filter(Boolean)))
  );
  // Do NOT skipWaiting here — let the update banner drive the reload
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Messages from the app ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  // App requests a SW-based notification (works while app is backgrounded)
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options || {}).catch(() => {});
  }
});

// ── Push (Web Push API — for future server-sent notifications) ────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Nora', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || 'nora-push',
      renotify: !!payload.tag,
      data: payload.data || {},
    })
  );
});

// ── Notification click — focus open window or open URL, then tell app ─────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url  = data.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an existing window first
        for (const client of clientList) {
          if ('focus' in client) {
            // Send click data so the app can navigate to the right screen
            client.postMessage({ type: 'NOTIFICATION_CLICK', data });
            return client.focus();
          }
        }
        // No open window — open a new one
        return clients.openWindow(url);
      })
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET or cross-origin (API calls, fonts, etc.)
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // HTML navigation — network-first so users always get fresh deployments
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // CRA hashed bundles (/static/js/*, /static/css/*) — cache-first (content-addressed, immutable)
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else (images, icons, manifest) — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── Strategy helpers ──────────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || caches.match('/');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || networkFetch;
}
'use strict';

// Increment CACHE_NAME to bust old caches on deploy
const CACHE_NAME = 'nora-cache-v3';

// ── IndexedDB helpers for alarm queue ────────────────────────────────────────
// Alarms are stored here so they survive app closure.
// Shape: { id, scheduledFor (ms), title, body, tag, data, fired }

function openAlarmDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nora-alarms-v1', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('alarms', { keyPath: 'id' });
    };
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
  });
}

async function storeAlarm(alarm) {
  const db    = await openAlarmDB();
  const tx    = db.transaction('alarms', 'readwrite');
  const store = tx.objectStore('alarms');
  store.put(alarm);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function removeAlarm(id) {
  const db    = await openAlarmDB();
  const tx    = db.transaction('alarms', 'readwrite');
  tx.objectStore('alarms').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function getAllAlarms() {
  const db    = await openAlarmDB();
  const tx    = db.transaction('alarms', 'readonly');
  const store = tx.objectStore('alarms');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

// Check for and fire any due alarms (called on every SW wakeup opportunity)
async function checkAndFireAlarms() {
  const now    = Date.now();
  const alarms = await getAllAlarms();
  for (const alarm of alarms) {
    if (alarm.scheduledFor <= now) {
      try {
        await self.registration.showNotification(alarm.title, {
          body:     alarm.body  || '',
          icon:     '/icon-192.png',
          badge:    '/icon-192.png',
          tag:      alarm.tag   || 'nora-alarm',
          data:     alarm.data  || {},
          renotify: true,
        });
      } catch (_) {}
      await removeAlarm(alarm.id);
    }
  }
}

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
      // Fire any overdue alarms now (catches anything missed while SW was inactive)
      .then(() => checkAndFireAlarms())
  );
});

// ── Messages from the app ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Alarm management — store / clear via IndexedDB
  if (type === 'STORE_ALARM') {
    event.waitUntil(storeAlarm(event.data.alarm));
    return;
  }
  if (type === 'CLEAR_ALARM') {
    event.waitUntil(removeAlarm(event.data.id));
    return;
  }
  if (type === 'CLEAR_ALL_ALARMS') {
    event.waitUntil(
      openAlarmDB()
        .then((db) => {
          const tx = db.transaction('alarms', 'readwrite');
          tx.objectStore('alarms').clear();
          return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        })
    );
    return;
  }

  // App requests an immediate SW-based notification
  if (type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        ...(options || {}),
      })
    );
    return;
  }

  // Health check — reply with alarm count
  if (type === 'GET_ALARM_COUNT') {
    event.waitUntil(
      getAllAlarms().then((alarms) => {
        if (event.source && event.source.postMessage) {
          event.source.postMessage({ type: 'ALARM_COUNT', count: alarms.length, alarms });
        }
      })
    );
    return;
  }
});

// ── Periodic Background Sync (Android Chrome) ────────────────────────────────
// Fires roughly every hour when registered. Wakes the SW to check alarms even
// when the PWA is fully closed.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-alarms') {
    event.waitUntil(checkAndFireAlarms());
  }
});

// ── Push (Web Push API — for future server-sent notifications) ────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Nora', {
      body:      payload.body || '',
      icon:      '/icon-192.png',
      badge:     '/icon-192.png',
      tag:       payload.tag  || 'nora-push',
      renotify:  !!payload.tag,
      data:      payload.data || {},
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
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICK', data });
            return client.focus();
          }
        }
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

  // Check alarms on every navigation (catches missed alarms when user opens app)
  if (request.mode === 'navigate') {
    checkAndFireAlarms().catch(() => {});
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
  const cache       = await caches.open(CACHE_NAME);
  const cached      = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || networkFetch;
}
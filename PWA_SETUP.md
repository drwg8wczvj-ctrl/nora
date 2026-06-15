# NORA PWA Setup

NORA is a fully installable Progressive Web App (PWA) that works on Android, iOS, and desktop.

---

## What's included

| Feature | File |
|---|---|
| Web App Manifest | `public/manifest.json` |
| Service Worker | `public/sw.js` |
| iOS meta tags + safe areas | `public/index.html` |
| usePWA hook (registration + install prompt) | `src/hooks/usePWA.js` |
| Update + install banners | `src/PWABanners.js` / `src/PWABanners.css` |
| PWA icons (192, 512, 180px) | `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` |

---

## Update strategy

The service worker uses **network-first** for HTML navigation and **cache-first** for hashed JS/CSS bundles (which are content-addressed and immutable once cached). This means:

- After every `git push origin main` + Vercel deploy, users receive the new `index.html` on their next refresh or app reopen.
- Hashed bundles that haven't changed are served from cache instantly.
- A "New version available" banner appears when a new service worker is waiting. The user clicks **Update** → page reloads into the new version.

There is no aggressive pre-caching of the app shell. Users will never be stuck on a stale version for more than one session.

---

## iOS install (Add to Home Screen)

iOS doesn't support `beforeinstallprompt`. On iOS, users must manually use the Share menu → "Add to Home Screen." The app is already configured for standalone mode and safe areas.

The `viewport-fit=cover` meta tag is required for `env(safe-area-inset-*)` CSS variables to work in standalone mode.

---

## Android / Chrome install

Chrome surfaces an install prompt automatically when:
1. The app has a valid manifest (all required fields present)
2. The site is served over HTTPS
3. A service worker is registered
4. The user has interacted with the site

NORA shows an "Install NORA on your device" banner 8 seconds after first load. Once dismissed, it won't show again (stored in `localStorage`).

---

## Updating icons

The source icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) were generated from `icon.png` using:

```bash
sips -s format png -z 192 192 public/icon.png --out public/icon-192.png
sips -s format png -z 512 512 public/icon.png --out public/icon-512.png
sips -s format png -z 180 180 public/icon.png --out public/apple-touch-icon.png
```

For maskable icons (safe zone is the inner 80% circle), use a design tool to add padding around the logo before exporting at 512×512 and name it `icon-512-maskable.png`. Then add it to `manifest.json`:

```json
{ "src": "icon-512-maskable.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" }
```

---

## Cache version bump

The cache is namespaced `nora-cache-v1` in `public/sw.js`. To force all clients to drop their caches after a major change, increment this version:

```js
const CACHE_NAME = 'nora-cache-v2';  // bump to invalidate
```

---

## Deployment

No changes to the Vercel workflow are required. The service worker file (`public/sw.js`) is served statically alongside the app. Vercel sets appropriate `Cache-Control` headers for the HTML file (`no-store`) ensuring users always receive fresh navigation responses.
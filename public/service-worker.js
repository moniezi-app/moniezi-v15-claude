/* MONIEZI PWA Service Worker
   - Fully bundled app - no CDN dependencies
   - Caches all assets for true offline support on all devices
*/

// Bump this on every deploy
// v15.1.4: restore safe precache so iOS A2HS can launch offline on FIRST open.
// The previous "no precache" change prevented the app shell from being available
// when offline at cold start.
const CACHE_VERSION = "moniezi-core-v0.1.0-2026-02-27b";
const CACHE_NAME = `moniezi-cache-${CACHE_VERSION}`;

// Core assets to pre-cache — use absolute paths so cache keys match
// the absolute navigation URLs iOS uses when launching from home screen.
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Offline-first requires the app shell to be available from cache.
      // We precache core assets, but we NEVER let a precache failure block install.
      // (If the device is offline during install/update, caching will fail — but
      // the SW should still install, and the app will work offline after the user
      // opens it once while online.)
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
      } catch (e) {
        // Swallow errors to avoid breaking install on flaky/offline networks.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean up ALL old moniezi caches
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => 
          key.startsWith("moniezi-cache-") && key !== CACHE_NAME 
            ? caches.delete(key) 
            : null
        )
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests: CACHE-FIRST, never trigger network when offline.
  // iOS shows a native "Turn Off Airplane Mode" dialog if any network fetch fails.
  // By responding from cache only (and never letting the request reach the network
  // while offline), we prevent that dialog from appearing.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // Always prefer cached app shell — absolute path matches iOS navigation URL.
        const cachedIndex = await cache.match("/index.html");
        if (cachedIndex) return cachedIndex;

        const cachedRoot = await cache.match("/");
        if (cachedRoot) return cachedRoot;

        // Only attempt network if we have absolutely nothing cached yet
        // (very first install, must be online at this point anyway).
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            cache.put("/index.html", fresh.clone());
          }
          return fresh;
        } catch (e) {
          // Return a minimal offline fallback so the app doesn't show a blank error.
          return new Response(
            `<!DOCTYPE html><html><head><meta charset="UTF-8">
             <meta name="viewport" content="width=device-width,initial-scale=1">
             <style>body{background:#0b1020;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
             .logo{width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#3b82f6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:32px;}
             </style></head>
             <body><div class="logo">M</div><b>MONIEZI</b><p style="opacity:.6;font-size:14px">Loading your data…</p></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        }
      })()
    );
    return;
  }

  // All other assets: cache-first, then network (only if online)
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return Response.error();
      }
    })()
  );
});

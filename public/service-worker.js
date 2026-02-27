/* MONIEZI PWA Service Worker — iOS Offline Fix
   
   Strategy: Precache ALL assets at install + cache-first for everything.
   
   Why this fixes the iOS "Turn Off Airplane Mode" dialog:
   1. iOS PWAs show this native dialog if ANY fetch hits the network while offline.
   2. The SW must be installed and controlling BEFORE the user goes offline.
   3. ALL assets (including Vite's hashed JS/CSS bundles) must be in cache.
   4. On offline launch, the SW intercepts the navigation request and serves
      everything from cache — iOS never attempts a network fetch.
   
   The VITE_ASSETS placeholder below is replaced at build time by
   vite-plugin-sw-assets.ts with the actual list of built files.
*/

// Bump CACHE_VERSION on every deploy to force cache refresh
var CACHE_VERSION = 'moniezi-v15.4.0';
var CACHE_NAME = 'moniezi-' + CACHE_VERSION;

// This gets replaced at build time with the actual asset list.
// During development, it's an empty array (SW won't precache in dev).
var BUILD_ASSETS = /*__VITE_ASSETS__*/[];

// ─── Install: precache ALL built assets ───
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      if (BUILD_ASSETS.length === 0) {
        // Dev mode or placeholder not replaced — skip precache
        return self.skipWaiting();
      }
      // Precache all assets. Use individual puts instead of addAll
      // so one failed asset doesn't kill the entire install.
      var promises = BUILD_ASSETS.map(function(url) {
        return fetch(url, { cache: 'reload' }).then(function(response) {
          if (response && response.ok) {
            // For "/index.html" — store under BOTH keys "/" and "/index.html"
            // so navigation cache lookups always hit regardless of
            // whether iOS requests "/" or "/index.html"
            if (url === '/index.html') {
              var clone = response.clone();
              cache.put('/', clone);
            }
            return cache.put(url, response);
          }
        }).catch(function(err) {
          // Log but don't fail — partial cache is better than no install
          console.warn('[SW] Failed to precache:', url, err);
        });
      });
      
      return Promise.all(promises).then(function() {
        return self.skipWaiting();
      });
    })
  );
});

// ─── Activate: clean old caches + claim all clients ───
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          // Delete any cache that isn't the current version
          if (key !== CACHE_NAME && key.indexOf('moniezi') === 0) {
            return caches.delete(key);
          }
        })
      );
    }).then(function() {
      // Take control of ALL open tabs immediately.
      // This is critical — without claim(), the SW won't intercept
      // fetches until the next page load.
      return self.clients.claim();
    })
  );
});

// ─── Message handler ───
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Fetch: cache-first for EVERYTHING same-origin ───
self.addEventListener('fetch', function(event) {
  var req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // ── Navigation requests (loading the app) ──
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        // 1. Try cache first — check both "/" and "/index.html"
        return cache.match('/').then(function(cachedRoot) {
          if (cachedRoot) return cachedRoot;
          return cache.match('/index.html');
        }).then(function(cached) {
          if (cached) return cached;

          // 2. Cache miss = first visit or cache cleared. Fetch from network.
          return fetch(req).then(function(response) {
            if (response && response.ok) {
              var clone1 = response.clone();
              var clone2 = response.clone();
              cache.put('/', clone1);
              cache.put('/index.html', clone2);
            }
            return response;
          });
        }).catch(function() {
          // 3. Offline and nothing cached — show minimal offline page
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<style>' +
            'body{background:#0b1020;color:#fff;font-family:system-ui,-apple-system,sans-serif;' +
            'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;' +
            'flex-direction:column;gap:16px;text-align:center;padding:24px;}' +
            '.logo{width:72px;height:72px;border-radius:20px;' +
            'background:linear-gradient(135deg,#3b82f6,#6366f1);' +
            'display:flex;align-items:center;justify-content:center;font-size:28px;' +
            'font-weight:800;color:#fff;box-shadow:0 12px 40px rgba(59,130,246,0.3);}' +
            'h1{font-size:20px;font-weight:800;letter-spacing:0.3em;margin:0;}' +
            'p{font-size:14px;opacity:0.6;margin:0;max-width:300px;line-height:1.5;}' +
            'button{margin-top:12px;padding:12px 24px;border:none;border-radius:12px;' +
            'background:#3b82f6;color:#fff;font-weight:700;font-size:14px;cursor:pointer;}' +
            '</style></head>' +
            '<body>' +
            '<div class="logo">M</div>' +
            '<h1>MONIEZI</h1>' +
            '<p>Connect to the internet to set up the app. After that, it works fully offline.</p>' +
            '<button onclick="location.reload()">Try Again</button>' +
            '</body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
    return;
  }

  // ── All other assets (JS, CSS, images, fonts, manifest) ──
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req).then(function(cached) {
        if (cached) return cached;

        // Cache miss — try network, cache the result
        return fetch(req).then(function(response) {
          if (response && response.ok) {
            cache.put(req, response.clone());
          }
          return response;
        }).catch(function() {
          // Offline + not cached: return empty 503.
          // CRITICAL: Do NOT let the error bubble up — that triggers
          // the iOS "Turn Off Airplane Mode" system dialog.
          return new Response('', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      });
    })
  );
});

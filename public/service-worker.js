/* MONIEZI Service Worker — v15.4.0
 *
 * Fixes the iOS "Turn Off Airplane Mode" dialog by:
 * 1. Precaching ALL built assets (including Vite's hashed JS/CSS bundles)
 * 2. Using cache-first strategy so offline launches never hit the network
 * 3. Catching all fetch errors so iOS never sees a failed network request
 *
 * The placeholder below is replaced at build time by the Vite plugin
 * with the actual list of files in dist/.
 */

var CACHE_NAME = 'moniezi-v15.4.0';

// Replaced at build time. In dev this stays as an empty array.
var PRECACHE_URLS = /*__PRECACHE_LIST__*/[];

// ── Install: precache everything ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      if (!PRECACHE_URLS || PRECACHE_URLS.length === 0) {
        return self.skipWaiting();
      }

      // Fetch each asset individually so one failure doesn't block install.
      var promises = PRECACHE_URLS.map(function(url) {
        return fetch(new Request(url, { cache: 'reload' }))
          .then(function(response) {
            if (!response.ok) {
              throw new Error(response.status + ' ' + response.statusText);
            }
            // Store /index.html also under "/" so navigation lookups match
            if (url === '/index.html') {
              cache.put('/', response.clone());
            }
            return cache.put(url, response);
          })
          .catch(function(err) {
            console.warn('[SW] precache skip:', url, err.message || err);
          });
      });

      return Promise.all(promises).then(function() {
        return self.skipWaiting();
      });
    })
  );
});

// ── Activate: purge old caches, claim clients ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== CACHE_NAME; })
              .map(function(k) { return caches.delete(k); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

// ── Skip-waiting message ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch: cache-first, never let errors bubble ──
self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (HTML page load)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match('/').then(function(r) {
          if (r) return r;
          return cache.match('/index.html');
        }).then(function(cached) {
          if (cached) return cached;

          // Not in cache — fetch from network (first visit, must be online)
          return fetch(req).then(function(resp) {
            if (resp.ok) {
              cache.put('/', resp.clone());
              cache.put('/index.html', resp.clone());
            }
            return resp;
          });
        }).catch(function() {
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<style>body{background:#0b1020;color:#fff;font-family:system-ui;' +
            'display:flex;align-items:center;justify-content:center;height:100vh;' +
            'margin:0;flex-direction:column;gap:16px;text-align:center;padding:24px}' +
            'h1{font-size:20px;font-weight:800;letter-spacing:.3em;margin:0}' +
            'p{opacity:.6;font-size:14px;max-width:280px;line-height:1.5;margin:0}' +
            'button{margin-top:8px;padding:12px 24px;border:none;border-radius:12px;' +
            'background:#3b82f6;color:#fff;font-weight:700;font-size:14px;cursor:pointer}' +
            '</style></head><body>' +
            '<h1>MONIEZI</h1>' +
            '<p>Connect to the internet to set up the app for the first time.</p>' +
            '<button onclick="location.reload()">Retry</button>' +
            '</body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
    return;
  }

  // All other assets: cache-first with runtime caching
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req).then(function(cached) {
        if (cached) return cached;

        return fetch(req).then(function(resp) {
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        }).catch(function() {
          // Return empty 503 — NEVER let errors bubble to iOS
          return new Response('', {
            status: 503,
            statusText: 'Offline'
          });
        });
      });
    })
  );
});

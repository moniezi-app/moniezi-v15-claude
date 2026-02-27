/* MONIEZI Service Worker — v15.5.0
 *
 * Both BASE and PRECACHE_URLS are injected at build time by the Vite plugin.
 * BASE = the subpath the app is deployed at (e.g. "/moniezi-v15-claude/")
 * PRECACHE_URLS = all built files with their full absolute paths
 */

var BASE = '/*__BASE__*/';
var CACHE_NAME = 'moniezi-v15.5.0';
var PRECACHE_URLS = '/*__PRECACHE__*/';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      if (!Array.isArray(PRECACHE_URLS) || PRECACHE_URLS.length === 0) {
        return self.skipWaiting();
      }

      var promises = PRECACHE_URLS.map(function(url) {
        return fetch(new Request(url, { cache: 'reload' })).then(function(resp) {
          if (!resp.ok) throw new Error(resp.status + '');
          // Cache index.html under multiple keys for navigation matching
          if (url.endsWith('/index.html')) {
            cache.put(BASE, resp.clone());
            cache.put(BASE + 'index.html', resp.clone());
          }
          return cache.put(url, resp);
        }).catch(function(e) {
          console.warn('[SW] precache skip:', url, e);
        });
      });

      return Promise.all(promises).then(function() {
        return self.skipWaiting();
      });
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: cache-first
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        // Try the exact URL, then BASE, then BASE + index.html
        return cache.match(req).then(function(r) {
          if (r) return r;
          return cache.match(BASE);
        }).then(function(r) {
          if (r) return r;
          return cache.match(BASE + 'index.html');
        }).then(function(cached) {
          if (cached) return cached;

          return fetch(req).then(function(resp) {
            if (resp.ok) {
              cache.put(BASE, resp.clone());
              cache.put(BASE + 'index.html', resp.clone());
            }
            return resp;
          });
        }).catch(function() {
          return new Response(
            '<!DOCTYPE html><html><head><meta charset=UTF-8>' +
            '<meta name=viewport content="width=device-width,initial-scale=1">' +
            '<style>body{background:#0b1020;color:#fff;font-family:system-ui;' +
            'display:flex;align-items:center;justify-content:center;height:100vh;' +
            'margin:0;flex-direction:column;gap:16px;text-align:center;padding:24px}' +
            'button{padding:12px 24px;border:none;border-radius:12px;background:#3b82f6;' +
            'color:#fff;font-weight:700;font-size:14px;cursor:pointer}</style></head>' +
            '<body><h2>MONIEZI</h2>' +
            '<p style="opacity:.6;font-size:14px;max-width:280px">Connect to the internet to set up the app. After that it works offline.</p>' +
            '<button onclick="location.reload()">Retry</button></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
    return;
  }

  // Assets: cache-first with runtime caching
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(req).then(function(cached) {
        if (cached) return cached;
        return fetch(req).then(function(resp) {
          if (resp.ok) cache.put(req, resp.clone());
          return resp;
        }).catch(function() {
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      });
    })
  );
});

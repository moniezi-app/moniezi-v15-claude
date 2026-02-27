import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Vite plugin: after build completes, scans dist/ and injects the real 
 * file list into service-worker.js so it can precache all hashed assets.
 */
function swAssetInjector(): Plugin {
  return {
    name: 'sw-asset-injector',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve('dist');
      const swPath = path.join(distDir, 'service-worker.js');

      if (!fs.existsSync(swPath)) {
        console.warn('[sw-asset-injector] service-worker.js not found in dist/');
        return;
      }

      // Walk dist/ and collect all file paths
      const assets: string[] = [];
      function walk(dir: string, prefix: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile()) {
            assets.push(prefix + entry.name);
          } else if (entry.isDirectory() && entry.name !== 'demo') {
            walk(path.join(dir, entry.name), prefix + entry.name + '/');
          }
        }
      }
      walk(distDir, '/');

      // Filter to precache-worthy files (skip demo images, duplicate favicons, etc.)
      const precache = assets.filter(a =>
        a.endsWith('.html') ||
        a.endsWith('.js') ||
        a.endsWith('.css') ||
        a.endsWith('.webmanifest') ||
        a === '/favicon.ico' ||
        a === '/favicon-32.png' ||
        (a.startsWith('/icons/') && (
          a.includes('icon-192') || a.includes('icon-512') || a.includes('apple-touch')
        ))
      ).filter(a => a !== '/service-worker.js'); // SW should NOT precache itself

      let sw = fs.readFileSync(swPath, 'utf8');
      sw = sw.replace('/*__PRECACHE_LIST__*/', JSON.stringify(precache, null, 2));
      fs.writeFileSync(swPath, sw);

      console.log(`\n[sw-asset-injector] Injected ${precache.length} assets into service-worker.js:`);
      precache.forEach(a => console.log(`  ${a}`));
    }
  };
}

export default defineConfig({
  plugins: [react(), swAssetInjector()],
  base: '/',
});

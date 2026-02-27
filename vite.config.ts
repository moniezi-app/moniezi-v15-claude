import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// CRITICAL: This must match your GitHub Pages repo name.
// Repo: moniezi-app/moniezi-v15-claude → deployed at /moniezi-v15-claude/
const BASE = '/moniezi-v15-claude/';

/**
 * After build: scan dist/ and inject all filenames into service-worker.js
 * so it can precache hashed Vite bundles (index-XXXX.js, index-XXXX.css).
 */
function swAssetInjector(): Plugin {
  return {
    name: 'sw-asset-injector',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve('dist');
      const swPath = path.join(distDir, 'service-worker.js');
      if (!fs.existsSync(swPath)) return;

      const assets: string[] = [];
      function walk(dir: string, prefix: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile()) assets.push(prefix + entry.name);
          else if (entry.isDirectory() && entry.name !== 'demo')
            walk(path.join(dir, entry.name), prefix + entry.name + '/');
        }
      }
      walk(distDir, BASE);

      // Only precache files needed for offline app launch
      const precache = assets.filter(a =>
        a.endsWith('.html') || a.endsWith('.js') || a.endsWith('.css') ||
        a.endsWith('.webmanifest') || a === BASE + 'favicon.ico' ||
        a === BASE + 'favicon-32.png' ||
        (a.includes('/icons/') && (a.includes('icon-192') || a.includes('icon-512') || a.includes('apple-touch')))
      ).filter(a => !a.endsWith('service-worker.js'));

      let sw = fs.readFileSync(swPath, 'utf8');
      sw = sw.replace("'/*__PRECACHE__*/'", JSON.stringify(precache));
      sw = sw.replace("'/*__BASE__*/'", JSON.stringify(BASE));
      fs.writeFileSync(swPath, sw);

      console.log(`\n[sw-asset-injector] base=${BASE}, ${precache.length} assets precached:`);
      precache.forEach(a => console.log('  ' + a));
    }
  };
}

export default defineConfig({
  plugins: [react(), swAssetInjector()],
  base: BASE,
});

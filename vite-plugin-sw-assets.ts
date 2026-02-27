import { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Vite plugin that injects the list of built assets into the service worker.
 * 
 * During build, Vite generates files with content hashes (e.g. index-Cj_XwW4y.js).
 * The service worker needs to know these filenames to precache them.
 * This plugin replaces a placeholder in service-worker.js with the actual file list.
 */
export function swAssetsPlugin(): Plugin {
  return {
    name: 'sw-assets-inject',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swPath = path.join(distDir, 'service-worker.js');
      
      if (!fs.existsSync(swPath)) return;

      // Collect all built assets
      const assets: string[] = [];
      
      function walk(dir: string, prefix: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            assets.push(prefix + entry.name);
          } else if (entry.isDirectory() && entry.name !== 'demo') {
            walk(path.join(dir, entry.name), prefix + entry.name + '/');
          }
        }
      }
      
      walk(distDir, '/');
      
      // Filter to only include important files for precaching
      const precacheAssets = assets.filter(a => 
        a.endsWith('.html') || 
        a.endsWith('.js') || 
        a.endsWith('.css') || 
        a.endsWith('.webmanifest') ||
        a === '/favicon.ico' ||
        a === '/favicon-32.png' ||
        a.match(/\/icons\/icon-(192|512)/) ||
        a.match(/\/icons\/apple-touch-icon/)
      );
      
      let sw = fs.readFileSync(swPath, 'utf8');
      sw = sw.replace(
        '/*__VITE_ASSETS__*/[]', 
        JSON.stringify(precacheAssets, null, 2)
      );
      fs.writeFileSync(swPath, sw);
      
      console.log(`\n[sw-assets] Injected ${precacheAssets.length} assets into service-worker.js`);
      precacheAssets.forEach(a => console.log(`  ${a}`));
    }
  };
}

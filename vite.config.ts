import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for MONIEZI
// base: '/' is required for iOS PWA offline launch from home screen.
// Relative base ('./') causes iOS to fail cache lookups when launching standalone,
// because the navigation URL is absolute but cached keys are relative — mismatch = network fallback = airplane mode dialog.
export default defineConfig({
  plugins: [react()],
  base: '/',
});

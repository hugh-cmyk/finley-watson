import { defineConfig } from 'vite';

// The site is served from the branch root on GitHub Pages, so the game lives at
// finleywatson.com/racer. We build straight into ../racer (committed) with a
// matching base path so all asset URLs resolve correctly.
export default defineConfig({
  base: '/racer/',
  build: {
    outDir: '../racer',
    emptyOutDir: true,
    target: 'es2020',
  },
});

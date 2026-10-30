// The pages of the application. Tauri shows them from this server while it is
// developed (`npm run dev`), and from `dist` once built.

import { defineConfig } from 'vite';

export default defineConfig({
  // Tauri waits for this very port: no other will do.
  server: { port: 5302, strictPort: true, fs: { allow: ['../..'] } },
  // What Tauri prints would be wiped off with the screen.
  clearScreen: false,
  optimizeDeps: { exclude: ['pdfjs-dist'] },
  build: { target: 'safari15', outDir: 'dist' },
});

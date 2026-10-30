import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5300, strictPort: true },
  preview: { port: 5300, strictPort: true },
  // PDF.js is loaded when it is first needed, as it is.
  optimizeDeps: { exclude: ['pdfjs-dist'] },
});

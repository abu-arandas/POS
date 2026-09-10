// Separate build config that produces a SINGLE self-contained index.html
// (all JS/CSS inlined, no code-split chunks) so the app runs by double-clicking
// from a flash drive (file://) on any OS with just a browser — no install, no
// server, no source code. Does not affect the normal `npm run build`.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'portable',
    // Inline everything into one file; disable chunking so there are no
    // external fetches that a file:// origin would block.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});

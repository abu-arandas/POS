import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Peel large eager vendors out of the entry chunk so they cache
          // independently and the initial payload stays small. (recharts is not
          // listed — it rides along in the lazily-loaded Dashboard chunk.)
          manualChunks: {
            motion: ['motion'],
            supabase: ['@supabase/supabase-js'],
            i18n: ['i18next', 'react-i18next'],
            dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via the DISABLE_HMR env var, which also
      // turns off file watching to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

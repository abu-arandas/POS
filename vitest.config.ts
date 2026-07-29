import { defineConfig } from 'vitest/config';

// Unit and component tests (Vitest) live in test/**, mirroring the src/**
// layout. The Playwright end-to-end specs in e2e/** are run separately via
// `npm run test:e2e`; scoping Vitest to test/ keeps it from ever collecting a
// Playwright spec (whose test()/expect() come from a different runner).
export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});

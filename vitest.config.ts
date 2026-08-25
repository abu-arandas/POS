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
    // Coverage includes the pure core, stores, and React components. Playwright
    // remains a separate end-to-end signal, but component branches should not
    // disappear from the unit-test coverage report.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/lib/**', 'src/stores/**', 'src/components/**'],
    },
  },
});

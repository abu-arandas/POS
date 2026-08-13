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
    // `npm run test:coverage` reports on the unit-testable core (pure lib
    // helpers and Zustand stores). Components are exercised by the component
    // suite and the Playwright e2e run, so they are out of this metric's scope.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/lib/**', 'src/stores/**'],
    },
  },
});

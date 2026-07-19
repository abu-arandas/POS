import { defineConfig } from 'vitest/config';

// Unit tests (Vitest) live in src/**. The Playwright end-to-end specs in e2e/**
// are run separately via `npm run test:e2e`; scope Vitest to src so it never
// tries to collect a Playwright spec (whose test()/expect() come from a
// different runner).
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

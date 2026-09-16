// Test runner config, kept separate from vite.config.ts.
//
// The app build has no business loading a test environment, and the tests have
// no business loading the React and Tailwind plugins: everything under test is
// deliberately pure and DOM-free (see src/lib/*, electron/*.cjs), which is what
// lets this run in milliseconds with no jsdom.
//
// `environment: 'node'` is therefore the point, not an omission. A module that
// needs a DOM to be tested is a module that has its layout tangled up in its
// arithmetic, and the split this project already maintains — numbers in lib/,
// pixels in components/ — is what these tests are here to keep honest.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.mjs'],
    reporters: 'dot',
  },
});

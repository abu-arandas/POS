// Vitest setup for component tests (jsdom environment).
import 'fake-indexeddb/auto'; // zustand stores persist via idb-keyval
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '../lib/i18n'; // initialize i18next so t() returns real English strings

// Auto-cleanup only registers itself when vitest globals are enabled; they
// aren't here, so unmount rendered trees between tests explicitly.
afterEach(() => cleanup());

// jsdom has no layout engine, so every element reports offsetWidth/Height 0.
// useModalA11y filters focusable elements by these — report 1 so the focus
// trap sees test DOM elements as visible.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return 1;
  },
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    return 1;
  },
});

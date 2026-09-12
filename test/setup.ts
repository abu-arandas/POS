// Vitest setup for component tests (jsdom environment).
import 'fake-indexeddb/auto'; // zustand stores persist via idb-keyval
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '../src/lib/i18n'; // initialize i18next so t() returns real English strings

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

// jsdom ships no matchMedia at all, and useMediaQuery is now what decides
// whether the cart is a rail or a sheet. Returning a dead `false` would mount
// every responsive component in its phone form regardless of the query, so
// this evaluates width queries against window.innerWidth (jsdom defaults to
// 1024) and lets a test resize by setting innerWidth and dispatching 'resize'.
type MediaListener = (event: MediaQueryListEvent) => void;
const mediaListeners = new Set<() => void>();
window.addEventListener('resize', () => mediaListeners.forEach((notify) => notify()));

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList => {
    const evaluate = () => {
      const min = /\(min-width:\s*(\d+)px\)/.exec(query);
      const max = /\(max-width:\s*(\d+)px\)/.exec(query);
      if (min) return window.innerWidth >= Number(min[1]);
      if (max) return window.innerWidth <= Number(max[1]);
      return false;
    };
    const wrapped = new Map<MediaListener | (() => void), () => void>();
    return {
      get matches() {
        return evaluate();
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: MediaListener | (() => void)) => {
        const notify = () => (listener as () => void)();
        wrapped.set(listener, notify);
        mediaListeners.add(notify);
      },
      removeEventListener: (_: string, listener: MediaListener | (() => void)) => {
        const notify = wrapped.get(listener);
        if (notify) mediaListeners.delete(notify);
        wrapped.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  },
});

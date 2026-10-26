/**
 * True when the demo fixtures (staff PINs, café menu, customers, tables) should
 * seed a fresh terminal: dev server, tests, and the public browser demo built
 * with `vite build --mode demo`. A normal production build stays empty.
 */
export const SEED_DEMO_FIXTURES =
  import.meta.env.DEV || import.meta.env.MODE === 'test' || import.meta.env.MODE === 'demo';

/**
 * The hosted browser demo (`vite build --mode demo`). It has no printer and no
 * kitchen hardware, so it starts with one catch-all kitchen station feeding the
 * Kitchen Display and with auto-print off, instead of a print dialog per sale.
 */
export const IS_PUBLIC_DEMO = import.meta.env.MODE === 'demo';

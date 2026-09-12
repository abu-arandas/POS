import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query and re-renders when it changes.
 *
 * This exists because some responsive decisions cannot be made in CSS. A
 * `hidden lg:flex` rail is still MOUNTED on a phone — it is only painted out —
 * so a component rendered in both a rail and a sheet puts two copies of itself
 * in the DOM, duplicating every id inside it. Choosing which one to mount is a
 * render decision, and a render decision needs the breakpoint in JS.
 *
 * useSyncExternalStore rather than useState + useEffect: the first paint reads
 * the real value instead of rendering the wrong branch and correcting it after
 * the effect flushes, which is what makes a sheet flash open on a desktop load.
 *
 * `fallback` is returned where matchMedia does not exist. Pass the branch that
 * keeps the component whole — for a desktop-width query that is `true`, since a
 * rail that renders everything is the safer of the two to degrade to.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const snapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
    return window.matchMedia(query).matches;
  }, [query, fallback]);

  return useSyncExternalStore(subscribe, snapshot, () => fallback);
}

/** The breakpoint at which the cart is a rail rather than a sheet — Tailwind `lg`. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

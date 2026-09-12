import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DESKTOP_QUERY, useMediaQuery } from '../../src/lib/useMediaQuery';

const setWidth = (width: number) => {
  (window as unknown as { innerWidth: number }).innerWidth = width;
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
};

describe('useMediaQuery', () => {
  afterEach(() => setWidth(1024));

  it('reports the query state on the first render, without a correcting pass', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY, true));
    // useSyncExternalStore reads the real value during render. A useState +
    // useEffect hook would return the fallback here and only correct after the
    // effect flushed, which is a frame of the wrong layout on every load.
    expect(result.current).toBe(true);
  });

  it('re-renders when the viewport crosses the breakpoint', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY, true));
    expect(result.current).toBe(true);

    setWidth(390);
    expect(result.current).toBe(false);

    setWidth(1024); // the boundary itself is desktop — min-width is inclusive
    expect(result.current).toBe(true);
  });

  it('returns the fallback where matchMedia does not exist', () => {
    const original = window.matchMedia;
    // @ts-expect-error — deliberately removing it to model the environment
    delete window.matchMedia;
    try {
      const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY, true));
      // true, not false: a component that degrades to its desktop branch still
      // renders everything it owns, which is the safer half to fall back to.
      expect(result.current).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });
});

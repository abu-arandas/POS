import { describe, it, expect } from 'vitest';
import { mapWithLimit } from '../../src/lib/concurrency';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('mapWithLimit', () => {
  it('preserves input order regardless of completion order', async () => {
    // Later items resolve sooner, so a naive push-on-complete would reorder.
    const out = await mapWithLimit([30, 20, 10], 3, async (ms) => {
      await tick(ms);
      return ms;
    });
    expect(out).toEqual([30, 20, 10]);
  });

  it('maps every item and passes the index', async () => {
    const out = await mapWithLimit(['a', 'b', 'c'], 2, async (v, i) => `${i}:${v}`);
    expect(out).toEqual(['0:a', '1:b', '2:c']);
  });

  it('never runs more than `limit` calls at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithLimit([...Array(12).keys()], 4, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // it actually parallelized
  });

  it('treats a limit below 1 as sequential', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithLimit([1, 2, 3], 0, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return n;
    });
    expect(peak).toBe(1);
  });

  it('resolves to an empty array without calling fn on empty input', async () => {
    let calls = 0;
    const out = await mapWithLimit([], 5, async (x) => {
      calls += 1;
      return x;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });
});

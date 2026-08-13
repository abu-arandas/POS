// Runs `fn` over `items` with at most `limit` promises in flight at once,
// returning results in the original input order. This bounds fan-out so a large
// list can't dispatch every request simultaneously (which can swamp a backend
// or trip rate limits, the downside of a bare `Promise.all(items.map(...))`)
// while still overlapping up to `limit` requests for throughput.
//
// A `limit` below 1 is treated as 1 (fully sequential). An empty input resolves
// to an empty array without invoking `fn`.
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.min(Math.max(1, Math.floor(limit)), items.length);
  let next = 0;

  async function worker(): Promise<void> {
    // Single-threaded event loop: reading and bumping `next` is atomic, so each
    // index is handed to exactly one worker.
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

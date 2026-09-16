/**
 * The calendar day a moment falls on *here*, as `YYYY-MM-DD`.
 *
 * `new Date().toISOString().slice(0, 10)` is the obvious way to write this and
 * is wrong everywhere except UTC, because it names the UTC day rather than the
 * local one. A terminal at UTC+3 — which is where this build's default currency
 * puts it — files a customer enrolled at 01:00 under yesterday, and one at UTC-5
 * stamps an evening export with tomorrow. Neither is a rounding error the
 * operator can reason about: the date simply reads wrong, on the three hours of
 * every night a late-closing till is most likely to still be serving.
 *
 * It also disagreed with the app itself. The dashboard buckets its days with
 * `Date.toDateString()`, which is local, so the ISO form named one day on the
 * export file while the figures inside it came from another.
 *
 * Local getters and not `toLocaleDateString`: the latter's output depends on
 * the locale, and this is a machine key, not something an operator reads.
 */
export function localDateKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

# Security and React Performance Notes

## Scope and disposition

This document records the source-level disposition of the Aug. 30, 2026 analysis report and the focused remediation applied to the Vite/React/Electron POS. The report contained no actionable SAST, secret, infrastructure, antipattern, complexity, or dead-code findings. Its quantity, password-bypass, dynamic-code, CSP, and new-window entries were verified against the cited source paths and were not reproducible as described.

A scanner report is still useful as a prompt to verify the authoritative boundary. For sales, the authoritative boundary is `buildSaleTransaction`, not a display-only subtotal. The transaction builder now rejects any line quantity that is not a positive safe integer before it validates tenders or assembles persisted monetary data. Pricing continues to sanitize hostile numeric inputs for display. Inventory adjustments remain a separate domain: negative stock deltas are legitimate waste/correction operations and are not subject to the sale-line predicate.

## Dependency advisory

The report identified `cacheable-request@7.0.4` through the development-only `electron-builder → app-builder-lib → @electron/get → got` chain. The existing override resolved its transitive `http-cache-semantics` dependency to `4.2.0`; it is now pinned explicitly to that verified patched version in `package.json`. The upstream GitHub advisory marks GHSA-8x6c-cv3v-vp6g as **withdrawn** while listing versions before `10.2.7` as affected, and the upstream Got discussion explains that upgrading the older CommonJS chain is not a simple dependency-only backport.[^1] [^2]

The project should not force a major toolchain rewrite solely to replace a withdrawn advisory. Re-run the dependency audit when the Electron builder chain is intentionally upgraded. The lockfile and audit result must remain part of that review. CI now runs `npm audit --audit-level=high` after installation so a future high-severity regression blocks the main branch.

## Updated report hardening

The updated report repeated several scanner patterns that were verified as false positives: fixed callback functions were mistaken for dynamic code execution, i18n and receipt values were mistaken for CSP construction, exact category-ID membership was mistaken for URL allowlist validation, and PIN-length checks were mistaken for skipped authentication. Those paths remain unchanged because source review and existing tests show no matching vulnerability.

Two low-risk hardening recommendations were implemented. Identifier generation no longer uses `Math.random()`; Web Crypto remains preferred, and an explicitly non-security-sensitive per-runtime compatibility fallback preserves operation in unusual plain-HTTP runtimes. Generated label, receipt, kitchen-ticket, and shift-report print windows now use a shared helper that detaches `window.opener` after opening while preserving the writable handle required by `document.write()` and browser printing. New tests cover both the compatibility identifier path and opener detachment.

The report’s quantity warnings are covered by the earlier `buildSaleTransaction` positive-safe-integer boundary. Negative inventory adjustments remain valid and intentionally are not rejected by the sale quantity predicate. The 55 docstring entries and eight duplicate-code groups contain report-artifact paths or no occurrence paths, so they were not treated as reliable instructions for a broad comment or abstraction rewrite; focused documentation remains the safer maintainability action.

## React/Vite performance changes

The application already lazy-loads non-register screens from `src/App.tsx`. This change extends that strategy to the register’s optional parked-order, payment, customer, and receipt dialogs. Those dialogs are mounted only when opened and are emitted as separate chunks, keeping the initial register chunk focused on product selection, cart interaction, and checkout preparation. The embedded QR-menu IPC payload is also memoized so changes to unrelated settings do not trigger redundant synchronization work.

| Build artifact                 |                 Before |              After | Effect                                          |
| ------------------------------ | ---------------------: | -----------------: | ----------------------------------------------- |
| Main renderer chunk, raw       |              451.72 kB |          432.48 kB | 19.24 kB smaller                                |
| Main renderer chunk, gzip      |              139.36 kB |          135.81 kB | 3.55 kB smaller                                 |
| Optional register modal chunks | Included in main chunk | 4 on-demand chunks | Loaded only when their dialogs open             |
| AreaChart chunk, gzip          |              108.48 kB |          108.48 kB | Remains isolated from the initial register path |
| Supabase chunk, gzip           |               57.42 kB |           57.42 kB | Remains isolated from the initial register path |

The changes follow the requested React guidance selectively for this client-rendered architecture: defer optional UI, preserve stable derived payloads, and avoid deep icon imports whose type declarations are not guaranteed in `lucide-react`.[^3] No Next.js-only server-component or server-cache pattern was introduced.

## Verification commands

Run the following commands from the repository root after dependency or renderer changes:

```bash
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev
npm audit --audit-level=high
```

The focused security tests are:

```bash
npm test -- --run test/lib/quantity.test.ts test/lib/checkout.test.ts test/lib/ids.test.ts test/lib/printWindow.test.ts
```

The end-to-end suite additionally exercises the browser checkout and role-navigation flows. Electron packaging and physical printer/network hardware should be verified in the supported desktop and device environment before release.

## Residual considerations

The project intentionally supports browser and Electron execution, offline persistence, optional Supabase synchronization, barcode scanners, and several printing transports. A future security review should continue to validate server-side Row Level Security and RPC authorization independently of client guards. A future dependency review should consider the broader Electron builder/Got upgrade path when it can be tested without disrupting packaging compatibility.

## References

[^1]: [GitHub Advisory Database: GHSA-8x6c-cv3v-vp6g](https://github.com/advisories/GHSA-8x6c-cv3v-vp6g), “Withdrawn: cacheable-request depends on http-cache-semantics, which is vulnerable to Regular Expression Denial of Service.”

[^2]: [Got issue #2220](https://github.com/sindresorhus/got/issues/2220), “Security: cacheable-request should be updated on the 11.x.x version.”

[^3]: [Vercel Engineering React and Next.js performance guidance](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js), “How we optimized package imports in Next.js.”

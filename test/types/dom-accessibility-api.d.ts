// dom-accessibility-api@0.5.x ships type declarations at dist/index.d.ts but its
// package.json "exports" map lists only "import"/"require" — no "types" — so
// TypeScript refuses to resolve them under bundler resolution. Re-exporting from
// the package specifier just re-enters the same broken map, so the one function
// the a11y guard uses is declared here. Drop this once upstream maps "types".
declare module 'dom-accessibility-api' {
  export function computeAccessibleName(
    element: Element,
    options?: {
      getComputedStyle?: (element: Element) => CSSStyleDeclaration;
      computedStyleSupportsPseudoElements?: boolean;
    },
  ): string;
}

interface LogoProps {
  size?: number;
  className?: string;
  /** Decorative by default; pass a title when it stands alone as the brand. */
  title?: string;
  /**
   * 'auto' follows the app theme (denim button on light, washed denim on dark).
   * 'dark' is for surfaces that are always dark whatever the theme, such as the
   * customer display.
   */
  tone?: 'auto' | 'dark';
}

const TONES = {
  auto: { button: 'var(--brand-denim)', holes: 'var(--brand-holes)', lit: 'var(--brand-thread)' },
  dark: { button: '#8eaef0', holes: '#0d121c', lit: '#ff9f5a' },
} as const;

/**
 * The Zirr mark: a shirt button whose four holes are app tiles, the top-right
 * one lit in thread orange. Inlined so it renders without a network/asset
 * fetch (the terminal runs offline) and scales crisply at any size. Kept in
 * sync with src/assets/logo-mark.svg, which is the source the committed app
 * and favicon rasters in buildResources/ and public/ were cut from (see
 * scripts/make-icons.mjs).
 *
 * Colours come from CSS variables through `style` rather than the fill
 * attribute, because var() in an SVG presentation attribute is not reliable
 * in every engine. The lit hole stays top-right in Arabic too: the mark is a
 * picture, not text, so it does not mirror.
 */
export default function Logo({ size = 32, className, title, tone = 'auto' }: LogoProps) {
  const c = TONES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="60" cy="60" r="52" style={{ fill: c.button }} />
      <circle
        cx="60"
        cy="60"
        r="43"
        fill="none"
        strokeOpacity="0.25"
        strokeWidth="3"
        style={{ stroke: c.holes }}
      />
      <rect x="38" y="38" width="19" height="19" rx="6" style={{ fill: c.holes }} />
      <rect x="63" y="38" width="19" height="19" rx="6" style={{ fill: c.lit }} />
      <rect x="38" y="63" width="19" height="19" rx="6" style={{ fill: c.holes }} />
      <rect x="63" y="63" width="19" height="19" rx="6" style={{ fill: c.holes }} />
    </svg>
  );
}

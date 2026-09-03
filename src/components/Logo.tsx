import { useId } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  /** Decorative by default; pass a title when it stands alone as the brand. */
  title?: string;
}

/**
 * The Arandas mark, inlined so it renders without a network/asset fetch (the
 * terminal runs offline) and inherits crisp scaling at any size. Kept in sync
 * with src/assets/logo-mark.svg, which is the source the app/favicon PNGs are
 * generated from — edit that file and re-run scripts/generate-icons.mjs.
 *
 * Gradients use userSpaceOnUse: an objectBoundingBox gradient renders nothing on
 * a shape whose bbox has zero height, which the horizontal crossbar does.
 * Gradient ids are namespaced with useId so several Logos on one page don't
 * collide (a duplicate id would make every instance take the first one's fill).
 */
export default function Logo({ size = 32, className, title }: LogoProps) {
  const uid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={`${uid}-a`}
          gradientUnits="userSpaceOnUse"
          x1="140"
          y1="410"
          x2="380"
          y2="140"
        >
          <stop offset="0" stopColor="#17439a" />
          <stop offset="0.55" stopColor="#2b7fd4" />
          <stop offset="1" stopColor="#3ec6f5" />
        </linearGradient>
        <linearGradient
          id={`${uid}-s`}
          gradientUnits="userSpaceOnUse"
          x1="96"
          y1="330"
          x2="410"
          y2="190"
        >
          <stop offset="0" stopColor="#1c3f86" />
          <stop offset="0.45" stopColor="#2f9bdd" />
          <stop offset="1" stopColor="#5cdcff" />
        </linearGradient>
        <linearGradient
          id={`${uid}-k`}
          gradientUnits="userSpaceOnUse"
          x1="343"
          y1="62"
          x2="453"
          y2="172"
        >
          <stop offset="0" stopColor="#8eecff" />
          <stop offset="1" stopColor="#29b6f6" />
        </linearGradient>
      </defs>

      <g
        fill="none"
        stroke={`url(#${uid}-a)`}
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M148 402 L256 148" />
        <path d="M256 148 L364 402" />
        <path d="M205 352 L307 352" />
      </g>

      <path
        d="M96 322 C 150 232, 262 190, 356 214"
        fill="none"
        stroke={`url(#${uid}-s)`}
        strokeWidth="28"
        strokeLinecap="round"
      />
      <path d="M330 168 L410 206 L344 258 Z" fill={`url(#${uid}-s)`} />

      <g fill="#2f7fd0">
        <circle cx="103" cy="312" r="18" />
        <circle cx="196" cy="244" r="15" />
        <circle cx="300" cy="206" r="15" />
      </g>

      <path
        d="M398 62 L411 104 L453 117 L411 130 L398 172 L385 130 L343 117 L385 104 Z"
        fill={`url(#${uid}-k)`}
      />
    </svg>
  );
}

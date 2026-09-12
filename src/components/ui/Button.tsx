import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { PRESS, SNAP } from './motion';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders at full width — the default for anything inside a mobile sheet. */
  block?: boolean;
  /** Shown before the label; omitted from the accessible name. */
  icon?: ReactNode;
  /**
   * Swaps the icon for a spinner and disables the button. The LABEL stays:
   * a button that loses its text mid-action leaves the operator unsure what
   * they pressed, and the width collapse shifts everything beside it.
   */
  busy?: boolean;
}

/**
 * Every button in the app.
 *
 * Sizes are floors, not suggestions: even `sm` clears 36px and the default
 * clears 44px, which is the smallest target a thumb hits reliably on a counter
 * with a queue waiting. The old buttons were `py-2.5` with no minimum, so a
 * short label produced a 32px target.
 *
 * Colour comes from the semantic tokens, never from a `slate-x dark:slate-y`
 * pair — that pattern is what pinned the old screens to a dark palette whatever
 * the theme said, and it is why `primary` here is legible on both.
 */
const VARIANT: Record<ButtonVariant, string> = {
  // White on #047857 — 5.48:1.
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  // A real border rather than a fill, so it reads as a control at a glance.
  secondary: 'bg-surface text-ink border border-control hover:bg-sunken',
  ghost: 'bg-transparent text-ink-muted hover:bg-sunken hover:text-ink',
  // White on #be123c — 6.29:1.
  danger: 'bg-danger text-white hover:brightness-110 shadow-sm',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-small gap-1.5',
  md: 'min-h-11 px-4 text-body gap-2',
  lg: 'min-h-14 px-6 text-lead gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    block,
    icon,
    busy,
    disabled,
    children,
    className = '',
    ...rest
  },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || busy ? undefined : PRESS}
      transition={SNAP}
      disabled={disabled || busy}
      // aria-busy rather than swapping the label for a spinner alone: a screen
      // reader should hear that the same action is in progress, not that the
      // button became a different control. Same reason the visible label stays
      // below — only the icon slot changes.
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center rounded-control font-semibold
        transition-colors outline-none
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        focus-visible:ring-offset-canvas
        disabled:opacity-50 disabled:pointer-events-none
        ${VARIANT[variant]} ${SIZE[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {busy ? (
        <span
          aria-hidden
          className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      ) : (
        icon
      )}
      {children}
    </motion.button>
  );
});

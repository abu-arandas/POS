import type { Transition, Variants } from 'motion/react';

/**
 * The app's motion vocabulary, in one place.
 *
 * Animation on a till is not decoration — it is feedback about whether a tap
 * registered, and it has to stay out of the way of someone working a queue.
 * Two rules follow from that, and everything here obeys them:
 *
 *   Nothing that blocks the operator lasts longer than ~220ms. A cart line
 *   appearing, a sheet opening, a press responding: if the next tap lands
 *   mid-animation, the animation is too slow.
 *
 *   Motion says where something came from. A sheet rises from the edge it is
 *   anchored to, a line slides in from the side it was added on. Fades alone
 *   are used only where there is no spatial story to tell.
 *
 * Reduced motion is handled globally by <MotionConfig reducedMotion="user"> in
 * App.tsx, which strips transforms while keeping opacity — so these presets do
 * not each re-implement that check.
 */

/** The default: quick, decelerating, no overshoot. Use unless a spring earns it. */
export const SNAP: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

/** Slightly longer, for larger surfaces travelling further (sheets, modals). */
export const GLIDE: Transition = { duration: 0.24, ease: [0.32, 0.72, 0, 1] };

/**
 * A small overshoot, reserved for things the operator just created — a line
 * added to the cart, a payment confirmed. The bounce reads as acknowledgement,
 * so spending it on incidental UI makes the real confirmations mean less.
 */
export const POP: Transition = { type: 'spring', stiffness: 520, damping: 30, mass: 0.7 };

/** Press feedback. Applied via whileTap so it survives reduced-motion sensibly. */
export const PRESS = { scale: 0.97 } as const;

/**
 * A list whose children arrive in sequence. Deliberately tight: 18ms apart and
 * capped by the caller, because a stagger long enough to notice on a 40-item
 * product grid is a stagger the operator is waiting on.
 */
export const listContainer: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.018, delayChildren: 0.02 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: SNAP },
};

/** A panel sliding up from the bottom edge — the mobile cart, pickers, filters. */
export const sheetUp: Variants = {
  hidden: { y: '100%' },
  shown: { y: 0, transition: GLIDE },
  gone: { y: '100%', transition: { duration: 0.18, ease: [0.32, 0.72, 0, 1] } },
};

/** The scrim behind any overlay. Opacity only: it has no position to travel from. */
export const scrim: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.16 } },
  gone: { opacity: 0, transition: { duration: 0.14 } },
};

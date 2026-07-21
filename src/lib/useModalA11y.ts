import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Dialog accessibility for a conditionally rendered modal card: traps Tab
 * focus inside the card, closes on Escape, moves focus into the card when it
 * opens, and restores focus to the previously focused element when it closes.
 *
 * Attach the returned ref to the modal card element and give that element
 * `role="dialog"`, `aria-modal="true"`, a label (`aria-labelledby` or
 * `aria-label`) and `tabIndex={-1}` in the markup. An element inside the card
 * marked with `data-autofocus` receives initial focus; otherwise the first
 * focusable element does.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose?: () => void,
) {
  const ref = useRef<T | null>(null);
  // Keep the latest onClose without re-running the trap effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const card = ref.current;
    if (!card) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    const initial =
      card.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? card;
    initial.focus({ preventScroll: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !card.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !card.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the trap wins over app-level shortcuts while open.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return ref;
}

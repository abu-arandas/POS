import { type ReactNode } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { useModalA11y } from '../../lib/useModalA11y';
import { scrim, sheetUp, SNAP } from './motion';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Shown under the title — a count, a total, whatever qualifies the sheet. */
  subtitle?: ReactNode;
  /** Pinned to the bottom, outside the scroll area: the sheet's primary action. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A panel that rises from the bottom edge, for anything that is a side rail on
 * a desktop till and cannot be one on a phone — the cart, filters, a picker.
 *
 * Three details that decide whether it is usable one-handed:
 *
 *   It is capped at 88vh and its body scrolls, so a long cart never pushes the
 *   pay button off-screen. The footer sits outside that scroll area.
 *
 *   It can be flung down to dismiss, because reaching a small ✕ at the top of a
 *   tall sheet with one thumb is the thing people actually fail at. The gesture
 *   starts ONLY from the handle and header, never the body: with the whole
 *   dialog draggable, a fast downward flick to scroll a long cart cleared the
 *   velocity threshold and closed the sheet mid-order. A distance threshold
 *   alone would not have saved it — the flick supplies the velocity.
 *
 *   Bottom padding respects the home indicator via env(safe-area-inset-bottom);
 *   without it the pay button sits under the iOS gesture bar.
 */
export function Sheet({ open, onClose, title, subtitle, footer, children }: SheetProps) {
  const ref = useModalA11y<HTMLDivElement>(open, onClose);
  // dragListener={false} below hands gesture initiation to these controls, so
  // only the elements that call start() below can begin a drag.
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            variants={scrim}
            initial="hidden"
            animate="shown"
            exit="gone"
            onClick={onClose}
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            variants={sheetUp}
            initial="hidden"
            animate="shown"
            exit="gone"
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            // Commit on distance OR speed: a slow deliberate pull and a quick
            // flick are both "close", and requiring distance alone makes the
            // flick feel ignored.
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className="relative w-full sm:max-w-lg max-h-[88vh] flex flex-col
              bg-surface text-ink rounded-t-sheet sm:rounded-sheet
              border-t sm:border border-line shadow-2xl outline-none"
          >
            {/* The drag region. `touchAction: none` is required here and only
                here: it tells the browser not to claim the vertical gesture for
                scrolling, which is exactly what the sheet body below still
                wants it to do. */}
            <div
              onPointerDown={(event) => dragControls.start(event)}
              style={{ touchAction: 'none' }}
              className="shrink-0"
            >
              {/* The grab handle is the affordance for the drag — without it
                  nobody discovers the gesture. Hidden once the sheet is a centred
                  dialog on wider screens, where dragging means nothing. */}
              <div className="sm:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
                <div className="h-1.5 w-10 rounded-full bg-line-strong" />
              </div>

              <header className="flex items-start gap-3 px-5 pt-3 pb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lead font-bold tracking-tight truncate">{title}</h2>
                  {subtitle && <div className="text-small text-ink-muted mt-0.5">{subtitle}</div>}
                </div>
                <motion.button
                  type="button"
                  onClick={onClose}
                  // Without this the close button is part of the drag region, so
                  // pressing it starts a gesture and the tap reads as a 0px drag
                  // rather than a click.
                  onPointerDown={(event) => event.stopPropagation()}
                  whileTap={{ scale: 0.92 }}
                  transition={SNAP}
                  aria-label="Close"
                  className="shrink-0 size-11 -me-2 -mt-1 grid place-items-center rounded-control
                    text-ink-muted hover:text-ink hover:bg-sunken transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X size={20} />
                </motion.button>
              </header>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5">{children}</div>

            {footer && (
              <footer
                className="shrink-0 px-5 pt-4 border-t border-line bg-surface rounded-b-sheet"
                style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              >
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

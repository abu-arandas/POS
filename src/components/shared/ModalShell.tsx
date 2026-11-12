import type { ReactNode, RefObject } from 'react';
import { motion } from 'motion/react';

export interface ModalShellProps {
  id?: string;
  modalRef: RefObject<HTMLDivElement | null>;
  titleId: string;
  className: string;
  children: ReactNode;
  compactAnimation?: boolean;
}

/**
 * Shared modal frame for the form dialogs used by Inventory and Settings.
 * Keeping the dialog semantics in one place makes future extracted forms less
 * likely to omit the focus target, accessible title relationship, or exit
 * animation while preserving each form's content-specific sizing.
 */
export function ModalShell({
  id,
  modalRef,
  titleId,
  className,
  children,
  compactAnimation = false,
}: ModalShellProps) {
  return (
    <div id={id} className="modal-backdrop fixed inset-0 flex items-center justify-center z-50 p-4">
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={
          compactAnimation ? { opacity: 0, scale: 0.95, y: 10 } : { scale: 0.95, opacity: 0, y: 20 }
        }
        animate={compactAnimation ? { opacity: 1, scale: 1, y: 0 } : { scale: 1, opacity: 1, y: 0 }}
        exit={
          compactAnimation ? { opacity: 0, scale: 0.95, y: 10 } : { scale: 0.95, opacity: 0, y: 20 }
        }
        className={`modal-card ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
}

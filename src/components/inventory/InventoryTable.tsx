import type { ReactNode } from 'react';
import { motion } from 'motion/react';

/**
 * The scrolling table shell the suppliers, purchase-order and stock-log tabs
 * all render: the fade-in card, the scroll container, and a sticky header row.
 * Only the header cells and body rows differ between them.
 */
export interface InventoryTableProps {
  /** The `<th>` cells of the sticky header row. */
  header: ReactNode;
  /** The `<tr>` rows of the table body. */
  children: ReactNode;
}

/**
 * Renders the shell: a fade-in card, a scroll container, and a table whose
 * header row stays put while the body scrolls under it.
 */
export function InventoryTable({ header, children }: InventoryTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-hidden flex flex-col bg-card border border-border rounded-xl shadow-2xs"
    >
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="bg-muted/70 text-muted-foreground text-[11px] font-medium uppercase tracking-wider font-mono border-b border-border sticky top-0 z-10 backdrop-blur-xs">
              {header}
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs text-foreground">
            {children}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

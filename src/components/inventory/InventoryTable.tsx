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

export function InventoryTable({ header, children }: InventoryTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-hidden flex flex-col surface rounded-2xl"
    >
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="bg-white/90 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-slate-200 dark:border-white/5 sticky top-0 z-10 backdrop-blur-md">
              {header}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm text-slate-700 dark:text-slate-200">
            {children}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

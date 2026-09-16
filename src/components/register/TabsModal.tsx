import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Receipt, Plus, Trash2, CreditCard, Users, Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StoreSettings, Tab } from '../../types';
import {
  isTabEmpty,
  openTabs,
  tabAgeMinutes,
  tabItems,
  tabTotal,
  tabUnitCount,
} from '../../lib/tabs';

interface TabsModalProps {
  open: boolean;
  /** Ref for the dialog card, from useModalA11y (focus trap / Escape / restore). */
  dialogRef: RefObject<HTMLDivElement | null>;
  tabs: Tab[];
  settings: StoreSettings;
  /** Units waiting in the register's cart, which is what "add a round" moves. */
  cartCount: number;
  /** Clock for the age column; passed in so the list is not its own timer. */
  now: number;
  onClose: () => void;
  onOpenTab: () => void;
  onAddRound: (tab: Tab) => void;
  onSettle: (tab: Tab) => void;
  onDiscard: (tab: Tab) => void;
}

/**
 * The open-tabs list: what each table or regular currently owes, and the three
 * things an operator does about it — add the cart to it, settle it, or throw
 * away one that was opened by mistake.
 *
 * Settling from here rather than by loading the tab into the cart is
 * deliberate. The tab IS the bill; loading it into an editable cart would
 * invite a settlement that quietly disagrees with the tab it claims to settle,
 * and the sale is recorded against the tab's own lines (see settleTab). An
 * operator who needs to change what is on the bill removes the round that is
 * wrong, which leaves a record, rather than silently editing a total.
 */
export function TabsModal({
  open,
  dialogRef,
  tabs,
  settings,
  cartCount,
  now,
  onClose,
  onOpenTab,
  onAddRound,
  onSettle,
  onDiscard,
}: TabsModalProps) {
  const { t } = useTranslation();
  const live = openTabs(tabs);

  return (
    <AnimatePresence>
      {open && (
        <div
          id="tabs-modal"
          className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tabs-title"
            tabIndex={-1}
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="modal-card max-w-lg w-full overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-4 flex justify-between items-center border-b border-border">
              <h3
                id="tabs-title"
                className="font-semibold text-foreground text-sm flex items-center gap-2"
              >
                <div className="p-1.5 bg-muted rounded-lg text-foreground">
                  <Receipt size={15} />
                </div>
                {t('register.openTabs')}
                <span className="bg-muted text-muted-foreground border border-border font-mono px-1.5 py-0.2 rounded-full text-[10px] ms-1">
                  {live.length}
                </span>
              </h3>
              <button
                onClick={onClose}
                aria-label={t('register.close')}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 border-b border-border">
              <button
                onClick={onOpenTab}
                disabled={cartCount === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold bg-foreground text-background disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Plus size={14} />
                {t('register.openTabFromCart', { count: cartCount })}
              </button>
              {cartCount === 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  {t('register.openTabNeedsCart')}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {live.length === 0 ? (
                <div className="py-10 text-center">
                  <Receipt size={28} className="mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">{t('register.noOpenTabs')}</p>
                </div>
              ) : (
                live.map((tab) => {
                  const total = tabTotal(tab, settings);
                  const units = tabUnitCount(tab);
                  const age = tabAgeMinutes(tab, now);
                  const empty = isTabEmpty(tab);
                  return (
                    <div
                      key={tab.id}
                      className="rounded-xl border border-border bg-secondary/30 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {tab.label}
                          </p>
                          <div className="flex items-center gap-2.5 mt-1 text-[11px] text-muted-foreground font-mono">
                            <span className="flex items-center gap-1">
                              <Clock3 size={10} />
                              {t('register.tabAge', { count: age })}
                            </span>
                            <span>{t('register.tabRounds', { count: tab.rounds.length })}</span>
                            <span>{t('register.tabUnits', { count: units })}</span>
                          </div>
                          {tab.customerName && (
                            <p className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                              <Users size={10} />
                              {tab.customerName}
                            </p>
                          )}
                        </div>
                        <span className="font-mono font-bold text-base text-foreground num shrink-0">
                          {settings.currency}
                          {total.toFixed(2)}
                        </span>
                      </div>

                      {/* The bill itself, so the operator can read it back to
                          the table without settling first. */}
                      {!empty && (
                        <ul className="mb-3 space-y-0.5">
                          {tabItems(tab).map((line, index) => (
                            <li
                              key={`${line.productId}-${line.variantId ?? ''}-${index}`}
                              className="flex justify-between gap-2 text-[11px] text-muted-foreground"
                            >
                              <span className="truncate">
                                {line.quantity}x{' '}
                                {line.variantName
                                  ? `${line.productName} — ${line.variantName}`
                                  : line.productName}
                              </span>
                              <span className="font-mono num shrink-0">
                                {settings.currency}
                                {(line.price * line.quantity).toFixed(2)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onAddRound(tab)}
                          disabled={cartCount === 0}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold border border-border text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus size={12} />
                          {t('register.addRound')}
                        </button>
                        <button
                          onClick={() => onSettle(tab)}
                          disabled={empty}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold bg-foreground text-background disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                        >
                          <CreditCard size={12} />
                          {t('register.settleTab')}
                        </button>
                        <button
                          onClick={() => onDiscard(tab)}
                          aria-label={t('register.discardTab')}
                          title={t('register.discardTab')}
                          className="p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

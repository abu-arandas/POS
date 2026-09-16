import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Utensils,
  Clock,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Flame,
  ChefHat,
  ShoppingBag,
  Truck,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useKdsStore } from '../stores/kdsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { playKitchenBell } from '../lib/audioFeedback';
import { notify } from '../lib/utils/ui';

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
      setElapsedSeconds(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  let colorClass = 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10';
  if (mins >= 10) {
    colorClass = 'text-rose-500 border-rose-500/30 bg-rose-500/10 animate-pulse';
  } else if (mins >= 5) {
    colorClass = 'text-amber-500 border-amber-500/20 bg-amber-500/10';
  }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold ${colorClass}`}>
      <Clock size={12} />
      <span>{timeStr}</span>
    </div>
  );
}

export function KitchenDisplay() {
  const { t } = useTranslation();
  const tickets = useKdsStore((s) => s.tickets);
  const recentlyBumped = useKdsStore((s) => s.recentlyBumped);
  const activeStationFilter = useKdsStore((s) => s.activeStationFilter);
  const autoSound = useKdsStore((s) => s.autoSound);
  const bumpTicket = useKdsStore((s) => s.bumpTicket);
  const recallTicket = useKdsStore((s) => s.recallTicket);
  const toggleItemComplete = useKdsStore((s) => s.toggleItemComplete);
  const setActiveStationFilter = useKdsStore((s) => s.setActiveStationFilter);
  const toggleAutoSound = useKdsStore((s) => s.toggleAutoSound);

  const kitchenStations = useSettingsStore((s) => s.kitchenStations);

  // Status filtering
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');

  // The service chime belongs here, not in the store. addTicket() runs inside
  // commitSale — that is the CASHIER's tab, so ringing it there meant the
  // kitchen display, which is the screen the sound is for, stayed silent.
  // Keyed on the newest ticket id so a re-render never re-rings it.
  const newestTicketId = tickets[0]?.id ?? null;
  const lastRungRef = useRef<string | null>(newestTicketId);
  useEffect(() => {
    if (!newestTicketId || newestTicketId === lastRungRef.current) return;
    lastRungRef.current = newestTicketId;
    if (autoSound) playKitchenBell();
  }, [newestTicketId, autoSound]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (activeStationFilter !== 'all') {
        const hasStationItem = ticket.items.some(
          (item) => item.stationName?.toLowerCase() === activeStationFilter.toLowerCase() || item.stationId === activeStationFilter,
        );
        if (!hasStationItem) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, activeStationFilter]);

  const stats = useMemo(() => {
    const pending = tickets.filter((t) => t.status === 'pending').length;
    const preparing = tickets.filter((t) => t.status === 'preparing').length;
    const ready = tickets.filter((t) => t.status === 'ready').length;
    return { pending, preparing, ready, total: tickets.length };
  }, [tickets]);

  const handleRecall = () => {
    const restored = recallTicket();
    if (restored) {
      notify(t('kds.ticketRecalled', { defaultValue: `Recalled ticket ${restored.orderNumber}` }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* KDS Header */}
      <header className="px-6 py-3.5 border-b border-border bg-card/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <ChefHat size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-base tracking-tight">
                {t('kds.title', { defaultValue: 'Kitchen Display System' })}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border">
                {stats.total} active
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('kds.subtitle', { defaultValue: 'Live ticket management, timer countdowns & station routing' })}
            </p>
          </div>
        </div>

        {/* Status Pill Filters */}
        <div className="flex items-center gap-1.5 bg-secondary/70 p-1 rounded-xl border border-border">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('kds.all', { defaultValue: 'All' })} ({stats.total})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'pending'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="size-2 rounded-full bg-slate-400" />
            {t('kds.new', { defaultValue: 'New' })} ({stats.pending})
          </button>
          <button
            onClick={() => setStatusFilter('preparing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'preparing'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="size-2 rounded-full bg-blue-500 animate-ping" />
            {t('kds.cooking', { defaultValue: 'Cooking' })} ({stats.preparing})
          </button>
          <button
            onClick={() => setStatusFilter('ready')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'ready'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="size-2 rounded-full bg-emerald-500" />
            {t('kds.ready', { defaultValue: 'Ready' })} ({stats.ready})
          </button>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoSound}
            title={autoSound ? 'Chime sound on' : 'Chime sound off'}
            className={`size-9 rounded-xl border flex items-center justify-center transition-colors ${
              autoSound
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {autoSound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={handleRecall}
            disabled={recentlyBumped.length === 0}
            className={`px-3 h-9 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all ${
              recentlyBumped.length > 0
                ? 'bg-card border-border text-foreground hover:border-foreground/30 shadow-xs cursor-pointer'
                : 'opacity-40 border-border/60 text-muted-foreground cursor-not-allowed'
            }`}
          >
            <RotateCcw size={13} />
            <span>{t('kds.recall', { defaultValue: 'Recall Last' })}</span>
            {recentlyBumped.length > 0 && (
              <span className="text-[10px] font-mono opacity-60">({recentlyBumped.length})</span>
            )}
          </button>
        </div>
      </header>

      {/* Stations bar (if stations are configured) */}
      {kitchenStations.length > 0 && (
        <div className="px-6 py-2 border-b border-border/60 bg-muted/20 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-mono uppercase text-muted-foreground me-1">
            {t('kds.station', { defaultValue: 'Station' })}:
          </span>
          <button
            onClick={() => setActiveStationFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeStationFilter === 'all'
                ? 'bg-foreground text-background'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('kds.allStations', { defaultValue: 'All Stations' })}
          </button>
          {kitchenStations.map((station) => (
            <button
              key={station.id}
              onClick={() => setActiveStationFilter(station.name)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeStationFilter === station.name
                  ? 'bg-foreground text-background'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {station.name}
            </button>
          ))}
        </div>
      )}

      {/* Main tickets grid */}
      <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
        {filteredTickets.length === 0 ? (
          <div className="size-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
            <div className="size-16 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground mb-4 border border-border">
              <Utensils size={28} />
            </div>
            <h3 className="font-semibold text-lg text-foreground mb-1">
              {t('kds.noTicketsTitle', { defaultValue: 'Kitchen All Clear!' })}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t(
                'kds.noTicketsDesc',
                { defaultValue: 'No active kitchen tickets in this view. New dine-in, takeaway, and delivery orders will appear here automatically.' },
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
            <AnimatePresence>
              {filteredTickets.map((ticket) => {
                const isPending = ticket.status === 'pending';
                const isPreparing = ticket.status === 'preparing';
                const isReady = ticket.status === 'ready';

                return (
                  <motion.div
                    key={ticket.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className={`rounded-2xl border bg-card flex flex-col shadow-xs overflow-hidden transition-all duration-200 ${
                      isReady
                        ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                        : isPreparing
                          ? 'border-blue-500/40'
                          : 'border-border'
                    }`}
                  >
                    {/* Ticket Header */}
                    <div className="p-3.5 border-b border-border/80 bg-secondary/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-foreground">
                          {ticket.orderNumber}
                        </span>
                        {/* Order Type Badge */}
                        {ticket.orderType === 'dine_in' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <Utensils size={10} />
                            {ticket.tableNumber ? `Table ${ticket.tableNumber}` : 'Dine-In'}
                          </span>
                        )}
                        {ticket.orderType === 'takeaway' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <ShoppingBag size={10} />
                            Takeaway
                          </span>
                        )}
                        {ticket.orderType === 'delivery' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            <Truck size={10} />
                            Delivery
                          </span>
                        )}
                      </div>

                      <ElapsedTimer createdAt={ticket.createdAt} />
                    </div>

                    {/* Customer & Server meta if present */}
                    {(ticket.customerName || ticket.serverName) && (
                      <div className="px-3.5 py-1.5 border-b border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                        {ticket.customerName && (
                          <span className="truncate">Guest: {ticket.customerName}</span>
                        )}
                        {ticket.serverName && (
                          <span className="truncate opacity-75">Server: {ticket.serverName}</span>
                        )}
                      </div>
                    )}

                    {/* Items List */}
                    <div className="p-3.5 flex-1 space-y-2.5 overflow-y-auto max-h-[360px]">
                      {ticket.items.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => toggleItemComplete(ticket.id, item.id)}
                          className={`p-2 rounded-xl border border-transparent transition-all cursor-pointer select-none hover:bg-secondary/60 ${
                            item.completed
                              ? 'opacity-40 line-through bg-secondary/20'
                              : 'bg-secondary/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="size-6 rounded-md bg-foreground text-background font-mono text-xs font-bold flex items-center justify-center shrink-0">
                                {item.quantity}
                              </span>
                              <div>
                                <h4 className="font-semibold text-xs text-foreground leading-snug">
                                  {item.productName}
                                </h4>
                                {item.variantName && (
                                  <span className="text-[11px] text-muted-foreground block">
                                    {item.variantName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className={`size-5 rounded border flex items-center justify-center transition-colors ${
                              item.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                            }`}>
                              {item.completed && <Check size={12} className="stroke-3" />}
                            </div>
                          </div>

                          {/* Modifiers / Customizations */}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="mt-1.5 ps-8 flex flex-wrap gap-1">
                              {item.modifiers.map((m) => (
                                <span
                                  key={m.optionId}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-foreground/90 font-medium"
                                >
                                  +{m.optionName}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.notes && (
                            <p className="mt-1 ps-8 text-[11px] text-amber-500 italic">
                              "{item.notes}"
                            </p>
                          )}
                        </div>
                      ))}

                      {ticket.notes && (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                          <span className="font-semibold">Note:</span> {ticket.notes}
                        </div>
                      )}
                    </div>

                    {/* Bump / Action Footer */}
                    <div className="p-3 border-t border-border bg-card flex items-center gap-2">
                      <button
                        onClick={() => bumpTicket(ticket.id)}
                        className={`flex-1 h-10 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                          isReady
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                            : isPreparing
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                              : 'btn-secondary'
                        }`}
                      >
                        {isPending && (
                          <>
                            <Flame size={14} />
                            <span>{t('kds.startCooking', { defaultValue: 'Start Cooking' })}</span>
                          </>
                        )}
                        {isPreparing && (
                          <>
                            <CheckCircle2 size={14} />
                            <span>{t('kds.markReady', { defaultValue: 'Mark Ready' })}</span>
                          </>
                        )}
                        {isReady && (
                          <>
                            <Check size={14} className="stroke-3" />
                            <span>{t('kds.bumpComplete', { defaultValue: 'Bump / Complete' })}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

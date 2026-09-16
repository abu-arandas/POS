import { useState, useEffect } from 'react';
import {
  ShoppingBag,
  CheckCircle2,
  QrCode,
  Sparkles,
  Maximize,
  Minimize,
  Clock,
  Flame,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToCfd, CfdPayload } from '../lib/cfdChannel';
import { useSettingsStore } from '../stores/settingsStore';
import Logo from './Logo';

export function CustomerDisplay() {
  const settings = useSettingsStore((s) => s.settings);

  const [cfdData, setCfdData] = useState<CfdPayload>({
    type: 'CFD_UPDATE',
    status: 'idle',
    storeName: settings.storeName || 'SJ Grill',
    currency: settings.currency || '$',
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [time, setTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToCfd((payload) => {
      setCfdData(payload);
    });
    return unsubscribe;
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isIdle = cfdData.status === 'idle' || cfdData.items.length === 0;
  const isCompleted = cfdData.status === 'completed';
  const isPaying = cfdData.status === 'paying';

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden select-none font-sans">
      {/* Top Brand Bar */}
      <header className="px-8 py-4 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-primary">
            <Logo size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-zinc-100 leading-tight">
              {cfdData.storeName || settings.storeName || 'SJ Grill'}
            </h1>
            <p className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Customer Screen Active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-mono text-zinc-400 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
            <Clock size={14} />
            <span>{time}</span>
          </div>
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="size-9 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {isCompleted ? (
            /* ── Completed / Thank You State ── */
            <motion.div
              key="completed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="size-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 shadow-2xl shadow-emerald-500/10 animate-bounce">
                <CheckCircle2 size={54} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-zinc-100 mb-2">
                Thank You for Your Order!
              </h2>
              <p className="text-zinc-400 text-sm max-w-md mb-8">
                Your payment was processed successfully. Please collect your receipt and enjoy your meal!
              </p>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 min-w-[320px] max-w-sm space-y-3 font-mono">
                <div className="flex justify-between items-center text-sm text-zinc-400">
                  <span>Total Paid:</span>
                  <span className="font-bold text-zinc-100">
                    {cfdData.currency}
                    {(cfdData.paidAmount ?? cfdData.total).toFixed(2)}
                  </span>
                </div>
                {cfdData.changeDue !== undefined && cfdData.changeDue > 0 && (
                  <div className="flex justify-between items-center text-sm text-emerald-400 border-t border-dashed border-zinc-800 pt-2">
                    <span>Change Returned:</span>
                    <span className="font-bold">
                      {cfdData.currency}
                      {cfdData.changeDue.toFixed(2)}
                    </span>
                  </div>
                )}
                {cfdData.orderNumber && (
                  <div className="flex justify-between items-center text-xs text-zinc-500 border-t border-zinc-800 pt-2">
                    <span>Order:</span>
                    <span className="font-bold text-zinc-300">{cfdData.orderNumber}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ) : isIdle ? (
            /* ── Idle / Welcome Promotions State ── */
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col lg:flex-row items-center justify-center p-8 lg:p-16 gap-12 max-w-6xl mx-auto"
            >
              <div className="flex-1 space-y-6">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 border border-primary/20 text-primary">
                  <Flame size={13} />
                  Welcome to {cfdData.storeName || settings.storeName}
                </span>
                <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-zinc-100 leading-tight">
                  Fresh Flavors & Artisanal Grills.
                </h2>
                <p className="text-zinc-400 text-base leading-relaxed max-w-lg">
                  Place your order with our cashier. Scan barcodes, customize doneness & toppings, and pay via cash, contactless card, or loyalty points.
                </p>

                <div className="flex items-center gap-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
                    <QrCode size={24} className="text-zinc-400" />
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 block">Contactless Ready</span>
                      <span className="text-[11px] text-zinc-500 font-mono">Apple Pay, Google Pay, Cards</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Promo Card Showcase */}
              <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 to-zinc-950 p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Sparkles size={160} />
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-semibold block mb-2">
                  Today's Chef Recommendation
                </span>
                <h3 className="text-2xl font-bold text-zinc-100 mb-2">
                  Smoked Brisket & Smash Platter
                </h3>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Slow-cooked for 14 hours with SJ signature spice rub, house garlic butter and fresh toasted brioche.
                </p>
                <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                  <span className="text-xs font-medium text-zinc-400">Combo Special</span>
                  <span className="font-mono text-xl font-bold text-zinc-100">
                    {cfdData.currency}18.50
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Active Scanning / Cart State ── */
            <motion.div
              key="active-cart"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col lg:flex-row overflow-hidden"
            >
              {/* Left Items Column */}
              <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-e border-zinc-800 overflow-hidden bg-zinc-950/50">
                <div className="px-6 py-3 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-zinc-400 font-semibold flex items-center gap-2">
                    <ShoppingBag size={14} />
                    Current Order ({cfdData.items.reduce((s, i) => s + i.quantity, 0)} items)
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {cfdData.items.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="size-8 rounded-xl bg-zinc-800 border border-zinc-700 font-mono text-xs font-bold text-zinc-100 flex items-center justify-center shrink-0">
                          {item.quantity}x
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm text-zinc-100 leading-snug">
                            {item.name}
                          </h4>
                          {item.variantName && (
                            <span className="text-xs text-zinc-400 block font-medium">
                              {item.variantName}
                            </span>
                          )}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.modifiers.map((m, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                                >
                                  +{m}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-end shrink-0">
                        <span className="font-mono text-base font-bold text-zinc-100 block num">
                          {cfdData.currency}
                          {item.totalPrice.toFixed(2)}
                        </span>
                        {item.quantity > 1 && (
                          <span className="font-mono text-[11px] text-zinc-500">
                            @{cfdData.currency}
                            {item.unitPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right Order Summary & Payment Column */}
              <div className="w-full lg:w-96 flex flex-col justify-between p-6 bg-zinc-900/30">
                <div className="space-y-4">
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-400">
                    Order Summary
                  </h3>

                  <div className="space-y-2.5 font-mono text-sm">
                    <div className="flex justify-between items-center text-zinc-400">
                      <span>Subtotal:</span>
                      <span className="text-zinc-200">
                        {cfdData.currency}
                        {cfdData.subtotal.toFixed(2)}
                      </span>
                    </div>
                    {cfdData.discount > 0 && (
                      <div className="flex justify-between items-center text-emerald-400">
                        <span>Discounts / Promos:</span>
                        <span>
                          -{cfdData.currency}
                          {cfdData.discount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {cfdData.tax > 0 && (
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>Sales Tax:</span>
                        <span className="text-zinc-200">
                          {cfdData.currency}
                          {cfdData.tax.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Big Total Box */}
                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                    <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 block">
                      Total Due
                    </span>
                    <span className="font-mono font-extrabold text-4xl text-zinc-100 tracking-tight block num">
                      {cfdData.currency}
                      {cfdData.total.toFixed(2)}
                    </span>
                  </div>

                  {/* Payment Prompt Pill */}
                  {isPaying && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl border border-primary/40 bg-primary/10 flex items-center gap-3"
                    >
                      <QrCode size={28} className="text-primary animate-pulse shrink-0" />
                      <div>
                        <span className="text-xs font-semibold text-zinc-100 block">
                          Please Tap Card or Scan to Pay
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          Follow cashier terminal instructions
                        </span>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="pt-6 text-center text-xs text-zinc-500 font-mono">
                  Thank you for shopping with us
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

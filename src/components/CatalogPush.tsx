import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { PackageOpen, ArrowRight, Eye, Send, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Store } from '../types';
import {
  listStores,
  fetchStoreProducts,
  fetchStoreCategories,
  pushStoreCatalog,
} from '../lib/fleetClient';
import { planCatalogPush, CatalogPushOptions } from '../lib/catalogPush';

interface CatalogPushProps {
  orgId: string;
}

interface PreviewRow {
  storeId: string;
  storeName: string;
  summary: ReturnType<typeof planCatalogPush>['summary'];
}

interface ResultRow {
  storeId: string;
  storeName: string;
  ok: boolean;
}

const genId = (kind: 'product' | 'category') =>
  `${kind === 'category' ? 'cat' : 'prd'}-${crypto.randomUUID()}`;

// Central catalog push (Phase 4). A super-admin picks a source store's catalog
// and pushes new products / price updates / categories into one or more target
// stores. Additive only — never deletes, and never touches per-store stock.
// Preview-first: nothing is written until the operator reviews the diff.
export default function CatalogPush({ orgId }: CatalogPushProps) {
  const { t } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState('');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [options, setOptions] = useState<CatalogPushOptions>({
    addNewProducts: true,
    updatePrices: true,
    pushCategories: true,
  });
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStores(await listStores(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    listStores(orgId)
      .then((s) => {
        if (!cancelled) setStores(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const targets = useMemo(() => stores.filter((s) => s.id !== sourceId), [stores, sourceId]);

  const toggleTarget = (id: string) =>
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canRun = sourceId && targetIds.length > 0 && !working;

  const runPreview = async () => {
    if (!canRun) return;
    setWorking(true);
    setResults(null);
    try {
      const [srcProducts, srcCategories] = await Promise.all([
        fetchStoreProducts(sourceId),
        fetchStoreCategories(sourceId),
      ]);
      const rows: PreviewRow[] = [];
      for (const tid of targetIds) {
        const [tp, tc] = await Promise.all([fetchStoreProducts(tid), fetchStoreCategories(tid)]);
        const plan = planCatalogPush(
          { products: srcProducts, categories: srcCategories },
          { products: tp, categories: tc },
          options,
          genId,
        );
        rows.push({
          storeId: tid,
          storeName: stores.find((s) => s.id === tid)?.name ?? tid,
          summary: plan.summary,
        });
      }
      setPreview(rows);
    } finally {
      setWorking(false);
    }
  };

  const runPush = async () => {
    if (!canRun) return;
    setWorking(true);
    try {
      const [srcProducts, srcCategories] = await Promise.all([
        fetchStoreProducts(sourceId),
        fetchStoreCategories(sourceId),
      ]);
      const out: ResultRow[] = [];
      for (const tid of targetIds) {
        const [tp, tc] = await Promise.all([fetchStoreProducts(tid), fetchStoreCategories(tid)]);
        const plan = planCatalogPush(
          { products: srcProducts, categories: srcCategories },
          { products: tp, categories: tc },
          options,
          genId,
        );
        const ok = await pushStoreCatalog(tid, plan.categoriesToUpsert, plan.productsToUpsert);
        out.push({ storeId: tid, storeName: stores.find((s) => s.id === tid)?.name ?? tid, ok });
      }
      setResults(out);
      setPreview(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div id="catalog-push-root" className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
      <div className="mb-6 shrink-0 flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-lg sm:text-xl flex items-center gap-2">
            <PackageOpen className="text-emerald-500" size={22} /> {t('catalogPush.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{t('catalogPush.subtitle')}</p>
        </motion.div>
        <button
          onClick={load}
          disabled={loading || working}
          aria-label={t('fleet.refresh')}
          className="flex items-center gap-2 bg-[#0f172a] border border-white/5 hover:border-white/10 disabled:opacity-40 text-slate-300 hover:text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pe-1 pb-6">
        {stores.length < 2 ? (
          <div className="surface rounded-3xl py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <PackageOpen size={40} className="opacity-20" />
            <p className="font-mono text-xs max-w-xs text-center">{t('catalogPush.needTwoStores')}</p>
          </div>
        ) : (
          <>
            {/* Source → targets */}
            <div className="surface rounded-3xl p-6 shadow-xl">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.5fr] gap-6 items-start">
                {/* Source */}
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    {t('catalogPush.source')}
                  </span>
                  <select
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setTargetIds((prev) => prev.filter((x) => x !== e.target.value));
                      setPreview(null);
                      setResults(null);
                    }}
                    className="mt-1 w-full bg-[#0f172a] border border-white/10 focus:border-emerald-500/40 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none"
                  >
                    <option value="">{t('catalogPush.chooseSource')}</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hidden lg:flex items-center justify-center pt-6 text-slate-600">
                  <ArrowRight size={20} />
                </div>

                {/* Targets */}
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    {t('catalogPush.targets')}
                  </span>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targets.length === 0 ? (
                      <p className="text-[11px] font-mono text-slate-500">{t('catalogPush.pickSourceFirst')}</p>
                    ) : (
                      targets.map((s) => {
                        const on = targetIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              toggleTarget(s.id);
                              setPreview(null);
                              setResults(null);
                            }}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                              on
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-white'
                                : 'border-white/8 bg-[#0f172a] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span className="truncate">{s.name}</span>
                            {on && <Check size={13} className="text-emerald-400 shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="mt-6 flex flex-wrap gap-4 border-t border-white/5 pt-4">
                {(
                  [
                    ['addNewProducts', 'optAddProducts'],
                    ['updatePrices', 'optUpdatePrices'],
                    ['pushCategories', 'optPushCategories'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options[k]}
                      onChange={(e) => {
                        setOptions((o) => ({ ...o, [k]: e.target.checked }));
                        setPreview(null);
                      }}
                      className="accent-emerald-500 w-4 h-4"
                    />
                    <span className="text-xs font-semibold text-slate-300">{t(`catalogPush.${label}`)}</span>
                  </label>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center gap-2">
                <button
                  onClick={runPreview}
                  disabled={!canRun}
                  className="flex items-center gap-2 bg-[#0f172a] border border-white/10 hover:border-emerald-500/40 disabled:opacity-40 text-slate-200 text-xs font-bold uppercase px-4 py-2 rounded-xl transition-colors"
                >
                  <Eye size={14} /> {t('catalogPush.preview')}
                </button>
                <button
                  onClick={runPush}
                  disabled={!canRun || !preview}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold uppercase px-4 py-2 rounded-xl transition-colors"
                >
                  <Send size={14} /> {t('catalogPush.push')}
                  {targetIds.length > 0 && ` (${targetIds.length})`}
                </button>
                {working && <RefreshCw size={16} className="animate-spin text-emerald-400" />}
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div className="surface rounded-3xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                  <Eye size={16} className="text-emerald-500" />
                  <h3 className="font-sans font-bold text-white text-sm">{t('catalogPush.previewTitle')}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase text-slate-500 border-b border-white/5">
                        <th className="text-start px-6 py-2 font-semibold">{t('catalogPush.store')}</th>
                        <th className="text-end px-4 py-2 font-semibold">{t('catalogPush.colProducts')}</th>
                        <th className="text-end px-4 py-2 font-semibold">{t('catalogPush.colPrices')}</th>
                        <th className="text-end px-4 py-2 font-semibold">{t('catalogPush.colCategories')}</th>
                        <th className="text-end px-6 py-2 font-semibold">{t('catalogPush.colUnchanged')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r) => (
                        <tr key={r.storeId} className="border-b border-white/5 last:border-0">
                          <td className="px-6 py-3 font-bold text-white">{r.storeName}</td>
                          <td className="px-4 py-3 text-end font-mono text-emerald-400">+{r.summary.productsAdded}</td>
                          <td className="px-4 py-3 text-end font-mono text-blue-400">{r.summary.pricesUpdated}</td>
                          <td className="px-4 py-3 text-end font-mono text-violet-400">+{r.summary.categoriesAdded}</td>
                          <td className="px-6 py-3 text-end font-mono text-slate-500">{r.summary.unchanged}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-6 py-3 text-[10px] font-mono text-slate-500 border-t border-white/5">
                  {t('catalogPush.previewHint')}
                </p>
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="surface rounded-3xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                  <h3 className="font-sans font-bold text-white text-sm">{t('catalogPush.resultsTitle')}</h3>
                </div>
                <ul className="divide-y divide-white/5">
                  {results.map((r) => (
                    <li key={r.storeId} className="px-6 py-3 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{r.storeName}</span>
                      {r.ok ? (
                        <span className="badge badge-emerald flex items-center gap-1">
                          <Check size={11} /> {t('catalogPush.pushed')}
                        </span>
                      ) : (
                        <span className="badge badge-rose flex items-center gap-1">
                          <AlertTriangle size={11} /> {t('catalogPush.failed')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

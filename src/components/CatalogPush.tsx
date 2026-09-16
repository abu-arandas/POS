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
import { mapWithLimit } from '../lib/concurrency';
import { shortId } from '../lib/utils/ids';

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

// shortId(), not crypto.randomUUID(): the latter exists only in secure
// contexts, and a plain-http LAN deploy is a supported deployment (see the
// README). A bare call threw before the first plan was ever computed, taking
// the whole screen down.
const genId = (kind: 'product' | 'category') =>
  `${kind === 'category' ? 'cat' : 'prd'}-${shortId()}`;

// Cap how many target stores are fetched/pushed in parallel. Overlapping the
// requests keeps a multi-store push fast, but an unbounded fan-out across a
// large fleet could swamp the backend or trip rate limits.
const CATALOG_PUSH_CONCURRENCY = 5;

/**
 * Central catalog push (Phase 4). A super-admin picks a source store's catalog
 * and pushes new products / price updates / categories into one or more target
 * stores. Additive only — never deletes, and never touches per-store stock.
 * Preview-first: nothing is written until the operator reviews the diff.
 */
export default function CatalogPush({ orgId }: CatalogPushProps) {
  const { t } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState('');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [options, setOptions] = useState<CatalogPushOptions>({
    addNewProducts: true,
    updatePrices: true,
    updateMetadata: true,
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
    void (async () => {
      try {
        const s = await listStores(orgId);
        if (!cancelled) setStores(s);
      } catch (err) {
        console.error('Failed to load stores:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const targets = useMemo(() => stores.filter((s) => s.id !== sourceId), [stores, sourceId]);

  const toggleTarget = (id: string) =>
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canRun = sourceId && targetIds.length > 0 && !working;

  const storeNameOf = (id: string) => stores.find((s) => s.id === id)?.name ?? id;

  /**
   * Fetches the source catalog once, then builds each target store's push plan
   * with the fan-out capped, and hands every plan to `fromPlan`. Preview and
   * push differ only in what they make of a plan — a summary, or the outcome of
   * writing it — so the fetching and planning live here once.
   */
  const planEachTarget = async <R,>(
    fromPlan: (targetId: string, plan: ReturnType<typeof planCatalogPush>) => R | Promise<R>,
  ): Promise<R[]> => {
    const [srcProducts, srcCategories] = await Promise.all([
      fetchStoreProducts(sourceId),
      fetchStoreCategories(sourceId),
    ]);
    return mapWithLimit(targetIds, CATALOG_PUSH_CONCURRENCY, async (tid) => {
      const [tp, tc] = await Promise.all([fetchStoreProducts(tid), fetchStoreCategories(tid)]);
      const plan = planCatalogPush(
        { products: srcProducts, categories: srcCategories },
        { products: tp, categories: tc },
        options,
        genId,
      );
      return fromPlan(tid, plan);
    });
  };

  /** Builds the diff for every target store without writing anything. */
  const runPreview = async () => {
    if (!canRun) return;
    setWorking(true);
    setResults(null);
    try {
      const rows: PreviewRow[] = await planEachTarget((tid, plan) => ({
        storeId: tid,
        storeName: storeNameOf(tid),
        summary: plan.summary,
      }));
      setPreview(rows);
    } finally {
      setWorking(false);
    }
  };

  /** Writes the planned catalog into every target store. */
  const runPush = async () => {
    if (!canRun) return;
    setWorking(true);
    try {
      const out: ResultRow[] = await planEachTarget(async (tid, plan) => ({
        storeId: tid,
        storeName: storeNameOf(tid),
        ok: await pushStoreCatalog(tid, plan.categoriesToUpsert, plan.productsToUpsert),
      }));
      setResults(out);
      setPreview(null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div id="catalog-push-root" className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
      <div className="mb-5 shrink-0 flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-semibold tracking-tight text-foreground text-lg sm:text-xl flex items-center gap-2">
            <PackageOpen className="text-foreground" size={20} /> {t('catalogPush.title')}
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">{t('catalogPush.subtitle')}</p>
        </motion.div>
        <button
          onClick={load}
          disabled={loading || working}
          aria-label={t('fleet.refresh')}
          className="btn-secondary h-8 px-2.5 rounded-lg"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pe-1 pb-6">
        {stores.length < 2 ? (
          <div className="bg-card border border-border rounded-xl py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <PackageOpen size={36} className="opacity-20" />
            <p className="font-mono text-xs max-w-xs text-center">
              {t('catalogPush.needTwoStores')}
            </p>
          </div>
        ) : (
          <>
            {/* Source → targets */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1.5fr] gap-6 items-start">
                {/* Source */}
                <div>
                  <label
                    htmlFor="catalog-push-source"
                    className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
                  >
                    {t('catalogPush.source')}
                  </label>
                  <select
                    id="catalog-push-source"
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setTargetIds((prev) => prev.filter((x) => x !== e.target.value));
                      setPreview(null);
                      setResults(null);
                    }}
                    className="mt-1 w-full bg-background border border-input focus:ring-1 focus:ring-ring text-foreground text-sm px-3 py-2 rounded-lg focus:outline-none transition-colors"
                  >
                    <option value="">{t('catalogPush.chooseSource')}</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hidden lg:flex items-center justify-center pt-6 text-muted-foreground">
                  <ArrowRight size={18} />
                </div>

                {/* Targets */}
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    {t('catalogPush.targets')}
                  </span>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targets.length === 0 ? (
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {t('catalogPush.pickSourceFirst')}
                      </p>
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
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                              on
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                            }`}
                          >
                            <span className="truncate">{s.name}</span>
                            {on && <Check size={13} className="shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="mt-5 flex flex-wrap gap-4 border-t border-border pt-4">
                {(
                  [
                    ['addNewProducts', 'optAddProducts'],
                    ['updatePrices', 'optUpdatePrices'],
                    ['updateMetadata', 'optUpdateMetadata'],
                    ['pushCategories', 'optPushCategories'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={options[k]}
                      onChange={(e) => {
                        setOptions((o) => ({ ...o, [k]: e.target.checked }));
                        setPreview(null);
                      }}
                      className="accent-foreground size-4 rounded"
                    />
                    <span className="text-xs font-medium text-foreground">
                      {t(`catalogPush.${label}`)}
                    </span>
                  </label>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-5 flex items-center gap-2">
                <button
                  onClick={runPreview}
                  disabled={!canRun}
                  className="btn-secondary h-8 px-3 text-xs flex items-center gap-1.5"
                >
                  <Eye size={13} /> {t('catalogPush.preview')}
                </button>
                <button
                  onClick={runPush}
                  disabled={!canRun || !preview}
                  className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
                >
                  <Send size={13} /> {t('catalogPush.push')}
                  {targetIds.length > 0 && ` (${targetIds.length})`}
                </button>
                {working && <RefreshCw size={14} className="animate-spin text-muted-foreground" />}
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex items-center gap-2">
                  <Eye size={16} className="text-foreground" />
                  <h3 className="font-semibold text-foreground text-sm">
                    {t('catalogPush.previewTitle')}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase text-muted-foreground border-b border-border bg-muted/30">
                        <th className="text-start px-5 py-2 font-medium">
                          {t('catalogPush.store')}
                        </th>
                        <th className="text-end px-4 py-2 font-medium">
                          {t('catalogPush.colProducts')}
                        </th>
                        <th className="text-end px-4 py-2 font-medium">
                          {t('catalogPush.colPrices')}
                        </th>
                        <th className="text-end px-4 py-2 font-medium">
                          {t('catalogPush.colMetadata', 'Details')}
                        </th>
                        <th className="text-end px-4 py-2 font-medium">
                          {t('catalogPush.colCategories')}
                        </th>
                        <th className="text-end px-5 py-2 font-medium">
                          {t('catalogPush.colUnchanged')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {preview.map((r) => (
                        <tr key={r.storeId} className="hover:bg-secondary/40 transition-colors">
                          <td className="px-5 py-3 font-semibold text-foreground">{r.storeName}</td>
                          <td className="px-4 py-3 text-end font-mono num font-semibold text-emerald-600 dark:text-emerald-400">
                            +{r.summary.productsAdded}
                          </td>
                          <td className="px-4 py-3 text-end font-mono num font-semibold text-foreground">
                            {r.summary.pricesUpdated}
                          </td>
                          <td className="px-4 py-3 text-end font-mono num font-semibold text-foreground">
                            {r.summary.metadataUpdated}
                          </td>
                          <td className="px-4 py-3 text-end font-mono num font-semibold text-foreground">
                            +{r.summary.categoriesAdded}
                          </td>
                          <td className="px-5 py-3 text-end font-mono num text-muted-foreground">
                            {r.summary.unchanged}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-5 py-3 text-[11px] font-mono text-muted-foreground border-t border-border bg-muted/10">
                  {t('catalogPush.previewHint')}
                </p>
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border bg-muted/20">
                  <h3 className="font-semibold text-foreground text-sm">
                    {t('catalogPush.resultsTitle')}
                  </h3>
                </div>
                <ul className="divide-y divide-border/60">
                  {results.map((r) => (
                    <li key={r.storeId} className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{r.storeName}</span>
                      {r.ok ? (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 flex items-center gap-1">
                          <Check size={11} /> {t('catalogPush.pushed')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border text-destructive bg-destructive/10 border-destructive/20 flex items-center gap-1">
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

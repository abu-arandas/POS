import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Building2,
  Plus,
  Pencil,
  Power,
  Users,
  Trash2,
  Save,
  X,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Store, Membership, Role } from '../types';
import {
  listStores,
  listMemberships,
  upsertStore,
  setStoreStatus,
  setMembership,
  removeMembership,
} from '../lib/fleetClient';
import {
  StoreFormInput,
  StoreFormErrors,
  validateStoreForm,
  normalizeStoreForm,
  slugifyStoreId,
  ASSIGNABLE_ROLES,
} from '../lib/storeForm';

interface StoreAdminProps {
  orgId: string;
}

type Draft = StoreFormInput & { id?: string };

const EMPTY_DRAFT: Draft = { name: '', address: '', timezone: 'UTC', currency: '$' };

const FLD =
  'w-full bg-[#0f172a] border border-white/10 focus:border-emerald-500/40 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none placeholder:text-slate-600';

// Central store & staff management (Phase 3). A super-admin can create, rename,
// and suspend/activate stores, and manage each store's cloud memberships
// (role per Supabase user). Every write is RLS-gated to a super-admin on the
// backend; this screen is the convenience surface.
export default function StoreAdmin({ orgId }: StoreAdminProps) {
  const { t } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<StoreFormErrors>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<Role>('cashier');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([listStores(orgId), listMemberships(orgId)]);
      setStores(s);
      setMembers(m);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listStores(orgId), listMemberships(orgId)])
      .then(([s, m]) => {
        if (cancelled) return;
        setStores(s);
        setMembers(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const membersByStore = useMemo(() => {
    const map = new Map<string, Membership[]>();
    for (const m of members) {
      if (!m.storeId) continue; // org-wide super-admins aren't shown per store
      const list = map.get(m.storeId) ?? [];
      list.push(m);
      map.set(m.storeId, list);
    }
    return map;
  }, [members]);

  const saveStore = async () => {
    if (!draft) return;
    const errs = validateStoreForm(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const norm = normalizeStoreForm(draft);
    const id = draft.id ?? slugifyStoreId(norm.name, stores.map((s) => s.id));
    const existing = stores.find((s) => s.id === id);
    const record: Store = {
      id,
      orgId,
      name: norm.name,
      address: norm.address,
      timezone: norm.timezone,
      currency: norm.currency,
      status: existing?.status ?? 'active',
      lastSeenAt: existing?.lastSeenAt ?? null,
      createdAt: existing?.createdAt ?? '',
    };
    setBusy(true);
    const ok = await upsertStore(record);
    setBusy(false);
    if (ok) {
      setDraft(null);
      setErrors({});
      await reload();
    }
  };

  const toggleStatus = async (s: Store) => {
    setBusy(true);
    await setStoreStatus(s.id, s.status === 'active' ? 'suspended' : 'active');
    setBusy(false);
    await reload();
  };

  const addMember = async (storeId: string) => {
    const uid = memberUserId.trim();
    if (!uid) return;
    setBusy(true);
    const ok = await setMembership({ userId: uid, orgId, storeId, role: memberRole });
    setBusy(false);
    if (ok) {
      setMemberUserId('');
      setMemberRole('cashier');
      await reload();
    }
  };

  const changeRole = async (m: Membership, role: Role) => {
    if (!m.storeId) return;
    setBusy(true);
    await setMembership({ userId: m.userId, orgId, storeId: m.storeId, role });
    setBusy(false);
    await reload();
  };

  const dropMember = async (m: Membership) => {
    if (!m.storeId) return;
    setBusy(true);
    await removeMembership(m.userId, m.storeId);
    setBusy(false);
    await reload();
  };

  return (
    <div id="store-admin-root" className="flex-1 flex flex-col min-h-0 overflow-hidden p-6">
      <div className="mb-6 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-lg sm:text-xl flex items-center gap-2">
            <Building2 className="text-emerald-500" size={22} /> {t('storeAdmin.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{t('storeAdmin.subtitle')}</p>
        </motion.div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            disabled={loading || busy}
            aria-label={t('fleet.refresh')}
            className="flex items-center gap-2 bg-[#0f172a] border border-white/5 hover:border-white/10 disabled:opacity-40 text-slate-300 hover:text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setErrors({});
            }}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold uppercase px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={14} /> {t('storeAdmin.addStore')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pe-1 pb-6">
        {/* New/edit store form */}
        {draft && (
          <div className="surface rounded-3xl p-6 shadow-xl">
            <h3 className="font-sans font-bold text-white text-sm mb-4">
              {draft.id ? t('storeAdmin.editStore') : t('storeAdmin.newStore')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t('storeAdmin.name')} error={errors.name && t(`storeAdmin.err_${errors.name}`)}>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={FLD}
                  placeholder="Downtown Flagship"
                />
              </Field>
              <Field label={t('storeAdmin.address')}>
                <input
                  value={draft.address ?? ''}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                  className={FLD}
                />
              </Field>
              <Field label={t('storeAdmin.timezone')} error={errors.timezone && t(`storeAdmin.err_${errors.timezone}`)}>
                <input
                  value={draft.timezone}
                  onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  className={FLD}
                  placeholder="America/Los_Angeles"
                />
              </Field>
              <Field label={t('storeAdmin.currency')} error={errors.currency && t(`storeAdmin.err_${errors.currency}`)}>
                <input
                  value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                  className={FLD}
                  placeholder="$"
                />
              </Field>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={saveStore}
                disabled={busy}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold uppercase px-4 py-2 rounded-xl transition-colors"
              >
                <Save size={14} /> {t('storeAdmin.save')}
              </button>
              <button
                onClick={() => {
                  setDraft(null);
                  setErrors({});
                }}
                className="flex items-center gap-2 bg-[#0f172a] border border-white/5 text-slate-300 hover:text-white text-xs font-bold uppercase px-4 py-2 rounded-xl transition-colors"
              >
                <X size={14} /> {t('storeAdmin.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Store list */}
        {stores.length === 0 && !loading ? (
          <div className="surface rounded-3xl py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Building2 size={40} className="opacity-20" />
            <p className="font-mono text-xs">{t('storeAdmin.noStores')}</p>
          </div>
        ) : (
          stores.map((s) => {
            const roster = membersByStore.get(s.id) ?? [];
            const expanded = expandedId === s.id;
            return (
              <div key={s.id} className="surface rounded-3xl shadow-xl overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">{s.name}</span>
                      <span className={s.status === 'active' ? 'badge badge-emerald' : 'badge badge-slate'}>
                        {t(`storeAdmin.status_${s.status}`)}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {s.currency} · {s.timezone} · {roster.length} {t('storeAdmin.membersLabel')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconBtn
                      title={t('storeAdmin.manageStaff')}
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      active={expanded}
                    >
                      <Users size={15} />
                    </IconBtn>
                    <IconBtn
                      title={t('storeAdmin.editStore')}
                      onClick={() =>
                        setDraft({
                          id: s.id,
                          name: s.name,
                          address: s.address ?? '',
                          timezone: s.timezone,
                          currency: s.currency,
                        })
                      }
                    >
                      <Pencil size={15} />
                    </IconBtn>
                    <IconBtn
                      title={s.status === 'active' ? t('storeAdmin.suspend') : t('storeAdmin.activate')}
                      onClick={() => toggleStatus(s)}
                      danger={s.status === 'active'}
                    >
                      <Power size={15} />
                    </IconBtn>
                  </div>
                </div>

                {/* Staff roster */}
                {expanded && (
                  <div className="border-t border-white/5 px-6 py-4 bg-slate-900/30">
                    {roster.length === 0 ? (
                      <p className="text-[11px] font-mono text-slate-500 mb-3">{t('storeAdmin.noMembers')}</p>
                    ) : (
                      <ul className="space-y-2 mb-4">
                        {roster.map((m) => (
                          <li key={m.userId} className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-mono text-slate-300 truncate" title={m.userId}>
                              {m.userId.slice(0, 12)}…
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={m.role}
                                onChange={(e) => changeRole(m, e.target.value as Role)}
                                disabled={busy}
                                className="bg-[#0f172a] border border-white/5 text-slate-200 text-[11px] font-semibold px-2 py-1 rounded-lg focus:outline-none focus:border-emerald-500/40"
                              >
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {t(`storeAdmin.role_${r}`)}
                                  </option>
                                ))}
                              </select>
                              <IconBtn title={t('storeAdmin.removeMember')} onClick={() => dropMember(m)} danger>
                                <Trash2 size={14} />
                              </IconBtn>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Add member */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={memberUserId}
                        onChange={(e) => setMemberUserId(e.target.value)}
                        placeholder={t('storeAdmin.userIdPlaceholder')}
                        className={`${FLD} flex-1 min-w-[180px] font-mono text-[11px]`}
                      />
                      <select
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value as Role)}
                        className="bg-[#0f172a] border border-white/5 text-slate-200 text-[11px] font-semibold px-2 py-2 rounded-lg focus:outline-none focus:border-emerald-500/40"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`storeAdmin.role_${r}`)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => addMember(s.id)}
                        disabled={busy || !memberUserId.trim()}
                        className="flex items-center gap-1.5 bg-emerald-500/90 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-[11px] font-bold uppercase px-3 py-2 rounded-lg transition-colors"
                      >
                        <Plus size={13} /> {t('storeAdmin.addMember')}
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 mt-2 flex items-center gap-1.5">
                      <ShieldCheck size={12} className="text-emerald-500/70" />
                      {t('storeAdmin.memberHint')}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* RLS enforcement callout */}
        <div className="surface rounded-3xl p-5 shadow-xl border border-amber-500/15">
          <h3 className="font-sans font-bold text-amber-300/90 text-xs uppercase tracking-wider flex items-center gap-2 mb-1.5">
            <ShieldCheck size={14} /> {t('storeAdmin.rlsTitle')}
          </h3>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t('storeAdmin.rlsBody')} <code className="font-mono text-slate-300">scripts/multi-store-rls-enforce.sql</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      <div className="mt-1">{children}</div>
      {error && <span className="text-[10px] font-mono text-rose-400 mt-1 block">{error}</span>}
    </label>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? 'bg-emerald-500/15 text-emerald-300'
          : danger
            ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

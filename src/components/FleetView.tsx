import { lazy, Suspense, useState } from 'react';
import { Radio, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FleetBoard from './FleetBoard';

const FleetDashboard = lazy(() => import('./FleetDashboard'));

interface FleetViewProps {
  orgId: string;
}

type Tab = 'live' | 'reports';

// Super-admin surface container: a tab switch between the live "connected
// stores" board (Phase 1) and the consolidated cross-store reporting dashboard
// (Phase 2). Keeps the sidebar to a single Fleet entry.
export default function FleetView({ orgId }: FleetViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('live');

  const tabs: Array<{ id: Tab; labelKey: string; icon: typeof Radio }> = [
    { id: 'live', labelKey: 'fleet.tab_live', icon: Radio },
    { id: 'reports', labelKey: 'fleet.tab_reports', icon: BarChart3 },
  ];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#020617]">
      <div className="shrink-0 flex items-center gap-1 px-6 pt-4 border-b border-white/5">
        {tabs.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-emerald-500 text-white'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === 'live' ? (
          <FleetBoard orgId={orgId} />
        ) : (
          <Suspense fallback={<div className="flex-1" />}>
            <FleetDashboard orgId={orgId} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

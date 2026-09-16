import {
  ShoppingBag,
  Package,
  History,
  Users,
  BarChart3,
  Settings,
  AlertTriangle,
  LogOut,
  Sun,
  Moon,
  QrCode,
  Clock,
  Building2,
  ChefHat,
  Grid3X3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { ScreenId, isScreenAllowed } from '../lib/access';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSyncStatus } from '../lib/useSyncStatus';
import { useProductStore } from '../stores/productStore';
import { useKdsStore } from '../stores/kdsStore';
import { safeImageUrl } from '../lib/imageUrl';

interface SidebarProps {
  currentScreen: ScreenId;
  setScreen: (screen: ScreenId) => void;
  isSuperadmin?: boolean;
}

const NAV_ITEMS: Array<{ id: ScreenId; labelKey: string; icon: typeof ShoppingBag }> = [
  { id: 'register', labelKey: 'sidebar.register', icon: ShoppingBag },
  { id: 'tables', labelKey: 'sidebar.tables', icon: Grid3X3 },
  { id: 'kitchen', labelKey: 'sidebar.kitchen', icon: ChefHat },
  { id: 'dashboard', labelKey: 'sidebar.dashboard', icon: BarChart3 },
  { id: 'inventory', labelKey: 'sidebar.inventory', icon: Package },
  { id: 'history', labelKey: 'sidebar.transactions', icon: History },
  { id: 'customers', labelKey: 'sidebar.customers', icon: Users },
  { id: 'shift', labelKey: 'sidebar.shift', icon: Clock },
  { id: 'qrmenu', labelKey: 'sidebar.qrmenu', icon: QrCode },
  { id: 'fleet', labelKey: 'sidebar.fleet', icon: Building2 },
  { id: 'settings', labelKey: 'sidebar.settings', icon: Settings },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Visual sync-status pill shown in the sidebar bottom controls area. */
function SyncBadge() {
  const { t } = useTranslation();
  const { state, pending } = useSyncStatus();
  if (state === 'off') return null;

  const cls = {
    synced: 'sync-badge sync-online',
    syncing: 'sync-badge sync-syncing',
    error: 'sync-badge sync-error',
    offline: 'sync-badge sync-offline',
  }[state];

  // The count is the message. "Offline" tells an operator the link is down;
  // "Offline · 12" tells them twelve sales are sitting on this machine and
  // nowhere else, which is the fact that decides whether they keep trading,
  // call someone, or think twice before closing the drawer.
  const label =
    pending > 0 ? `${t(`sidebar.sync_${state}`)} · ${pending}` : t(`sidebar.sync_${state}`);

  return (
    <span
      className={cls}
      // The badge is a glyph and a word; the tooltip is where the operator
      // finds out what it actually means for them.
      title={pending > 0 ? t('sidebar.syncPendingHint', { count: pending }) : undefined}
      aria-live="polite"
    >
      <span className="sync-dot" />
      {label}
    </span>
  );
}

/**
 * Primary navigation. Shows only the screens the signed-in role may open, and
 * reveals the fleet board only to a resolved super-admin.
 */
export default function Sidebar({ currentScreen, setScreen, isSuperadmin }: SidebarProps) {
  const { currentUser, setCurrentUser } = useAuthStore();
  const { settings, darkMode, setDarkMode } = useSettingsStore();
  const { products } = useProductStore();
  const { t } = useTranslation();

  const lowStockCount = products.filter((p) => p.stock <= p.minStock && p.stock > 0).length;
  const kdsActiveCount = useKdsStore(
    (s) => s.tickets.filter((t) => t.status !== 'completed').length,
  );

  // The Fleet board is additionally gated on a resolved super-admin membership,
  // so it's hidden unless the cloud account is actually a super-admin.
  const allowedItems = NAV_ITEMS.filter(
    (item) =>
      (!currentUser || isScreenAllowed(item.id, currentUser.role)) &&
      (item.id !== 'fleet' || isSuperadmin),
  );

  return (
    <aside
      id="sidebar-container"
      className="app-panel flex flex-col w-60 min-h-screen transition-colors duration-200 relative shrink-0 border-e border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950"
    >
      {/* ── Brand ── */}
      <div id="brand-header" className="p-4 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800">
            {safeImageUrl(settings.storeLogo) ? (
              <img
                src={safeImageUrl(settings.storeLogo)}
                alt={t('receiptCfg.tg_logo')}
                className="size-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Logo size={28} />
            )}
          </div>
          <div className="min-w-0">
            <h1
              className="font-sans font-bold text-zinc-950 dark:text-zinc-100 text-[13px] truncate tracking-tight leading-tight"
              title={settings.storeName}
            >
              {settings.storeName || 'SJ Grill'}
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="size-1.5 bg-emerald-500 rounded-full" />
              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                POS Terminal
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav
        id="sidebar-navigation"
        aria-label={t('sidebar.mainNavigation')}
        className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-none"
      >
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          const badge =
            item.id === 'inventory' && lowStockCount > 0
              ? lowStockCount
              : item.id === 'kitchen' && kdsActiveCount > 0
                ? kdsActiveCount
                : undefined;

          return (
            <button
              key={item.id}
              id={`nav-btn-${item.id}`}
              onClick={() => setScreen(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 group ${
                isActive
                  ? 'text-white bg-zinc-900 dark:text-zinc-950 dark:bg-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80'
              }`}
            >
              <div className="flex items-center gap-2.5 z-10">
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={`transition-colors duration-150 ${
                    isActive
                      ? 'text-white dark:text-zinc-950'
                      : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
                  }`}
                />
                <span className="tracking-normal">{t(item.labelKey)}</span>
              </div>

              {badge !== undefined && (
                <span
                  id={`nav-badge-${item.id}`}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[9px] font-semibold border ${
                    isActive
                      ? 'bg-amber-400/20 text-amber-200 border-amber-300/40 dark:bg-amber-500/20 dark:text-amber-700 dark:border-amber-500/40'
                      : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  <AlertTriangle size={8} />
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Bottom Controls ── */}
      <div className="px-3 pb-3 pt-2 space-y-2 border-t border-zinc-200/80 dark:border-zinc-800/80">
        <div className="px-1 flex items-center justify-between">
          <SyncBadge />
          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            aria-label={darkMode ? t('sidebar.lightMode') : t('sidebar.darkMode')}
          >
            {darkMode ? (
              <Sun size={14} className="text-zinc-300" />
            ) : (
              <Moon size={14} className="text-zinc-600" />
            )}
          </button>
        </div>

        {/* User card */}
        {currentUser && (
          <div
            id="sidebar-user-card"
            className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-bold text-[10px] shrink-0">
                {getInitials(currentUser.name)}
              </div>
              <div className="min-w-0">
                <p className="text-zinc-900 dark:text-zinc-100 text-xs font-semibold truncate leading-tight">
                  {currentUser.name.split(' ')[0]}
                </p>
                <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wide inline-block">
                  {currentUser.role}
                </span>
              </div>
            </div>

            <button
              onClick={() => setCurrentUser(null)}
              title={t('sidebar.lockTerminal')}
              aria-label={t('sidebar.lockTerminal')}
              className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors shrink-0"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

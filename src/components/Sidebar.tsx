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
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ScreenId, isScreenAllowed } from '../lib/access';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';

interface SidebarProps {
  currentScreen: ScreenId;
  setScreen: (screen: ScreenId) => void;
}

const NAV_ITEMS: Array<{ id: ScreenId; labelKey: string; icon: typeof ShoppingBag }> = [
  { id: 'register', labelKey: 'sidebar.register', icon: ShoppingBag },
  { id: 'dashboard', labelKey: 'sidebar.dashboard', icon: BarChart3 },
  { id: 'inventory', labelKey: 'sidebar.inventory', icon: Package },
  { id: 'history', labelKey: 'sidebar.transactions', icon: History },
  { id: 'customers', labelKey: 'sidebar.customers', icon: Users },
  { id: 'shift', labelKey: 'sidebar.shift', icon: Clock },
  { id: 'qrmenu', labelKey: 'sidebar.qrmenu', icon: QrCode },
  { id: 'settings', labelKey: 'sidebar.settings', icon: Settings },
];

const ROLE_COLOR: Record<string, string> = {
  admin: 'from-indigo-500 to-violet-600',
  manager: 'from-amber-500 to-orange-500',
  cashier: 'from-emerald-500 to-teal-500',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'text-indigo-300 bg-indigo-500/12 border-indigo-500/25',
  manager: 'text-amber-300 bg-amber-500/12 border-amber-500/25',
  cashier: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25',
};

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function Sidebar({ currentScreen, setScreen }: SidebarProps) {
  const { currentUser, setCurrentUser } = useAuthStore();
  const { settings, darkMode, setDarkMode } = useSettingsStore();
  const { products } = useProductStore();
  const { t } = useTranslation();

  const lowStockCount = products.filter((p) => p.stock <= p.minStock && p.stock > 0).length;

  const allowedItems = NAV_ITEMS.filter(
    (item) => !currentUser || isScreenAllowed(item.id, currentUser.role),
  );

  return (
    <aside
      id="sidebar-container"
      className="flex flex-col w-60 min-h-screen transition-colors duration-300 relative overflow-hidden shrink-0"
      style={{
        background: 'rgba(9, 14, 28, 0.97)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }} />
      </div>

      {/* ── Brand ── */}
      <div id="brand-header" className="relative z-10 px-5 py-5 border-b border-white/[0.06]">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
            {settings.storeLogo ? (
              <img src={settings.storeLogo} alt="Logo" className="w-6 h-6 object-contain rounded-sm" />
            ) : (
              <ShoppingBag size={18} className="text-slate-950 stroke-[2.5]" />
            )}
          </div>
          <div className="min-w-0">
            <h1
              className="font-sans font-bold text-white text-sm truncate tracking-tight"
              title={settings.storeName}
            >
              {settings.storeName}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[9px] font-mono text-emerald-400 tracking-[0.18em] uppercase">EA POS</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Navigation ── */}
      <nav id="sidebar-navigation" aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-1 relative z-10 overflow-y-auto scrollbar-none">
        {allowedItems.map((item, i) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          const badge = item.id === 'inventory' && lowStockCount > 0 ? lowStockCount : undefined;

          return (
            <motion.button
              key={item.id}
              id={`nav-btn-${item.id}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              onClick={() => setScreen(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                isActive
                  ? 'text-white bg-white/8'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {/* Active left indicator */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-bar"
                  className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-emerald-400"
                  style={{ boxShadow: '0 0 8px rgba(16,185,129,0.7)' }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}

              <div className="flex items-center gap-3 z-10">
                <Icon
                  size={16}
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-emerald-400' : 'text-slate-600 group-hover:text-slate-400'
                  }`}
                />
                <span className="tracking-wide">{t(item.labelKey)}</span>
              </div>

              {badge !== undefined && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  id={`nav-badge-${item.id}`}
                  className="relative z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[9px] font-bold"
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#fbbf24',
                  }}
                >
                  <AlertTriangle size={9} />
                  {badge}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* ── Bottom Controls ── */}
      <div className="relative z-10 px-3 pb-3 space-y-2">
        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#64748b',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
            (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
          }}
          aria-label={darkMode ? t('sidebar.lightMode') : t('sidebar.darkMode')}
        >
          {darkMode ? (
            <><Sun size={13} className="text-amber-400" /><span className="text-slate-400">{t('sidebar.lightMode')}</span></>
          ) : (
            <><Moon size={13} className="text-indigo-400" /><span className="text-slate-400">{t('sidebar.darkMode')}</span></>
          )}
        </button>

        {/* User card */}
        {currentUser && (
          <div
            id="sidebar-user-card"
            className="flex items-center justify-between p-3 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${ROLE_COLOR[currentUser.role] || ROLE_COLOR.cashier} flex items-center justify-center text-white font-bold text-[11px] shrink-0`}
              >
                {getInitials(currentUser.name)}
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate leading-tight">
                  {currentUser.name.split(' ')[0]}
                </p>
                <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border inline-block mt-0.5 ${ROLE_BADGE[currentUser.role] || ROLE_BADGE.cashier}`}>
                  {currentUser.role}
                </span>
              </div>
            </div>

            <button
              onClick={() => setCurrentUser(null)}
              title={t('sidebar.lockTerminal')}
              aria-label={t('sidebar.lockTerminal')}
              className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

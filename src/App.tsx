import { useState, useEffect, lazy, Suspense } from 'react';
import {
  ShoppingBag,
  Package,
  History as HistoryIcon,
  Users,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
  X as XIcon,
  QrCode,
  Clock,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Sidebar from './components/Sidebar';
import Register from './components/Register';
import Lockscreen from './components/Lockscreen';
// Non-default screens are code-split so heavy deps (recharts, qrcode.react, …)
// stay out of the initial bundle and load only when their screen is opened.
const Inventory = lazy(() => import('./components/Inventory'));
const History = lazy(() => import('./components/History'));
const Customers = lazy(() => import('./components/Customers'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const Settings = lazy(() => import('./components/Settings'));
const QRMenu = lazy(() => import('./components/QRMenu'));
const ShiftScreen = lazy(() => import('./components/ShiftScreen'));
import { useAuthStore } from './stores/authStore';
import { useSettingsStore } from './stores/settingsStore';
import { useProductStore } from './stores/productStore';
import { ScreenId, isScreenAllowed } from './lib/access';
import { startRealtimeSync, stopRealtimeSync } from './lib/realtimeSync';

function ScreenLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="animate-spin text-emerald-500" size={28} />
    </div>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentScreen, setScreen] = useState<ScreenId>('register');

  const { currentUser, setCurrentUser } = useAuthStore();
  const { settings, darkMode, setDarkMode, language, supabaseConfig } = useSettingsStore();
  const { t, i18n } = useTranslation();

  // Live multi-terminal sync: subscribe to cloud changes while sync is
  // connected, so another register's writes appear here automatically.
  const syncEnabled = supabaseConfig.enabled;
  const syncConnected = supabaseConfig.status === 'connected';
  useEffect(() => {
    if (syncEnabled && syncConnected) {
      startRealtimeSync();
      return () => stopRealtimeSync();
    }
  }, [syncEnabled, syncConnected]);

  useEffect(() => {
    i18n.changeLanguage(language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    if (language === 'ar') {
      document.documentElement.classList.add('font-arabic');
    } else {
      document.documentElement.classList.remove('font-arabic');
    }
  }, [language, i18n]);

  // We only pull what we absolutely need in App to minimize re-renders.
  // lowStockCount can be derived here, or passed.
  const products = useProductStore((state) => state.products);
  const categories = useProductStore((state) => state.categories);
  // Match the Sidebar's definition so the mobile and desktop badges agree
  // (low = at/below threshold but still in stock; out-of-stock is shown separately).
  const lowStockCount = products.filter((p) => p.stock <= p.minStock && p.stock > 0).length;

  useEffect(() => {
    // Keep the embedded QR-menu server in sync. No-op outside Electron.
    // Only public menu fields cross into the LAN-exposed server — never
    // cost, stock counts, or the rest of the store settings (see /api/menu).
    window.electronAPI?.updateMenuData({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        image: p.image,
        inStock: p.stock > 0,
      })),
      categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      settings: {
        storeName: settings.storeName,
        storeLogo: settings.storeLogo,
        currency: settings.currency,
      },
    });
  }, [products, categories, settings]);

  // Reset navigation state when the signed-in role cannot view the current
  // screen (e.g. an admin locked the terminal on Settings and a cashier logs in).
  useEffect(() => {
    if (currentUser && !isScreenAllowed(currentScreen, currentUser.role)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScreen('register');
    }
  }, [currentUser, currentScreen]);

  if (!currentUser) {
    return <Lockscreen />;
  }

  // Guard at render time too: effects run after paint, so relying on the
  // effect alone would flash one frame of a prohibited screen.
  const activeScreen: ScreenId = isScreenAllowed(currentScreen, currentUser.role)
    ? currentScreen
    : 'register';

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'register':
        return <Register />;
      case 'inventory':
        return <Inventory />;
      case 'history':
        return <History />;
      case 'customers':
        return <Customers />;
      case 'dashboard':
        return <Dashboard />;
      case 'shift':
        return <ShiftScreen />;
      case 'qrmenu':
        return <QRMenu />;
      case 'settings':
        return <Settings />;
      default:
        return <div className="p-8 font-mono text-xs">VIEW ROUTING ERROR</div>;
    }
  };

  const mobileMenuItems: Array<{
    id: ScreenId;
    label: string;
    icon: typeof ShoppingBag;
    badge?: number;
  }> = [
    { id: 'register', label: t('sidebar.register'), icon: ShoppingBag },
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: BarChart3 },
    {
      id: 'inventory',
      label: t('sidebar.inventory'),
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    { id: 'history', label: t('sidebar.transactions'), icon: HistoryIcon },
    { id: 'customers', label: t('sidebar.customers'), icon: Users },
    { id: 'shift', label: t('sidebar.shift'), icon: Clock },
    { id: 'qrmenu', label: t('sidebar.qrmenu'), icon: QrCode },
    { id: 'settings', label: t('sidebar.settings'), icon: SettingsIcon },
  ];

  const allowedMobileItems = mobileMenuItems.filter((item) =>
    isScreenAllowed(item.id, currentUser.role),
  );

  return (
    <div
      id="application-container"
      className={`flex min-h-screen overflow-hidden text-slate-800 dark:text-slate-100 transition-colors duration-300 ${darkMode ? 'mesh-bg-dark' : 'mesh-bg'}`}
    >
      <div id="desktop-sidebar-rail" className="hidden lg:block shrink-0">
        <Sidebar currentScreen={activeScreen} setScreen={setScreen} />
      </div>

      {/* Main column: mobile top bar (small screens only) plus the active screen.
          The screen is mounted exactly once here so there is a single cart and no
          duplicate element IDs across the mobile/desktop layouts. */}
      <div
        id="app-shell"
        className="relative flex flex-col flex-1 min-w-0 h-screen overflow-hidden"
      >
        <header className="lg:hidden bg-slate-900 text-slate-100 px-4 py-3 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center space-x-2">
            <div className="bg-emerald-500 text-slate-950 p-1.5 rounded-lg">
              <ShoppingBag size={16} className="stroke-[2.5]" />
            </div>
            <h1
              className="font-sans font-bold tracking-tight text-white text-sm truncate max-w-[120px]"
              title={settings.storeName}
            >
              {settings.storeName}
            </h1>
            <span className="text-[9px] uppercase font-mono font-bold bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
              {currentUser.role}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg focus:outline-none"
            >
              {darkMode ? (
                <div className="text-amber-400">☀️</div>
              ) : (
                <div className="text-indigo-400">🌙</div>
              )}
            </button>
            <button
              onClick={() => setCurrentUser(null)}
              title={t('sidebar.lockTerminal')}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg focus:outline-none"
            >
              <XIcon size={16} />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg focus:outline-none"
            >
              <Menu size={20} />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="lg:hidden absolute top-[48px] inset-x-0 bg-slate-900 border-b border-slate-800 shadow-2xl z-40 p-4 space-y-2 flex flex-col"
            >
              {allowedMobileItems.map((item) => {
                const Icon = item.icon;
                const isSel = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setScreen(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-3 rounded-xl text-xs font-semibold ${
                      isSel
                        ? 'bg-slate-800 text-white border-s-4 border-emerald-500 ps-2'
                        : 'text-slate-400 bg-slate-950/20'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon size={16} className={isSel ? 'text-emerald-400' : 'text-slate-500'} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="bg-amber-500 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <main
          id="desktop-view-container"
          className="flex flex-1 min-w-0 min-h-0 bg-transparent relative overflow-hidden"
        >
          <Suspense fallback={<ScreenLoader />}>{renderActiveScreen()}</Suspense>
        </main>
      </div>
    </div>
  );
}

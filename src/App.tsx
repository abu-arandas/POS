import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Sidebar from './components/Sidebar';
import Register from './components/Register';
import Inventory from './components/Inventory';
import History from './components/History';
import Customers from './components/Customers';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Lockscreen from './components/Lockscreen';
import QRMenu from './components/QRMenu';
import { useAuthStore } from './stores/authStore';
import { useSettingsStore } from './stores/settingsStore';
import { useProductStore } from './stores/productStore';

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentScreen, setScreen] = useState<
    'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings' | 'qrmenu'
  >('register');

  const { currentUser, setCurrentUser } = useAuthStore();
  const { settings, darkMode, setDarkMode, language } = useSettingsStore();
  const { t, i18n } = useTranslation();

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
  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipcRenderer = (window as any).require('electron').ipcRenderer;
      ipcRenderer.send('update-menu-data', {
        products,
        categories,
        settings,
      });
    } catch (_e) {
      // Not running in Electron
    }
  }, [products, categories, settings]);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'cashier') {
        const prohibitedScreens = ['inventory', 'customers', 'dashboard', 'settings', 'qrmenu'];
        if (prohibitedScreens.includes(currentScreen)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setScreen('register');
        }
      } else if (currentUser.role === 'manager') {
        if (currentScreen === 'settings') {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setScreen('register');
        }
      }
    }
  }, [currentUser, currentScreen]);

  if (!currentUser) {
    return <Lockscreen />;
  }

  const renderActiveScreen = () => {
    switch (currentScreen) {
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
      case 'qrmenu':
        return <QRMenu />;
      case 'settings':
        return <Settings />;
      default:
        return <div className="p-8 font-mono text-xs">VIEW ROUTING ERROR</div>;
    }
  };

  const mobileMenuItems = [
    {
      id: 'register',
      label: t('sidebar.register'),
      icon: ShoppingBag,
      allowedRoles: ['admin', 'manager', 'cashier'],
    },
    {
      id: 'dashboard',
      label: t('sidebar.dashboard'),
      icon: BarChart3,
      allowedRoles: ['admin', 'manager'],
    },
    {
      id: 'inventory',
      label: t('sidebar.inventory'),
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      allowedRoles: ['admin', 'manager'],
    },
    {
      id: 'history',
      label: t('sidebar.transactions'),
      icon: HistoryIcon,
      allowedRoles: ['admin', 'manager', 'cashier'],
    },
    {
      id: 'customers',
      label: t('sidebar.customers'),
      icon: Users,
      allowedRoles: ['admin', 'manager'],
    },
    { id: 'qrmenu', label: t('sidebar.qrmenu'), icon: QrCode, allowedRoles: ['admin', 'manager'] },
    { id: 'settings', label: t('sidebar.settings'), icon: SettingsIcon, allowedRoles: ['admin'] },
  ].filter(
    (item) =>
      !currentUser ||
      item.allowedRoles.includes(
        item.allowedRoles.includes(currentUser.role) ? currentUser.role : 'admin',
      ),
  );

  const allowedMobileItems = mobileMenuItems.filter((item) =>
    item.allowedRoles.includes(currentUser.role),
  );

  return (
    <div
      id="application-container"
      className={`flex min-h-screen overflow-hidden text-slate-800 dark:text-slate-100 transition-colors duration-300 ${darkMode ? 'mesh-bg-dark' : 'mesh-bg'}`}
    >
      <div id="desktop-sidebar-rail" className="hidden lg:block shrink-0">
        <Sidebar currentScreen={currentScreen} setScreen={setScreen} />
      </div>

      <div
        id="mobile-navigation-shell"
        className="lg:hidden flex flex-col w-full h-screen overflow-hidden"
      >
        <header className="bg-slate-900 text-slate-100 px-4 py-3 flex items-center justify-between shadow-md shrink-0">
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
              title="Lock Terminal"
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
              className="absolute top-[48px] inset-x-0 bg-slate-900 border-b border-slate-800 shadow-2xl z-40 p-4 space-y-2 flex flex-col"
            >
              {allowedMobileItems.map((item) => {
                const Icon = item.icon;
                const isSel = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setScreen(item.id as any);
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

        <main className="flex-1 min-h-0 bg-transparent relative overflow-hidden">
          {renderActiveScreen()}
        </main>
      </div>

      <main
        id="desktop-view-container"
        className="hidden lg:flex flex-1 min-w-0 bg-transparent relative overflow-hidden h-screen"
      >
        {renderActiveScreen()}
      </main>
    </div>
  );
}

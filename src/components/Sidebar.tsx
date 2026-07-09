import { ShoppingBag, Package, History, Users, BarChart3, Settings, AlertCircle, LogOut, Shield, Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';
import { UserAccount } from '../types';

interface SidebarProps {
  currentScreen: 'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings';
  setScreen: (screen: 'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings') => void;
  lowStockCount: number;
  storeName: string;
  currentUser: UserAccount | null;
  onLogout: () => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export default function Sidebar({ currentScreen, setScreen, lowStockCount, storeName, currentUser, onLogout, darkMode, setDarkMode }: SidebarProps) {
  // Define full list of all available menu items
  const allMenuItems: Array<{
    id: 'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings';
    label: string;
    icon: typeof ShoppingBag;
    badge?: number;
    allowedRoles: Array<UserAccount['role']>;
  }> = [
    { id: 'register', label: 'Register', icon: ShoppingBag, allowedRoles: ['admin', 'manager', 'cashier'] },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, allowedRoles: ['admin', 'manager'] },
    { id: 'inventory', label: 'Inventory', icon: Package, badge: lowStockCount > 0 ? lowStockCount : undefined, allowedRoles: ['admin', 'manager'] },
    { id: 'history', label: 'Transactions', icon: History, allowedRoles: ['admin', 'manager', 'cashier'] },
    { id: 'customers', label: 'Customers', icon: Users, allowedRoles: ['admin', 'manager'] },
    { id: 'settings', label: 'Settings', icon: Settings, allowedRoles: ['admin'] },
  ];

  // Filter based on the logged-in staff member's role
  const allowedItems = allMenuItems.filter(item => 
    !currentUser || item.allowedRoles.includes(currentUser.role)
  );

  return (
    <aside id="sidebar-container" className="flex flex-col w-64 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl text-slate-100 border-r border-slate-800/50 min-h-screen transition-colors duration-300 relative overflow-hidden">
      
      {/* Background Gradient Mesh */}
      <div className="absolute top-0 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Brand Header */}
      <div id="brand-header" className="p-6 border-b border-slate-800/50 flex items-center space-x-3 relative z-10">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="bg-linear-to-br from-emerald-400 to-emerald-600 text-slate-950 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20"
        >
          <ShoppingBag size={22} className="stroke-[2.5]" />
        </motion.div>
        <div className="min-w-0">
          <h1 className="font-sans font-bold tracking-tight text-white text-base truncate" title={storeName}>
            {storeName}
          </h1>
          <span className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            EA POS
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav id="sidebar-navigation" className="flex-1 px-4 py-6 space-y-2 relative z-10">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              id={`nav-btn-${item.id}`}
              onClick={() => setScreen(item.id)}
              className={`relative flex items-center justify-between w-full px-4 py-3.5 rounded-2xl text-sm font-medium transition-all group duration-300 ${
                isActive
                  ? 'text-white bg-slate-800/80 shadow-inner'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3.5 z-10">
                <Icon
                  size={18}
                  className={`transition-colors duration-300 ${
                    isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                <span className="tracking-wide">{item.label}</span>
              </div>

              {/* Active Indicator Slide Effect */}
              {isActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute inset-0 bg-linear-to-r from-emerald-500/10 to-transparent border-l-4 border-emerald-500 rounded-2xl"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}

              {/* Badges (e.g. low stock alert) */}
              {item.badge !== undefined && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  id={`nav-badge-${item.id}`}
                  className="relative z-10 flex items-center space-x-1.5 bg-amber-500/20 text-amber-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                >
                  <AlertCircle size={10} />
                  <span>{item.badge}</span>
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 pb-2 relative z-10">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-full flex items-center justify-center gap-2 p-3 bg-slate-800/40 hover:bg-slate-700/50 text-slate-300 rounded-xl transition-colors mb-2 text-xs font-semibold"
        >
          {darkMode ? (
            <><Sun size={14} className="text-amber-400" /> Light Mode</>
          ) : (
            <><Moon size={14} className="text-indigo-400" /> Dark Mode</>
          )}
        </button>
      </div>

      {/* Logged in employee info container */}
      {currentUser && (
        <div id="sidebar-user-card" className="p-4 mx-4 mb-4 glass-dark border border-slate-700/50 rounded-2xl flex items-center justify-between relative z-10 shadow-lg">
          <div className="flex items-center space-x-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
              currentUser.role === 'admin' ? 'bg-indigo-500/20 text-indigo-400' : 
              currentUser.role === 'manager' ? 'bg-amber-500/20 text-amber-400' : 
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              <Shield size={16} />
            </div>
            <div className="min-w-0">
              <h5 className="text-xs font-bold text-white truncate leading-tight">{currentUser.name.split(' ')[0]}</h5>
              <span className="text-[9px] uppercase font-mono font-bold text-slate-400 tracking-wider">{currentUser.role}</span>
            </div>
          </div>
          
          <button
            onClick={onLogout}
            title="Lock POS Screen"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0 focus:outline-none"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}

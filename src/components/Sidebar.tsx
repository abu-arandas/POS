import { ShoppingBag, Package, History, Users, BarChart3, Settings, AlertCircle, LogOut, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { UserAccount } from '../types';

interface SidebarProps {
  currentScreen: 'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings';
  setScreen: (screen: 'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings') => void;
  lowStockCount: number;
  storeName: string;
  currentUser: UserAccount | null;
  onLogout: () => void;
}

export default function Sidebar({ currentScreen, setScreen, lowStockCount, storeName, currentUser, onLogout }: SidebarProps) {
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
    <aside id="sidebar-container" className="flex flex-col w-64 bg-slate-900 text-slate-100 border-r border-slate-800 min-h-screen">
      {/* Brand Header */}
      <div id="brand-header" className="p-6 border-b border-slate-800 flex items-center space-x-3">
        <div className="bg-emerald-500 text-slate-950 p-2 rounded-xl shadow-lg shadow-emerald-500/20">
          <ShoppingBag size={20} className="stroke-[2.5]" />
        </div>
        <div>
          <h1 className="font-sans font-bold tracking-tight text-white text-base truncate max-w-[150px]" title={storeName}>
            {storeName}
          </h1>
          <span className="text-xs text-slate-400 font-mono">Terminal POS v1.0</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav id="sidebar-navigation" className="flex-1 px-4 py-6 space-y-1.5">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              id={`nav-btn-${item.id}`}
              onClick={() => setScreen(item.id)}
              className={`relative flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium transition-all group duration-200 ${
                isActive
                  ? 'text-white bg-slate-800'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center space-x-3 z-10">
                <Icon
                  size={18}
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span>{item.label}</span>
              </div>

              {/* Active Indicator Slide Effect */}
              {isActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute inset-0 bg-slate-800 border-l-4 border-emerald-500 rounded-xl"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}

              {/* Badges (e.g. low stock alert) */}
              {item.badge !== undefined && (
                <span
                  id={`nav-badge-${item.id}`}
                  className="relative z-10 flex items-center space-x-1 bg-amber-500/10 text-amber-500 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20"
                >
                  <AlertCircle size={10} />
                  <span>{item.badge}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logged in employee info container */}
      {currentUser && (
        <div id="sidebar-user-card" className="p-4 mx-4 mb-2 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="bg-slate-800 text-slate-300 w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
              <Shield size={14} className={currentUser.role === 'admin' ? 'text-indigo-400' : currentUser.role === 'manager' ? 'text-amber-400' : 'text-emerald-400'} />
            </div>
            <div className="min-w-0">
              <h5 className="text-xs font-bold text-white truncate leading-tight">{currentUser.name.split(' ')[0]}</h5>
              <span className="text-[9px] uppercase font-mono font-bold text-slate-500">{currentUser.role}</span>
            </div>
          </div>
          
          <button
            onClick={onLogout}
            title="Lock POS Screen"
            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800/50 rounded-xl transition-colors shrink-0 focus:outline-none"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}

      {/* Footer Meta */}
      <div id="sidebar-footer" className="p-4 border-t border-slate-800 bg-slate-950/40 text-center">
        <div className="text-[10px] font-mono text-slate-500 flex items-center justify-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          <span>TERMINAL POS SECURE</span>
        </div>
      </div>
    </aside>
  );
}


import { useState, useEffect } from 'react';
import { ShoppingBag, Package, History as HistoryIcon, Users, BarChart3, Settings as SettingsIcon, Menu, X as XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import Register from './components/Register';
import Inventory from './components/Inventory';
import History from './components/History';
import Customers from './components/Customers';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Lockscreen from './components/Lockscreen';
import { usePOSState } from './hooks/usePOSState';

export default function App() {
  
  // Responsive mobile menu toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Active view/screen router state
  const [currentScreen, setScreen] = useState<'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings'>('register');

  const {
    settings, setSettings,
    categories,
    products,
    customers,
    transactions,
    users,
    currentUser, setCurrentUser,
    printerConfig,
    darkMode, setDarkMode,
    lowStockCount,
    handleCheckout,
    handleRefundTransaction,
    handleAddProduct,
    handleUpdateProduct,
    handleDeleteProduct,
    handleAddCategory,
    handleDeleteCategory,
    handleAddCustomer,
    handleUpdateCustomer,
    handleDeleteCustomer,
    handleResetToDemo,
    handleClearData,
    handleExportDatabase,
    handleImportDatabase
  } = usePOSState();

  // Route guard redirect logic based on staff roles
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'cashier') {
        const prohibitedScreens = ['inventory', 'customers', 'dashboard', 'settings'];
        if (prohibitedScreens.includes(currentScreen)) {
          setScreen('register');
        }
      } else if (currentUser.role === 'manager') {
        if (currentScreen === 'settings') {
          setScreen('register');
        }
      }
    }
  }, [currentUser, currentScreen]);

  if (!currentUser) {
    return <Lockscreen users={users} onLogin={setCurrentUser} storeName={settings.storeName} />;
  }

  // Screen router rendering block
  const renderActiveScreen = () => {
    switch (currentScreen) {
      case 'register':
        return (
          <Register
            products={products}
            categories={categories}
            customers={customers}
            settings={settings}
            onCheckout={handleCheckout}
            onAddCustomer={handleAddCustomer}
          />
        );
      case 'inventory':
        return (
          <Inventory
            products={products}
            categories={categories}
            settings={settings}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        );
      case 'history':
        return (
          <History
            transactions={transactions}
            settings={settings}
            onRefundTransaction={handleRefundTransaction}
            currentUser={currentUser}
            users={users}
            printerConfig={printerConfig}
          />
        );
      case 'customers':
        return (
          <Customers
            customers={customers}
            transactions={transactions}
            settings={settings}
            onAddCustomer={handleAddCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
          />
        );
      case 'dashboard':
        return (
          <Dashboard
            transactions={transactions}
            products={products}
            categories={categories}
            settings={settings}
          />
        );
      case 'settings':
        return (
          <Settings
            settings={settings}
            onUpdateSettings={setSettings}
            onResetToDemo={handleResetToDemo}
            onClearData={handleClearData}
            onImportDatabase={handleImportDatabase}
            onExportDatabase={handleExportDatabase}
          />
        );
      default:
        return <div className="p-8 font-mono text-xs">VIEW ROUTING ERROR</div>;
    }
  };

  // Filter mobile navigation links based on user role
  const mobileMenuItems = [
    { id: 'register', label: 'Sell Register', icon: ShoppingBag, allowedRoles: ['admin', 'manager', 'cashier'] },
    { id: 'dashboard', label: 'Business Dashboard', icon: BarChart3, allowedRoles: ['admin', 'manager'] },
    { id: 'inventory', label: 'Catalog Inventory', icon: Package, badge: lowStockCount > 0 ? lowStockCount : undefined, allowedRoles: ['admin', 'manager'] },
    { id: 'history', label: 'Sales Transactions', icon: HistoryIcon, allowedRoles: ['admin', 'manager', 'cashier'] },
    { id: 'customers', label: 'CRM Customers', icon: Users, allowedRoles: ['admin', 'manager'] },
    { id: 'settings', label: 'System Settings', icon: SettingsIcon, allowedRoles: ['admin'] },
  ].filter(item => !currentUser || item.allowedRoles.includes(item.allowedRoles.includes(currentUser.role) ? currentUser.role : 'admin')); // Safety guard fallback

  const allowedMobileItems = mobileMenuItems.filter(item => 
    item.allowedRoles.includes(currentUser.role)
  );

  return (
    <div id="application-container" className="flex min-h-screen bg-slate-100 dark:bg-slate-950 overflow-hidden text-slate-800 dark:text-slate-100 transition-colors duration-300">
      
      {/* DESKTOP SIDEBAR RAIL */}
      <div id="desktop-sidebar-rail" className="hidden lg:block shrink-0">
        <Sidebar
          currentScreen={currentScreen}
          setScreen={setScreen}
          lowStockCount={lowStockCount}
          storeName={settings.storeName}
          currentUser={currentUser}
          onLogout={() => setCurrentUser(null)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      </div>

      {/* MOBILE HEADER BAR & COLLAPSIBLE DRAWER */}
      <div id="mobile-navigation-shell" className="lg:hidden flex flex-col w-full h-screen overflow-hidden">
        {/* Mobile top navigation header bar */}
        <header className="bg-slate-900 text-slate-100 px-4 py-3 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center space-x-2">
            <div className="bg-emerald-500 text-slate-950 p-1.5 rounded-lg">
              <ShoppingBag size={16} className="stroke-[2.5]" />
            </div>
            <h1 className="font-sans font-bold tracking-tight text-white text-sm truncate max-w-[120px]" title={settings.storeName}>
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
              {darkMode ? <div className="text-amber-400">☀️</div> : <div className="text-indigo-400">🌙</div>}
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

        {/* Collapsible mobile drawer screen */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-[48px] inset-x-0 bg-slate-900 border-b border-slate-800 shadow-2xl z-40 p-4 space-y-2 flex flex-col"
            >
              {allowedMobileItems.map(item => {
                const Icon = item.icon;
                const isSel = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setScreen(item.id as any); setMobileMenuOpen(false); }}
                    className={`flex items-center justify-between w-full p-3 rounded-xl text-xs font-semibold ${
                      isSel ? 'bg-slate-800 text-white border-l-4 border-emerald-500 pl-2' : 'text-slate-400 bg-slate-950/20'
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

        {/* Mobile screen container */}
        <main className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
          {renderActiveScreen()}
        </main>
      </div>

      {/* DESKTOP VIEW CONTAINER */}
      <main id="desktop-view-container" className="hidden lg:flex flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 relative overflow-hidden h-screen">
        {renderActiveScreen()}
      </main>

    </div>
  );
}

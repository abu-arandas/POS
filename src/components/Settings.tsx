import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings as SettingsIcon,
  Cloud,
  UploadCloud,
  DownloadCloud,
  RefreshCw,
  Save,
  Users,
  Printer as PrinterIcon,
  UserPlus,
  Edit2,
  Trash2,
  Check,
  X,
  Monitor,
  Usb,
  Bluetooth,
  Wifi,
  AlertTriangle,
  RotateCcw,
  ScanLine,
  Mail,
  ChefHat,
  Receipt,
  Plus
} from 'lucide-react';
import {
  StoreSettings,
  UserAccount,
  PrinterConfig,
  SupabaseConfig,
  ScannerConfig,
  KitchenStation,
} from '../types';
import { useModalA11y } from '../lib/useModalA11y';
import { useBarcodeScanner } from '../lib/useBarcodeScanner';
import ReceiptSettingsPanel from './ReceiptSettingsPanel';
import {
  detectPrinters,
  requestSerialPort,
  serialSupported,
  scanNetworkPrinters,
  networkScanSupported,
  DetectedPrinter,
} from '../lib/printerDiscovery';
import { useTranslation } from 'react-i18next';
import {
  useSettingsStore,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_SCANNER,
} from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { hashPinSalted } from '../lib/hash';
import { INITIAL_SETTINGS } from '../data/seedData';
import {
  testCloudConnection,
  pushAllToCloud,
  pullAllFromCloud,
  syncToCloudIfEnabled,
  deleteUsersCloudIfEnabled,
} from '../lib/sync';

type SettingsTab = 'profile' | 'printer' | 'scanner' | 'supabase' | 'users' | 'danger';

const DEFAULT_PRINTER: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: true,
  footerMessage: 'Thank you for shopping with us!',
  autoPrintOnCheckout: true,
};

const DEFAULT_SUPABASE: SupabaseConfig = {
  url: '',
  anonKey: '',
  enabled: false,
  status: 'disconnected',
};

export default function Settings() {
  const {
    settings,
    setSettings,
    language,
    setLanguage,
    supabaseConfig,
    setSupabaseConfig,
    printerConfig,
    setPrinterConfig,
    scannerConfig,
    setScannerConfig,
    emailTemplate,
    setEmailTemplate,
    kitchenStations,
    setKitchenStations,
    receiptLayout,
    setReceiptLayout,
    kitchenLayout,
    setKitchenLayout,
    autoScanPrinters,
    setAutoScanPrinters,
  } = useSettingsStore();
  const { products, categories, setProducts, setCategories } = useProductStore();
  const { customers, setCustomers } = useCustomerStore();
  const { transactions, setTransactions, deleteTransactions } = useTransactionStore();
  const { users, setUsers, currentUser, handleAddUser, handleUpdateUser, handleDeleteUser } =
    useAuthStore();
  const { t } = useTranslation();
  
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // --- Staff account management state ---
  const [userModalOpen, setUserModalOpen] = useState(false);
  const userModalRef = useModalA11y(userModalOpen, () => setUserModalOpen(false));
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [uName, setUName] = useState('');
  const [uRole, setURole] = useState<UserAccount['role']>('cashier');
  const [uPin, setUPin] = useState('');
  const [uActive, setUActive] = useState(true);

  // --- Printer config form state ---
  const [printerForm, setPrinterForm] = useState<PrinterConfig>(printerConfig);

  // --- Connected printer discovery ---
  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const refreshPrinters = useCallback(async () => {
    setPrintersLoading(true);
    try {
      setDetectedPrinters(await detectPrinters());
    } finally {
      setPrintersLoading(false);
    }
  }, []);
  // Auto-detect when the Printer tab opens. State updates land only after the
  // async detect resolves — never synchronously inside the effect — and the
  // cancel guard drops a late result if the tab changed meanwhile.
  useEffect(() => {
    if (activeTab !== 'printer') return;
    let cancelled = false;
    detectPrinters()
      .then((list) => {
        if (!cancelled) setDetectedPrinters(list);
      })
      .catch((e) => console.error('Printer detection failed:', e));
    return () => {
      cancelled = true;
    };
  }, [activeTab]);
  const handlePairSerial = async () => {
    if (await requestSerialPort()) await refreshPrinters();
  };
  // Subnet scan for network printers, merged into the detected list (replacing
  // any prior network hits so a re-scan doesn't accumulate stale entries).
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const handleScanNetwork = async () => {
    setScanningNetwork(true);
    try {
      const netPrinters = await scanNetworkPrinters();
      setDetectedPrinters((prev) => [...prev.filter((p) => p.kind !== 'network'), ...netPrinters]);
    } finally {
      setScanningNetwork(false);
    }
  };
  // Auto-scan the LAN once when the Printer tab opens (if enabled + supported),
  // so network printers and the station IP picker populate without a click.
  // Runs post-await only — no synchronous setState inside the effect.
  useEffect(() => {
    if (activeTab !== 'printer' || !autoScanPrinters || !networkScanSupported()) return;
    let cancelled = false;
    scanNetworkPrinters()
      .then((list) => {
        if (!cancelled && list.length > 0) {
          setDetectedPrinters((prev) => [...prev.filter((p) => p.kind !== 'network'), ...list]);
        }
      })
      .catch((e) => console.error('Auto network-printer scan failed:', e));
    return () => {
      cancelled = true;
    };
  }, [activeTab, autoScanPrinters]);
  // One-click apply a discovered network printer to the config form.
  const handleUseNetworkPrinter = (ip: string) => {
    setPrinterForm((f) => ({ ...f, type: 'network', ipAddress: ip }));
  };

  // --- Kitchen station routing form state ---
  const [stationForm, setStationForm] = useState<KitchenStation[]>(kitchenStations);
  const addStation = () =>
    setStationForm((prev) => [
      ...prev,
      { id: `station-${crypto.randomUUID?.() ?? Date.now()}`, name: '', categoryIds: [] },
    ]);
  const updateStation = (id: string, patch: Partial<KitchenStation>) =>
    setStationForm((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStation = (id: string) =>
    setStationForm((prev) => prev.filter((s) => s.id !== id));
  const toggleStationCategory = (id: string, categoryId: string) =>
    setStationForm((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              categoryIds: s.categoryIds.includes(categoryId)
                ? s.categoryIds.filter((c) => c !== categoryId)
                : [...s.categoryIds, categoryId],
            }
          : s,
      ),
    );
  const handleSaveStations = () => {
    // Drop stations with a blank name; trim IPs.
    const cleaned = stationForm
      .filter((s) => s.name.trim())
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        ipAddress: s.ipAddress?.trim() || undefined,
      }));
    setKitchenStations(cleaned);
    setStationForm(cleaned);
    alert(t('settings.stationsSaved'));
  };

  // --- Scanner config form state + live test ---
  const [scannerForm, setScannerForm] = useState<ScannerConfig>(scannerConfig);
  const [lastTestScan, setLastTestScan] = useState<{ code: string; at: string } | null>(null);
  useBarcodeScanner({
    onScan: (code) => setLastTestScan({ code, at: new Date().toLocaleTimeString() }),
    // Live test uses the unsaved form values so thresholds can be tuned first.
    enabled: activeTab === 'scanner' && scannerForm.enabled,
    minLength: scannerForm.minLength,
    maxInterKeyMs: scannerForm.maxInterKeyMs,
  });

  // --- Supabase form state ---
  const [sbUrl, setSbUrl] = useState(supabaseConfig.url);
  const [sbKey, setSbKey] = useState(supabaseConfig.anonKey);
  const [sbAuthEmail, setSbAuthEmail] = useState(supabaseConfig.authEmail || '');
  const [sbAuthPassword, setSbAuthPassword] = useState(supabaseConfig.authPassword || '');
  const [sbEnabled, setSbEnabled] = useState(supabaseConfig.enabled);
  const [busy, setBusy] = useState<null | 'test' | 'push' | 'pull'>(null);

  const handleUpdateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings({ ...settings, [key]: value });
  };

  const openAddUser = () => {
    setEditingUser(null);
    setUName('');
    setURole('cashier');
    setUPin('');
    setUActive(true);
    setUserModalOpen(true);
  };

  const openEditUser = (u: UserAccount) => {
    setEditingUser(u);
    setUName(u.name);
    setURole(u.role);
    setUPin('');
    setUActive(u.active);
    setUserModalOpen(true);
  };

  const handleSubmitUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!uName.trim()) return;
    if ((!editingUser || uPin) && !/^\d{4}$/.test(uPin)) {
      alert(t('settings.pinMustBe4'));
      return;
    }

    if (editingUser) {
      const isLastActiveAdmin =
        editingUser.role === 'admin' &&
        editingUser.active &&
        users.filter((x) => x.role === 'admin' && x.active).length <= 1;
      if (isLastActiveAdmin && (uRole !== 'admin' || !uActive)) {
        alert(t('settings.cannotDeleteLastAdmin'));
        return;
      }

      const updated: UserAccount = {
        ...editingUser,
        name: uName.trim(),
        role: uRole,
        active: uActive,
        pin: uPin ? await hashPinSalted(editingUser.id, uPin) : editingUser.pin,
      };
      handleUpdateUser(updated);
      syncToCloudIfEnabled(undefined, undefined, undefined, undefined, [updated]);
    } else {
      const tempId = `user-${crypto.randomUUID?.() ?? Date.now()}`;
      const pinHash = await hashPinSalted(tempId, uPin);
      const created = handleAddUser(uName.trim(), uRole, pinHash, tempId);
      if (!uActive) {
        const deactivated = { ...created, active: false };
        handleUpdateUser(deactivated);
        syncToCloudIfEnabled(undefined, undefined, undefined, undefined, [deactivated]);
      } else {
        syncToCloudIfEnabled(undefined, undefined, undefined, undefined, [created]);
      }
    }
    setUserModalOpen(false);
  };

  const handleRemoveUser = (u: UserAccount) => {
    if (currentUser && u.id === currentUser.id) {
      alert(t('settings.cannotDeleteSelf'));
      return;
    }
    const activeAdmins = users.filter((x) => x.role === 'admin' && x.active);
    if (u.role === 'admin' && u.active && activeAdmins.length <= 1) {
      alert(t('settings.cannotDeleteLastAdmin'));
      return;
    }
    if (!confirm(t('settings.deleteUserConfirm', { name: u.name }))) return;
    handleDeleteUser(u.id);
    deleteUsersCloudIfEnabled([u.id]);
  };

  const handleSavePrinter = () => {
    setPrinterConfig(printerForm);
    alert(t('settings.printerSaved'));
  };

  const handleSaveScanner = () => {
    setScannerConfig({
      enabled: scannerForm.enabled,
      minLength: Math.max(1, Math.floor(scannerForm.minLength) || 3),
      maxInterKeyMs: Math.max(10, Math.floor(scannerForm.maxInterKeyMs) || 50),
    });
    alert(t('settings.scannerSaved'));
  };

  const buildConfig = (enabled: boolean, status: 'disconnected' | 'connected' | 'error') => ({
    url: sbUrl.trim(),
    anonKey: sbKey.trim(),
    authEmail: sbAuthEmail.trim(),
    authPassword: sbAuthPassword,
    enabled,
    status,
  });

  const persistConfig = (status: 'disconnected' | 'connected' | 'error') => {
    setSupabaseConfig(buildConfig(sbEnabled, status));
  };

  const hasCreds = () => {
    if (sbUrl.trim() && sbKey.trim()) return true;
    alert(t('settings.missingCreds'));
    return false;
  };

  const handleSaveConfig = () => {
    persistConfig(supabaseConfig.status);
    alert(t('settings.configSaved'));
  };

  const handleToggleEnabled = (value: boolean) => {
    setSbEnabled(value);
    setSupabaseConfig(buildConfig(value, supabaseConfig.status));
  };

  const handleTest = async () => {
    if (!hasCreds()) return;
    setBusy('test');
    const ok = await testCloudConnection(sbUrl.trim(), sbKey.trim());
    persistConfig(ok ? 'connected' : 'error');
    setBusy(null);
    alert(ok ? t('settings.connectionSuccess') : t('settings.connectionFailed'));
  };

  const handlePush = async () => {
    if (!hasCreds()) return;
    setBusy('push');
    const ok = await pushAllToCloud(sbUrl.trim(), sbKey.trim(), {
      products,
      categories,
      customers,
      users,
      transactions,
    });
    persistConfig(ok ? 'connected' : 'error');
    setBusy(null);
    alert(ok ? t('settings.pushSuccess') : t('settings.pushFailed'));
  };

  const handlePull = async () => {
    if (!hasCreds()) return;
    if (!confirm(t('settings.pullWarning'))) return;
    setBusy('pull');
    const data = await pullAllFromCloud(sbUrl.trim(), sbKey.trim());
    setBusy(null);
    if (!data) {
      persistConfig('error');
      alert(t('settings.pullFailed'));
      return;
    }
    if (data.categories?.length) setCategories(data.categories);
    if (data.products?.length) setProducts(data.products);
    if (data.customers?.length) setCustomers(data.customers);
    if (data.users?.length) setUsers(data.users);
    if (data.transactions?.length) setTransactions(data.transactions);
    persistConfig('connected');
    alert(t('settings.pullSuccess'));
  };

  const handleDeleteAllTransactions = () => {
    if (confirm(t('settings.confirmDeleteAllTransactions', 'Are you sure you want to permanently delete ALL transactions? This cannot be undone.'))) {
      deleteTransactions(transactions.map(t => t.id));
      alert(t('settings.transactionsDeleted', 'All transactions deleted.'));
    }
  };

  const handleResetDefaults = () => {
    if (confirm(t('settings.confirmResetDefaults', 'Reset all settings to default values? This will not delete your transactions or users.'))) {
      setSettings(INITIAL_SETTINGS);
      setPrinterConfig(DEFAULT_PRINTER);
      setPrinterForm(DEFAULT_PRINTER);
      setScannerConfig(DEFAULT_SCANNER);
      setScannerForm(DEFAULT_SCANNER);
      setEmailTemplate(DEFAULT_EMAIL_TEMPLATE);
      setKitchenStations([]);
      setStationForm([]);
      setAutoScanPrinters(true);
      setSupabaseConfig(DEFAULT_SUPABASE);
      setSbUrl('');
      setSbKey('');
      setSbAuthEmail('');
      setSbAuthPassword('');
      setSbEnabled(false);
      alert(t('settings.defaultsReset', 'Settings reset to defaults.'));
    }
  };

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: typeof SettingsIcon;
    danger?: boolean;
  }> = [
    { id: 'profile', label: t('settings.title', 'Store'), icon: SettingsIcon },
    { id: 'printer', label: t('settings.printerTab', 'Printer'), icon: PrinterIcon },
    { id: 'scanner', label: t('settings.scannerTab', 'Scanner'), icon: ScanLine },
    { id: 'supabase', label: t('settings.supabaseSync', 'Supabase Sync'), icon: Cloud },
    { id: 'users', label: t('settings.usersTab', 'Users'), icon: Users },
    { id: 'danger', label: t('settings.dangerZone', 'Danger Zone'), icon: AlertTriangle, danger: true },
  ];

  const roleLabel: Record<UserAccount['role'], string> = {
    admin: t('settings.roleAdmin'),
    manager: t('settings.roleManager'),
    cashier: t('settings.roleCashier'),
  };
  
  const roleStyle: Record<UserAccount['role'], string> = {
    admin: 'badge badge-emerald',
    manager: 'badge badge-amber',
    cashier: 'badge badge-blue',
  };

  const printerTypes = [
    { id: 'system', label: t('settings.printerSystem'), icon: Monitor },
    { id: 'serial', label: t('settings.printerSerial'), icon: Usb },
    { id: 'network', label: t('settings.printerNetwork'), icon: Wifi },
    { id: 'bluetooth', label: t('settings.printerBluetooth'), icon: Bluetooth },
  ] as const;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <SettingsIcon className="text-emerald-500" />
            {t('settings.systemControlCenter')}
          </h2>
        </div>
        
        {/* Animated Tab Navigation */}
        <nav role="tablist" aria-label={t('settings.systemControlCenter')} className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-px overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? tab.danger 
                      ? 'text-rose-600 dark:text-rose-500'
                      : 'text-emerald-600 dark:text-emerald-500'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="settingsTabIndicator"
                    className={`absolute bottom-0 left-0 right-0 h-0.5 ${tab.danger ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-[#0f172a]/40">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Profile / Store Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  {/* General Info Card */}
                  <div className="surface rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-6">General Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.storeName')}
                        </label>
                        <input
                          type="text"
                          value={settings.storeName}
                          onChange={(e) => handleUpdateSetting('storeName', e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.storePhone')}
                        </label>
                        <input
                          type="text"
                          value={settings.storePhone}
                          onChange={(e) => handleUpdateSetting('storePhone', e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.branchName')}
                        </label>
                        <input
                          type="text"
                          value={settings.branchName || ''}
                          onChange={(e) => handleUpdateSetting('branchName', e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.taxNumber')}
                        </label>
                        <input
                          type="text"
                          value={settings.taxNumber || ''}
                          onChange={(e) => handleUpdateSetting('taxNumber', e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.storeAddress')}
                        </label>
                        <input
                          type="text"
                          value={settings.storeAddress}
                          onChange={(e) => handleUpdateSetting('storeAddress', e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.storeLogoUrl')}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Image URL..."
                            value={settings.storeLogo || ''}
                            onChange={(e) => handleUpdateSetting('storeLogo', e.target.value)}
                            className="glass-input w-full px-4 py-2.5 rounded-xl"
                          />
                          <label className="cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 transition-colors">
                            {t('settings.uploadFile')}
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    handleUpdateSetting('storeLogo', event.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                        {settings.storeLogo && (
                          <div className="mt-4 p-4 surface border border-slate-200 dark:border-slate-700 rounded-xl inline-block shadow-sm">
                            <img
                              src={settings.storeLogo}
                              alt="Store Logo"
                              className="h-16 w-auto object-contain rounded-lg"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Regional & Loyalty Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="surface rounded-2xl p-6">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-6">Regional</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.currencySymbol')}
                          </label>
                          <input
                            type="text"
                            value={settings.currency}
                            onChange={(e) => handleUpdateSetting('currency', e.target.value)}
                            className="glass-input w-full px-4 py-2.5 rounded-xl"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.taxRate')}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={settings.taxRate}
                              onChange={(e) => handleUpdateSetting('taxRate', parseFloat(e.target.value) || 0)}
                              className="glass-input w-full px-4 py-2.5 rounded-xl pr-8"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.language')}
                          </label>
                          <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                            className="glass-input w-full px-4 py-2.5 rounded-xl appearance-none"
                          >
                            <option value="en">{t('settings.english')}</option>
                            <option value="ar">{t('settings.arabic')}</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="surface rounded-2xl p-6">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-6">Loyalty Program</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.loyaltyPointsRate', 'Points Earned per Currency Unit')}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={settings.loyaltyPointsRate}
                            onChange={(e) => handleUpdateSetting('loyaltyPointsRate', parseFloat(e.target.value) || 0)}
                            className="glass-input w-full px-4 py-2.5 rounded-xl"
                            placeholder="e.g. 1 point per $1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.loyaltyPointValue', 'Discount Value per Point')}
                          </label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{settings.currency}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={settings.loyaltyPointValue}
                              onChange={(e) => handleUpdateSetting('loyaltyPointValue', parseFloat(e.target.value) || 0)}
                              className="glass-input w-full px-4 py-2.5 rounded-xl pl-8"
                              placeholder="e.g. $0.05"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Receipt Email Template */}
                  <div className="surface rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Mail size={16} className="text-emerald-500" />
                      {t('settings.emailTemplateTitle')}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                      {t('settings.emailTemplateHint')}
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.emailSubject')}
                        </label>
                        <input
                          type="text"
                          value={emailTemplate.subject}
                          onChange={(e) => setEmailTemplate({ ...emailTemplate, subject: e.target.value })}
                          className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.emailHeader')}
                          </label>
                          <textarea
                            rows={4}
                            value={emailTemplate.header}
                            onChange={(e) => setEmailTemplate({ ...emailTemplate, header: e.target.value })}
                            className="glass-input w-full px-4 py-2.5 rounded-xl text-sm resize-y"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.emailFooter')}
                          </label>
                          <textarea
                            rows={4}
                            value={emailTemplate.footer}
                            onChange={(e) => setEmailTemplate({ ...emailTemplate, footer: e.target.value })}
                            className="glass-input w-full px-4 py-2.5 rounded-xl text-sm resize-y"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEmailTemplate(DEFAULT_EMAIL_TEMPLATE)}
                          className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 transition-colors"
                        >
                          <RotateCcw size={14} />
                          {t('settings.resetTemplate')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Printer Tab */}
              {activeTab === 'printer' && (
                <div className="surface rounded-2xl p-6 max-w-3xl mx-auto space-y-8">
                  {/* Connected printers */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                        {t('settings.connectedPrinters')}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {serialSupported() && (
                          <button
                            type="button"
                            onClick={handlePairSerial}
                            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 transition-colors"
                          >
                            <Usb size={14} />
                            {t('settings.pairSerial')}
                          </button>
                        )}
                        {networkScanSupported() && (
                          <button
                            type="button"
                            onClick={handleScanNetwork}
                            disabled={scanningNetwork}
                            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors"
                          >
                            <Wifi size={14} className={scanningNetwork ? 'animate-pulse' : ''} />
                            {scanningNetwork ? t('settings.scanningNetwork') : t('settings.scanNetwork')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={refreshPrinters}
                          disabled={printersLoading}
                          className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors"
                        >
                          <RefreshCw size={14} className={printersLoading ? 'animate-spin' : ''} />
                          {t('settings.refreshPrinters')}
                        </button>
                      </div>
                    </div>
                    {detectedPrinters.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-4 py-4 leading-relaxed">
                        {printersLoading ? '…' : t('settings.noPrintersFound')}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {detectedPrinters.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                                {p.kind === 'system' ? (
                                  <Monitor size={16} />
                                ) : p.kind === 'network' ? (
                                  <Wifi size={16} />
                                ) : (
                                  <Usb size={16} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                                  {p.name}
                                </span>
                                {p.detail && (
                                  <span className="text-[11px] text-slate-500 block truncate">{p.detail}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {p.isDefault && (
                                <span className="badge badge-emerald">{t('settings.printerDefault')}</span>
                              )}
                              {p.kind === 'network' && p.ipAddress && (
                                <button
                                  type="button"
                                  onClick={() => handleUseNetworkPrinter(p.ipAddress!)}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                                >
                                  {printerForm.type === 'network' && printerForm.ipAddress === p.ipAddress
                                    ? t('settings.printerInUse')
                                    : t('settings.useThisPrinter')}
                                </button>
                              )}
                              <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {networkScanSupported() && (
                      <label className="mt-3 flex items-center gap-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoScanPrinters}
                          onChange={(e) => setAutoScanPrinters(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                        />
                        {t('settings.autoScanPrinters')}
                      </label>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4">
                      {t('settings.connectionType')}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {printerTypes.map((pt) => {
                        const Icon = pt.icon;
                        const isSelected = printerForm.type === pt.id;
                        return (
                          <button
                            key={pt.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setPrinterForm({ ...printerForm, type: pt.id as PrinterConfig['type'] })}
                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <Icon size={24} className="mb-2" />
                            <span className="text-xs font-bold">{pt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                        {t('settings.paperSize')}
                      </label>
                      <select
                        value={printerForm.paperSize}
                        onChange={(e) => setPrinterForm({ ...printerForm, paperSize: e.target.value as PrinterConfig['paperSize'] })}
                        className="glass-input w-full px-4 py-2.5 rounded-xl appearance-none"
                      >
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                      </select>
                    </div>

                    {printerForm.type === 'network' && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.ipAddress')}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="192.168.1.50"
                          value={printerForm.ipAddress || ''}
                          onChange={(e) => setPrinterForm({ ...printerForm, ipAddress: e.target.value })}
                          className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
                        />
                      </motion.div>
                    )}
                    {printerForm.type === 'serial' && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.baudRate')}
                        </label>
                        <input
                          type="number"
                          placeholder="9600"
                          value={printerForm.baudRate ?? ''}
                          onChange={(e) => setPrinterForm({ ...printerForm, baudRate: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
                        />
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printerForm.showBarcode}
                        onChange={(e) => setPrinterForm({ ...printerForm, showBarcode: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {t('settings.showBarcode')}
                      </span>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printerForm.autoPrintOnCheckout}
                        onChange={(e) => setPrinterForm({ ...printerForm, autoPrintOnCheckout: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {t('settings.autoPrint')}
                      </span>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!printerForm.kitchenTicketOnCheckout}
                        onChange={(e) => setPrinterForm({ ...printerForm, kitchenTicketOnCheckout: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {t('settings.autoPrintKitchen')}
                      </span>
                    </label>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      id="save-printer-btn"
                      onClick={handleSavePrinter}
                      className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <Save size={18} />
                      {t('settings.savePrinter')}
                    </button>
                  </div>

                  {/* Customer receipt layout */}
                  <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 mb-1">
                      <Receipt size={16} className="text-emerald-500" />
                      {t('receiptCfg.customerTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                      {t('receiptCfg.customerHint')}
                    </p>
                    <ReceiptSettingsPanel kind="customer" layout={receiptLayout} onChange={setReceiptLayout} />
                  </div>

                  {/* Kitchen ticket layout */}
                  <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 mb-1">
                      <ChefHat size={16} className="text-emerald-500" />
                      {t('receiptCfg.kitchenTitle')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                      {t('receiptCfg.kitchenHint')}
                    </p>
                    <ReceiptSettingsPanel kind="kitchen" layout={kitchenLayout} onChange={setKitchenLayout} />
                  </div>

                  {/* Kitchen station routing */}
                  <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                        <ChefHat size={16} className="text-emerald-500" />
                        {t('settings.kitchenStations')}
                      </h3>
                      <div className="flex items-center gap-2">
                        {networkScanSupported() && (
                          <button
                            type="button"
                            onClick={handleScanNetwork}
                            disabled={scanningNetwork}
                            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-xl flex items-center gap-2 transition-colors"
                          >
                            <Wifi size={14} className={scanningNetwork ? 'animate-pulse' : ''} />
                            {scanningNetwork ? t('settings.scanningNetwork') : t('settings.scanNetwork')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={addStation}
                          className="px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl flex items-center gap-2 transition-colors"
                        >
                          <Plus size={14} />
                          {t('settings.addStation')}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                      {t('settings.kitchenStationsHint')}
                    </p>

                    {/* Discovered network-printer IPs offered as autocomplete on the
                        station IP fields below. */}
                    <datalist id="station-printer-ips">
                      {detectedPrinters
                        .filter((p) => p.kind === 'network' && p.ipAddress)
                        .map((p) => (
                          <option key={p.id} value={p.ipAddress!}>
                            {p.name}
                          </option>
                        ))}
                    </datalist>

                    {stationForm.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-4 py-4">
                        {t('settings.noStations')}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {stationForm.map((station) => (
                          <div
                            key={station.id}
                            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 p-4 space-y-3"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={station.name}
                                onChange={(e) => updateStation(station.id, { name: e.target.value })}
                                placeholder={t('settings.stationNamePlaceholder')}
                                aria-label={t('settings.stationName')}
                                className="glass-input flex-1 px-4 py-2.5 rounded-xl font-bold"
                              />
                              <input
                                type="text"
                                dir="ltr"
                                list="station-printer-ips"
                                value={station.ipAddress || ''}
                                onChange={(e) => updateStation(station.id, { ipAddress: e.target.value })}
                                placeholder={t('settings.stationPrinterIp')}
                                aria-label={t('settings.stationPrinterIp')}
                                className="glass-input w-40 px-4 py-2.5 rounded-xl font-mono text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeStation(station.id)}
                                aria-label={t('settings.removeStation')}
                                className="p-2.5 text-slate-400 hover:text-rose-500 bg-slate-200 dark:bg-slate-800 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                                {t('settings.stationCategories')}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {categories.map((cat) => {
                                  const on = station.categoryIds.includes(cat.id);
                                  return (
                                    <button
                                      key={cat.id}
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() => toggleStationCategory(station.id, cat.id)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                        on
                                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                                          : 'bg-slate-200/50 dark:bg-slate-900/50 border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                      }`}
                                    >
                                      {cat.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveStations}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <Save size={18} />
                        {t('settings.saveStations')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scanner Tab */}
              {activeTab === 'scanner' && (
                <div className="surface rounded-2xl p-6 max-w-3xl mx-auto space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <ScanLine size={16} className="text-emerald-500" />
                      {t('settings.scannerTitle')}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {t('settings.scannerHint')}
                    </p>
                  </div>

                  <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scannerForm.enabled}
                      onChange={(e) => setScannerForm({ ...scannerForm, enabled: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {t('settings.scannerEnabled')}
                    </span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                        {t('settings.scannerMinLength')}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={scannerForm.minLength}
                        onChange={(e) =>
                          setScannerForm({ ...scannerForm, minLength: parseInt(e.target.value) || 0 })
                        }
                        className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">{t('settings.scannerMinLengthHint')}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                        {t('settings.scannerSpeed')}
                      </label>
                      <input
                        type="number"
                        min="10"
                        step="5"
                        value={scannerForm.maxInterKeyMs}
                        onChange={(e) =>
                          setScannerForm({ ...scannerForm, maxInterKeyMs: parseInt(e.target.value) || 0 })
                        }
                        className="glass-input w-full px-4 py-2.5 rounded-xl font-mono"
                      />
                      <p className="text-xs text-slate-500 mt-2">{t('settings.scannerSpeedHint')}</p>
                    </div>
                  </div>

                  {/* Live scan test area */}
                  <div className="rounded-2xl border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 p-5">
                    <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                      <ScanLine size={14} /> {t('settings.scannerTest')}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      {t('settings.scannerTestHint')}
                    </p>
                    <div
                      className="rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-4 py-3 font-mono text-sm"
                      role="status"
                      aria-live="polite"
                    >
                      {lastTestScan ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {t('settings.scannerLastScan')}: <strong>{lastTestScan.code}</strong>
                          <span className="text-slate-400 dark:text-slate-500 ms-2 text-xs">
                            {lastTestScan.at}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">
                          {t('settings.scannerNoScan')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      id="save-scanner-btn"
                      onClick={handleSaveScanner}
                      className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <Save size={18} />
                      {t('settings.saveScanner')}
                    </button>
                  </div>
                </div>
              )}

              {/* Supabase Tab */}
              {activeTab === 'supabase' && (
                <div className="surface rounded-2xl max-w-3xl mx-auto overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Cloud size={18} className="text-blue-500" />
                      {t('settings.supabaseConfig')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase">{t('settings.status')}</span>
                      {supabaseConfig.status === 'connected' && <span className="badge badge-emerald flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>{t('settings.statusConnected')}</span>}
                      {supabaseConfig.status === 'disconnected' && <span className="badge badge-slate flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span>{t('settings.statusDisconnected')}</span>}
                      {supabaseConfig.status === 'error' && <span className="badge badge-rose flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span>{t('settings.statusError')}</span>}
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {t('settings.syncSetupHint')}
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.supabaseUrl')}
                        </label>
                        <input
                          type="url"
                          dir="ltr"
                          placeholder="https://YOUR_PROJECT.supabase.co"
                          value={sbUrl}
                          onChange={(e) => setSbUrl(e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t('settings.supabaseAnonKey')}
                        </label>
                        <input
                          type="password"
                          dir="ltr"
                          placeholder="eyJhbGciOi..."
                          value={sbKey}
                          onChange={(e) => setSbKey(e.target.value)}
                          className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5 bg-slate-100/50 dark:bg-slate-900/30">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {t('settings.deviceAuthHint')}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.deviceEmail')}
                          </label>
                          <input
                            type="email"
                            dir="ltr"
                            autoComplete="off"
                            placeholder="terminal@store.com"
                            value={sbAuthEmail}
                            onChange={(e) => setSbAuthEmail(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            {t('settings.devicePassword')}
                          </label>
                          <input
                            type="password"
                            dir="ltr"
                            autoComplete="new-password"
                            placeholder="••••••••"
                            value={sbAuthPassword}
                            onChange={(e) => setSbAuthPassword(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <label className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sbEnabled}
                        onChange={(e) => handleToggleEnabled(e.target.checked)}
                        className="mt-1 w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="block text-sm font-bold text-slate-900 dark:text-emerald-100">
                          {t('settings.enableSync')}
                        </span>
                        <span className="block text-xs text-slate-600 dark:text-emerald-300/70 mt-1">
                          {t('settings.enableSyncHint')}
                        </span>
                      </div>
                    </label>

                    <div className="flex flex-wrap gap-3 pt-4">
                      <button
                        onClick={handleSaveConfig}
                        disabled={busy !== null}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <Save size={16} />
                        {t('settings.saveConfig')}
                      </button>
                      <button
                        onClick={handleTest}
                        disabled={busy !== null}
                        className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors"
                      >
                        <RefreshCw size={16} className={busy === 'test' ? 'animate-spin' : ''} />
                        {busy === 'test' ? t('settings.testing') : t('settings.testConnection')}
                      </button>
                      <div className="flex-1"></div>
                      <button
                        onClick={handlePull}
                        disabled={busy !== null}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <DownloadCloud size={16} />
                        {busy === 'pull' ? t('settings.pulling') : t('settings.pullFromCloud')}
                      </button>
                      <button
                        onClick={handlePush}
                        disabled={busy !== null}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <UploadCloud size={16} />
                        {busy === 'push' ? t('settings.pushing') : t('settings.pushToCloud')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Users Tab */}
              {activeTab === 'users' && (
                <div className="surface rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Users size={18} className="text-emerald-500" />
                        {t('settings.staffAccounts')}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {t('settings.manageStaff')}
                      </p>
                    </div>
                    <button
                      id="add-user-btn"
                      onClick={openAddUser}
                      className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <UserPlus size={16} />
                      {t('settings.addUser')}
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        id={`user-row-${u.id}`}
                        className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300 font-bold">
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {u.name}
                              </span>
                              {currentUser?.id === u.id && (
                                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded">
                                  {t('settings.youBadge')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={roleStyle[u.role]}>
                                {roleLabel[u.role]}
                              </span>
                              <span
                                className={`text-[10px] font-mono font-bold uppercase ${u.active ? 'text-emerald-500' : 'text-slate-400'}`}
                              >
                                {u.active ? t('settings.statusActive') : t('settings.statusInactive')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => openEditUser(u)}
                            aria-label={t('settings.editUser')}
                            className="p-2 text-slate-400 hover:text-blue-500 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            id={`del-user-${u.id}`}
                            onClick={() => handleRemoveUser(u)}
                            aria-label={t('settings.deleteUser')}
                            className="p-2 text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Danger Zone Tab */}
              {activeTab === 'danger' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="rounded-2xl border-2 border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/5 p-6 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                      <AlertTriangle size={120} />
                    </div>
                    <div className="relative z-10 space-y-6">
                      <div>
                        <h3 className="text-lg font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2 mb-2">
                          <AlertTriangle size={20} />
                          {t('settings.dangerZone', 'Danger Zone')}
                        </h3>
                        <p className="text-sm text-rose-600/80 dark:text-rose-400/80 font-medium">
                          {t('settings.dangerWarning', 'Be careful! These actions cannot be undone.')}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-rose-100 dark:border-rose-900/30">
                          <div>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200">
                              {t('settings.deleteAllTransactions', 'Delete All Transactions')}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1">
                              Permanently removes all transaction history.
                            </p>
                          </div>
                          <button
                            onClick={handleDeleteAllTransactions}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors shrink-0"
                          >
                            <Trash2 size={16} />
                            {t('settings.deleteNow', 'Delete')}
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-white/60 dark:bg-slate-900/60 rounded-xl border border-rose-100 dark:border-rose-900/30">
                          <div>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200">
                              {t('settings.resetToDefaults', 'Reset to Defaults')}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1">
                              Resets store, printer, and sync settings to default values.
                            </p>
                          </div>
                          <button
                            onClick={handleResetDefaults}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors shrink-0"
                          >
                            <RotateCcw size={16} />
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      <AnimatePresence>
        {userModalOpen && (
          <div
            id="user-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
          >
            <motion.div
              ref={userModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="modal-card w-full max-w-sm"
            >
              <div className="px-6 py-4 border-b border-slate-200/10 flex items-center justify-between">
                <h3 id="user-modal-title" className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <UserPlus size={18} className="text-emerald-500" />
                  {editingUser ? t('settings.editUser') : t('settings.newUser')}
                </h3>
                <button
                  onClick={() => setUserModalOpen(false)}
                  aria-label={t('settings.cancel')}
                  className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleSubmitUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    {t('settings.userName')}
                  </label>
                  <input
                    id="user-name-input"
                    type="text"
                    required
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    className="glass-input w-full px-4 py-2.5 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    {t('settings.userRole')}
                  </label>
                  <select
                    id="user-role-select"
                    value={uRole}
                    onChange={(e) => setURole(e.target.value as UserAccount['role'])}
                    className="glass-input w-full px-4 py-2.5 rounded-xl appearance-none"
                  >
                    <option value="admin">{t('settings.roleAdmin')}</option>
                    <option value="manager">{t('settings.roleManager')}</option>
                    <option value="cashier">{t('settings.roleCashier')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    {editingUser ? t('settings.userPinKeep') : t('settings.userPin')}
                  </label>
                  <input
                    id="user-pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={uPin}
                    onChange={(e) => setUPin(e.target.value.replace(/\D/g, ''))}
                    className="glass-input w-full px-4 py-2.5 rounded-xl font-mono tracking-[0.5em] text-lg text-center"
                  />
                </div>
                <label className="flex items-center gap-3 p-4 bg-slate-800/30 rounded-xl cursor-pointer">
                  <input
                    id="user-active-checkbox"
                    type="checkbox"
                    checked={uActive}
                    onChange={(e) => setUActive(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                  />
                  <span className="text-sm font-bold text-slate-200">
                    {t('settings.statusActive')}
                  </span>
                </label>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/10">
                  <button
                    type="button"
                    onClick={() => setUserModalOpen(false)}
                    className="px-5 py-2.5 text-sm font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    {t('settings.cancel')}
                  </button>
                  <button
                    id="user-save-btn"
                    type="submit"
                    className="px-5 py-2.5 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <Check size={16} />
                    {t('settings.saveUser')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

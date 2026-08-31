import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings as SettingsIcon,
  Cloud,
  Users,
  Printer as PrinterIcon,
  Monitor,
  Usb,
  Bluetooth,
  Wifi,
  AlertTriangle,
  ScanLine,
  ChefHat,
} from 'lucide-react';
import { StoreSettings, UserAccount, PrinterConfig, ScannerConfig, KitchenStation } from '../types';
import { useModalA11y } from '../lib/useModalA11y';
import { useBarcodeScanner } from '../lib/useBarcodeScanner';
import {
  DangerZonePanel,
  KitchenPrinterPanel,
  PrinterPanel,
  ProfilePanel,
  ScannerPanel,
  SupabasePanel,
  UserModal,
  UsersPanel,
} from './settings';
import { serialSupported, networkScanSupported } from '../lib/printerDiscovery';
import { usePrinterDiscovery } from './settings/usePrinterDiscovery';
import { useTranslation } from 'react-i18next';
import {
  useSettingsStore,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_SCANNER,
  DEFAULT_SETTINGS,
  DEFAULT_PRINTER,
  DEFAULT_SUPABASE,
} from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { hashPinSalted } from '../lib/hash';
import { shortId } from '../lib/utils/ids';
import { notify } from '../lib/utils/ui';
import { askConfirmation } from '../lib/utils/ui';
import {
  testCloudConnection,
  pushAllToCloud,
  pullAllFromCloud,
  syncToCloudIfEnabled,
  deleteUsersCloudIfEnabled,
} from '../lib/sync';

type SettingsTab =
  'profile' | 'printer' | 'kitchen_printer' | 'scanner' | 'supabase' | 'users' | 'danger';

/**
 * Settings screen: store identity, tax and loyalty rates, printer and scanner
 * hardware, receipt layouts, cloud sync, and staff accounts.
 */
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
    storeId,
    setStoreId,
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

  const {
    detectedPrinters,
    printersLoading,
    scanningNetwork,
    refreshPrinters,
    pairSerial,
    scanNetwork,
  } = usePrinterDiscovery(activeTab, autoScanPrinters);
  const handlePairSerial = pairSerial;
  const handleScanNetwork = scanNetwork;

  // One-click apply a discovered network printer to the config form.
  const handleUseNetworkPrinter = (ip: string) => {
    setPrinterForm((f) => ({ ...f, type: 'network', ipAddress: ip }));
  };

  // Applies a detected OS printer in one click. Without this the operator had
  // to read the name off the list and retype it into the Printer field by
  // hand, matching Windows' spelling exactly — the single most error-prone
  // step in setting a USB printer up. 'windows' is the right default because
  // it is the RAW spooler path: silent, and it carries the cash-drawer pulse
  // that the 'system' path cannot send.
  const handleUseSystemPrinter = (name: string) => {
    setPrinterForm((f) => ({
      ...f,
      type: f.type === 'system' ? 'system' : 'windows',
      printerName: name,
    }));
  };

  // --- Kitchen station routing form state ---
  const [stationForm, setStationForm] = useState<KitchenStation[]>(kitchenStations);
  const addStation = () =>
    setStationForm((prev) => [...prev, { id: `station-${shortId()}`, name: '', categoryIds: [] }]);
  const addStationFromPrinter = (pName: string, ipAddress?: string) => {
    setStationForm((prev) => [
      ...prev,
      {
        id: `station-${shortId()}`,
        name: pName,
        ipAddress: ipAddress || '',
        categoryIds: [],
      },
    ]);
  };
  const updateStation = (id: string, patch: Partial<KitchenStation>) =>
    setStationForm((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStation = (id: string) => setStationForm((prev) => prev.filter((s) => s.id !== id));
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
        printerName: s.printerName?.trim() || undefined,
      }));
    setKitchenStations(cleaned);
    setStationForm(cleaned);
    notify(t('settings.stationsSaved'));
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
  const [sbStoreId, setSbStoreId] = useState(storeId);
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
      notify(t('settings.pinMustBe4'));
      return;
    }

    if (editingUser) {
      const isLastActiveAdmin =
        editingUser.role === 'admin' &&
        editingUser.active &&
        users.filter((x) => x.role === 'admin' && x.active).length <= 1;
      if (isLastActiveAdmin && (uRole !== 'admin' || !uActive)) {
        notify(t('settings.cannotDeleteLastAdmin'));
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
      const tempId = `user-${shortId()}`;
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

  const handleRemoveUser = async (u: UserAccount) => {
    if (currentUser && u.id === currentUser.id) {
      notify(t('settings.cannotDeleteSelf'));
      return;
    }
    const activeAdmins = users.filter((x) => x.role === 'admin' && x.active);
    if (u.role === 'admin' && u.active && activeAdmins.length <= 1) {
      notify(t('settings.cannotDeleteLastAdmin'));
      return;
    }
    if (!(await askConfirmation(t('settings.deleteUserConfirm', { name: u.name })))) return;
    handleDeleteUser(u.id);
    deleteUsersCloudIfEnabled([u.id]);
  };

  const handleSavePrinter = () => {
    setPrinterConfig(printerForm);
    notify(t('settings.printerSaved'));
  };

  const handleSaveScanner = () => {
    setScannerConfig({
      enabled: scannerForm.enabled,
      minLength: Math.max(1, Math.floor(scannerForm.minLength) || 3),
      maxInterKeyMs: Math.max(10, Math.floor(scannerForm.maxInterKeyMs) || 50),
    });
    notify(t('settings.scannerSaved'));
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
    notify(t('settings.missingCreds'));
    return false;
  };

  const handleSaveConfig = () => {
    persistConfig(supabaseConfig.status);
    // The store scope is what stamps store_id on every synced row. Without a
    // way to set it, multi-store mode was documented but unreachable, and
    // running multi-store-rls-enforce.sql would have locked terminals out of
    // their own data.
    setStoreId(sbStoreId.trim());
    notify(t('settings.configSaved'));
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
    notify(ok ? t('settings.connectionSuccess') : t('settings.connectionFailed'));
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
    notify(ok ? t('settings.pushSuccess') : t('settings.pushFailed'));
  };

  const handlePull = async () => {
    if (!hasCreds()) return;
    if (!(await askConfirmation(t('settings.pullWarning')))) return;
    setBusy('pull');
    const data = await pullAllFromCloud(sbUrl.trim(), sbKey.trim());
    setBusy(null);
    if (!data) {
      persistConfig('error');
      notify(t('settings.pullFailed'));
      return;
    }
    // `null` means that table failed to load; an empty array means it loaded
    // and the cloud genuinely has no rows. Applying only non-empty results
    // conflated the two and then reported success either way, so a terminal
    // could be told "pull complete" having silently kept its stale local
    // transactions. Report which tables failed instead.
    const failed = (
      [
        ['categories', data.categories],
        ['products', data.products],
        ['customers', data.customers],
        ['users', data.users],
        ['transactions', data.transactions],
      ] as const
    )
      .filter(([, rows]) => rows === null)
      .map(([name]) => name);

    if (data.categories) setCategories(data.categories);
    if (data.products) setProducts(data.products);
    if (data.customers) setCustomers(data.customers);
    // Never let a pull leave the terminal with no way back in: an empty
    // user_accounts table would wipe every local login.
    if (data.users?.length) setUsers(data.users);
    if (data.transactions) setTransactions(data.transactions);

    persistConfig(failed.length > 0 ? 'error' : 'connected');
    notify(
      failed.length > 0
        ? t('settings.pullPartial', {
            tables: failed.join(', '),
            defaultValue: `Pull incomplete — these tables failed to load and were left unchanged: {{tables}}`,
          })
        : t('settings.pullSuccess'),
    );
  };

  const handleDeleteAllTransactions = async () => {
    if (
      await askConfirmation(
        t(
          'settings.confirmDeleteAllTransactions',
          'Are you sure you want to permanently delete ALL transactions? This cannot be undone.',
        ),
      )
    ) {
      // deleteTransactions already propagates the deletion to the cloud; calling
      // deleteTransactionsCloudIfEnabled here as well doubled the largest
      // request the app makes.
      deleteTransactions(transactions.map((tx) => tx.id));
      notify(t('settings.transactionsDeleted', 'All transactions deleted.'));
    }
  };

  const handleResetDefaults = async () => {
    if (
      await askConfirmation(
        t(
          'settings.confirmResetDefaults',
          'Reset all settings to default values? This will not delete your transactions or users.',
        ),
      )
    ) {
      setSettings(DEFAULT_SETTINGS);
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
      setStoreId('');
      setSbStoreId('');
      notify(t('settings.defaultsReset', 'Settings reset to defaults.'));
    }
  };

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: typeof SettingsIcon;
    danger?: boolean;
  }> = [
    { id: 'profile', label: t('settings.title', 'Store'), icon: SettingsIcon },
    { id: 'printer', label: t('settings.printerTab', 'Receipt Printer'), icon: PrinterIcon },
    {
      id: 'kitchen_printer',
      label: t('settings.kitchenPrinterTab', 'Kitchen Printer'),
      icon: ChefHat,
    },
    { id: 'scanner', label: t('settings.scannerTab', 'Scanner'), icon: ScanLine },
    { id: 'supabase', label: t('settings.supabaseSync', 'Supabase Sync'), icon: Cloud },
    { id: 'users', label: t('settings.usersTab', 'Users'), icon: Users },
    {
      id: 'danger',
      label: t('settings.dangerZone', 'Danger Zone'),
      icon: AlertTriangle,
      danger: true,
    },
  ];

  const printerTypes = [
    { id: 'windows', label: t('settings.printerWindows'), icon: Usb },
    { id: 'network', label: t('settings.printerNetwork'), icon: Wifi },
    { id: 'system', label: t('settings.printerSystem'), icon: Monitor },
    { id: 'serial', label: t('settings.printerSerial'), icon: Usb },
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
        <nav
          role="tablist"
          aria-label={t('settings.systemControlCenter')}
          className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-px overflow-x-auto no-scrollbar"
        >
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
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="settingsTabIndicator"
                    className={`absolute bottom-0 left-0 right-0 h-0.5 ${tab.danger ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-[#0f172a]/40">
        <div className="w-full mx-auto">
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
                <ProfilePanel
                  t={t}
                  settings={settings}
                  language={language}
                  emailTemplate={emailTemplate}
                  onUpdateSetting={handleUpdateSetting}
                  onLanguageChange={setLanguage}
                  onEmailTemplateChange={setEmailTemplate}
                />
              )}

              {activeTab === 'printer' && (
                <PrinterPanel
                  t={t}
                  printerForm={printerForm}
                  onPrinterFormChange={setPrinterForm}
                  detectedPrinters={detectedPrinters}
                  printersLoading={printersLoading}
                  scanningNetwork={scanningNetwork}
                  autoScanPrinters={autoScanPrinters}
                  printerTypes={printerTypes}
                  receiptLayout={receiptLayout}
                  onPairSerial={handlePairSerial}
                  onScanNetwork={handleScanNetwork}
                  onRefreshPrinters={refreshPrinters}
                  onUseNetworkPrinter={handleUseNetworkPrinter}
                  onUseSystemPrinter={handleUseSystemPrinter}
                  onAutoScanPrintersChange={setAutoScanPrinters}
                  onSavePrinter={handleSavePrinter}
                  onReceiptLayoutChange={setReceiptLayout}
                  serialSupported={serialSupported}
                  networkScanSupported={networkScanSupported}
                />
              )}

              {activeTab === 'kitchen_printer' && (
                <KitchenPrinterPanel
                  t={t}
                  categories={categories}
                  stationForm={stationForm}
                  detectedPrinters={detectedPrinters}
                  scanningNetwork={scanningNetwork}
                  printersLoading={printersLoading}
                  kitchenLayout={kitchenLayout}
                  onPairSerial={handlePairSerial}
                  onScanNetwork={handleScanNetwork}
                  onRefreshPrinters={refreshPrinters}
                  onAddStation={addStation}
                  onAddStationFromPrinter={addStationFromPrinter}
                  onUpdateStation={updateStation}
                  onRemoveStation={removeStation}
                  onToggleStationCategory={toggleStationCategory}
                  onSaveStations={handleSaveStations}
                  onKitchenLayoutChange={setKitchenLayout}
                  serialSupported={serialSupported}
                  networkScanSupported={networkScanSupported}
                />
              )}

              {activeTab === 'scanner' && (
                <ScannerPanel
                  t={t}
                  scannerForm={scannerForm}
                  onScannerFormChange={setScannerForm}
                  lastTestScan={lastTestScan}
                  onSaveScanner={handleSaveScanner}
                />
              )}

              {activeTab === 'supabase' && (
                <SupabasePanel
                  t={t}
                  supabaseConfig={supabaseConfig}
                  sbUrl={sbUrl}
                  sbKey={sbKey}
                  sbAuthEmail={sbAuthEmail}
                  sbAuthPassword={sbAuthPassword}
                  sbEnabled={sbEnabled}
                  sbStoreId={sbStoreId}
                  busy={busy}
                  onSbUrlChange={setSbUrl}
                  onSbKeyChange={setSbKey}
                  onSbAuthEmailChange={setSbAuthEmail}
                  onSbAuthPasswordChange={setSbAuthPassword}
                  onSbStoreIdChange={setSbStoreId}
                  onToggleEnabled={handleToggleEnabled}
                  onSaveConfig={handleSaveConfig}
                  onTest={handleTest}
                  onPull={handlePull}
                  onPush={handlePush}
                />
              )}

              {activeTab === 'users' && (
                <UsersPanel
                  t={t}
                  users={users}
                  currentUser={currentUser}
                  onAddUser={openAddUser}
                  onEditUser={openEditUser}
                  onRemoveUser={handleRemoveUser}
                />
              )}

              {activeTab === 'danger' && (
                <DangerZonePanel
                  t={t}
                  onDeleteAllTransactions={handleDeleteAllTransactions}
                  onResetDefaults={handleResetDefaults}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      <AnimatePresence>
        {userModalOpen && (
          <UserModal
            t={t}
            modalRef={userModalRef}
            editingUser={editingUser}
            userName={uName}
            userRole={uRole}
            userPin={uPin}
            userActive={uActive}
            onUserNameChange={setUName}
            onUserRoleChange={setURole}
            onUserPinChange={setUPin}
            onUserActiveChange={setUActive}
            onClose={() => setUserModalOpen(false)}
            onSubmit={handleSubmitUser}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

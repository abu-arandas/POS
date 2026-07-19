import { useState, type FormEvent } from 'react';
import {
  Settings as SettingsIcon,
  Cloud,
  UploadCloud,
  DownloadCloud,
  RefreshCw,
  Save,
  Users,
  Printer,
  UserPlus,
  Edit2,
  Trash2,
  Check,
  X,
  Shield,
} from 'lucide-react';
import { StoreSettings, UserAccount, PrinterConfig } from '../types';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { hashPinSalted } from '../lib/hash';
import {
  testCloudConnection,
  pushAllToCloud,
  pullAllFromCloud,
  syncToCloudIfEnabled,
  deleteUsersCloudIfEnabled,
} from '../lib/sync';

type SettingsTab = 'profile' | 'users' | 'printer' | 'supabase';

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
  } = useSettingsStore();
  const { products, categories, setProducts, setCategories } = useProductStore();
  const { customers, setCustomers } = useCustomerStore();
  const { transactions, setTransactions } = useTransactionStore();
  const { users, setUsers, currentUser, handleAddUser, handleUpdateUser, handleDeleteUser } =
    useAuthStore();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // --- Staff account management state ---
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [uName, setUName] = useState('');
  const [uRole, setURole] = useState<UserAccount['role']>('cashier');
  const [uPin, setUPin] = useState('');
  const [uActive, setUActive] = useState(true);

  // --- Printer config form state (seeded from persisted config) ---
  const [printerForm, setPrinterForm] = useState<PrinterConfig>(printerConfig);

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
    setUPin(''); // blank = keep current PIN
    setUActive(u.active);
    setUserModalOpen(true);
  };

  const handleSubmitUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!uName.trim()) return;
    // PIN required for new users; optional (blank = unchanged) when editing.
    if ((!editingUser || uPin) && !/^\d{4}$/.test(uPin)) {
      alert(t('settings.pinMustBe4'));
      return;
    }

    if (editingUser) {
      // Demoting or deactivating the last active admin would lock everyone out
      // of Settings — the same rule already enforced for deletion.
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
      // New user: generate ID first so we can salt the PIN hash with it.
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

  // Supabase form state, seeded from the persisted config.
  const [sbUrl, setSbUrl] = useState(supabaseConfig.url);
  const [sbKey, setSbKey] = useState(supabaseConfig.anonKey);
  const [sbAuthEmail, setSbAuthEmail] = useState(supabaseConfig.authEmail || '');
  const [sbAuthPassword, setSbAuthPassword] = useState(supabaseConfig.authPassword || '');
  const [sbEnabled, setSbEnabled] = useState(supabaseConfig.enabled);
  const [busy, setBusy] = useState<null | 'test' | 'push' | 'pull'>(null);

  const handleUpdateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings({ ...settings, [key]: value });
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
    // Only overwrite a local table when the cloud actually returned rows for it.
    // An empty result usually means that table failed to load (e.g. RLS blocked
    // the anon role) — replacing local data with [] would wipe the catalog or,
    // worse, delete every staff account and lock the terminal out.
    if (data.categories?.length) setCategories(data.categories);
    if (data.products?.length) setProducts(data.products);
    if (data.customers?.length) setCustomers(data.customers);
    if (data.users?.length) setUsers(data.users);
    if (data.transactions?.length) setTransactions(data.transactions);
    persistConfig('connected');
    alert(t('settings.pullSuccess'));
  };

  const statusLabel = {
    connected: t('settings.statusConnected'),
    disconnected: t('settings.statusDisconnected'),
    error: t('settings.statusError'),
  }[supabaseConfig.status];

  const statusStyle = {
    connected: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    disconnected: 'bg-slate-100 text-slate-600 border-slate-200',
    error: 'bg-rose-100 text-rose-700 border-rose-200',
  }[supabaseConfig.status];

  const tabs = [
    { id: 'profile', label: t('settings.title'), icon: SettingsIcon },
    { id: 'users', label: t('settings.usersTab'), icon: Users },
    { id: 'printer', label: t('settings.printerTab'), icon: Printer },
    { id: 'supabase', label: t('settings.supabaseSync'), icon: Cloud },
  ] as const;

  const roleLabel: Record<UserAccount['role'], string> = {
    admin: t('settings.roleAdmin'),
    manager: t('settings.roleManager'),
    cashier: t('settings.roleCashier'),
  };
  const roleStyle: Record<UserAccount['role'], string> = {
    admin: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    manager: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    cashier: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <SettingsIcon className="text-emerald-500" />
            {t('settings.systemControlCenter')}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        <div className="w-full md:w-64 bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800 shrink-0 p-4 overflow-y-auto">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-start transition-colors ${
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-emerald-500' : 'text-slate-400'} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="max-w-3xl mx-auto">
            {activeTab === 'profile' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {t('settings.title')}
                  </h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.storeName')}
                      </label>
                      <input
                        type="text"
                        value={settings.storeName}
                        onChange={(e) => handleUpdateSetting('storeName', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.storePhone')}
                      </label>
                      <input
                        type="text"
                        value={settings.storePhone}
                        onChange={(e) => handleUpdateSetting('storePhone', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.storeAddress')}
                      </label>
                      <input
                        type="text"
                        value={settings.storeAddress}
                        onChange={(e) => handleUpdateSetting('storeAddress', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.storeLogoUrl')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Image URL..."
                          value={settings.storeLogo || ''}
                          onChange={(e) => handleUpdateSetting('storeLogo', e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                        />
                        <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 flex items-center justify-center shrink-0">
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
                        <div className="mt-3 p-3 bg-white border border-slate-200 rounded-xl inline-block shadow-sm">
                          <img
                            src={settings.storeLogo}
                            alt="Store Logo"
                            className="h-16 w-auto object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.currencySymbol')}
                      </label>
                      <input
                        type="text"
                        value={settings.currency}
                        onChange={(e) => handleUpdateSetting('currency', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.taxRate')}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={settings.taxRate}
                        onChange={(e) =>
                          handleUpdateSetting('taxRate', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.language')}
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      >
                        <option value="en">{t('settings.english')}</option>
                        <option value="ar">{t('settings.arabic')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'users' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Users size={18} className="text-emerald-500" />
                      {t('settings.staffAccounts')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('settings.manageStaff')}
                    </p>
                  </div>
                  <button
                    id="add-user-btn"
                    onClick={openAddUser}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <UserPlus size={16} />
                    {t('settings.addUser')}
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      id={`user-row-${u.id}`}
                      className="px-6 py-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${roleStyle[u.role]}`}
                        >
                          <Shield size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {u.name}
                            </span>
                            {currentUser?.id === u.id && (
                              <span className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                                • {t('settings.youBadge')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${roleStyle[u.role]}`}
                            >
                              {roleLabel[u.role]}
                            </span>
                            <span
                              className={`text-[10px] font-mono ${u.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
                            >
                              {u.active ? t('settings.statusActive') : t('settings.statusInactive')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openEditUser(u)}
                          title={t('settings.editUser')}
                          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          id={`del-user-${u.id}`}
                          onClick={() => handleRemoveUser(u)}
                          title={t('settings.deleteUser')}
                          className="p-1.5 text-slate-400 hover:text-rose-600 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100/60 rounded-lg transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'printer' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                  <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Printer size={18} className="text-emerald-500" />
                    {t('settings.printerConfig')}
                  </h3>
                </div>
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        {t('settings.connectionType')}
                      </label>
                      <select
                        id="printer-type"
                        value={printerForm.type}
                        onChange={(e) =>
                          setPrinterForm({
                            ...printerForm,
                            type: e.target.value as PrinterConfig['type'],
                          })
                        }
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      >
                        <option value="system">{t('settings.printerSystem')}</option>
                        <option value="serial">{t('settings.printerSerial')}</option>
                        <option value="bluetooth">{t('settings.printerBluetooth')}</option>
                        <option value="network">{t('settings.printerNetwork')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        {t('settings.paperSize')}
                      </label>
                      <select
                        value={printerForm.paperSize}
                        onChange={(e) =>
                          setPrinterForm({
                            ...printerForm,
                            paperSize: e.target.value as PrinterConfig['paperSize'],
                          })
                        }
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                      >
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                      </select>
                    </div>
                    {printerForm.type === 'network' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                          {t('settings.ipAddress')}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="192.168.1.50"
                          value={printerForm.ipAddress || ''}
                          onChange={(e) =>
                            setPrinterForm({ ...printerForm, ipAddress: e.target.value })
                          }
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono text-sm"
                        />
                      </div>
                    )}
                    {printerForm.type === 'serial' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                          {t('settings.baudRate')}
                        </label>
                        <input
                          type="number"
                          placeholder="9600"
                          value={printerForm.baudRate ?? ''}
                          onChange={(e) =>
                            setPrinterForm({
                              ...printerForm,
                              baudRate: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      {t('settings.footerMessage')}
                    </label>
                    <input
                      type="text"
                      value={printerForm.footerMessage}
                      onChange={(e) =>
                        setPrinterForm({ ...printerForm, footerMessage: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                    />
                  </div>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printerForm.showBarcode}
                      onChange={(e) =>
                        setPrinterForm({ ...printerForm, showBarcode: e.target.checked })
                      }
                      className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {t('settings.showBarcode')}
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printerForm.autoPrintOnCheckout}
                      onChange={(e) =>
                        setPrinterForm({ ...printerForm, autoPrintOnCheckout: e.target.checked })
                      }
                      className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {t('settings.autoPrint')}
                    </span>
                  </label>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      id="save-printer-btn"
                      onClick={handleSavePrinter}
                      className="px-4 py-2.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <Save size={16} />
                      {t('settings.savePrinter')}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'supabase' && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Cloud size={18} className="text-emerald-500" />
                    {t('settings.supabaseConfig')}
                  </h3>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${statusStyle}`}
                  >
                    {t('settings.status')}: {statusLabel}
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  <p className="text-xs text-slate-500">{t('settings.syncSetupHint')}</p>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {t('settings.supabaseUrl')}
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      placeholder="https://YOUR_PROJECT.supabase.co"
                      value={sbUrl}
                      onChange={(e) => setSbUrl(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {t('settings.supabaseAnonKey')}
                    </label>
                    <input
                      type="password"
                      dir="ltr"
                      placeholder="eyJhbGciOi..."
                      value={sbKey}
                      onChange={(e) => setSbKey(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono text-sm"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('settings.deviceAuthHint')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                          {t('settings.deviceEmail')}
                        </label>
                        <input
                          type="email"
                          dir="ltr"
                          autoComplete="off"
                          placeholder="terminal@store.com"
                          value={sbAuthEmail}
                          onChange={(e) => setSbAuthEmail(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                          {t('settings.devicePassword')}
                        </label>
                        <input
                          type="password"
                          dir="ltr"
                          autoComplete="new-password"
                          placeholder="••••••••"
                          value={sbAuthPassword}
                          onChange={(e) => setSbAuthPassword(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sbEnabled}
                      onChange={(e) => handleToggleEnabled(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {t('settings.enableSync')}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {t('settings.enableSyncHint')}
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
                    <button
                      onClick={handleSaveConfig}
                      disabled={busy !== null}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <Save size={16} />
                      {t('settings.saveConfig')}
                    </button>
                    <button
                      onClick={handleTest}
                      disabled={busy !== null}
                      className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <RefreshCw size={16} className={busy === 'test' ? 'animate-spin' : ''} />
                      {busy === 'test' ? t('settings.testing') : t('settings.testConnection')}
                    </button>
                    <button
                      onClick={handlePush}
                      disabled={busy !== null}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <UploadCloud size={16} />
                      {busy === 'push' ? t('settings.pushing') : t('settings.pushToCloud')}
                    </button>
                    <button
                      onClick={handlePull}
                      disabled={busy !== null}
                      className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <DownloadCloud size={16} />
                      {busy === 'pull' ? t('settings.pulling') : t('settings.pullFromCloud')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / edit staff account modal */}
      {userModalOpen && (
        <div
          id="user-modal"
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <UserPlus size={18} className="text-emerald-500" />
                {editingUser ? t('settings.editUser') : t('settings.newUser')}
              </h3>
              <button
                onClick={() => setUserModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmitUser} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {t('settings.userName')}
                </label>
                <input
                  id="user-name-input"
                  type="text"
                  required
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {t('settings.userRole')}
                </label>
                <select
                  id="user-role-select"
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as UserAccount['role'])}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100"
                >
                  <option value="admin">{t('settings.roleAdmin')}</option>
                  <option value="manager">{t('settings.roleManager')}</option>
                  <option value="cashier">{t('settings.roleCashier')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
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
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden dark:text-slate-100 font-mono tracking-[0.5em]"
                />
              </div>
              <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                <input
                  id="user-active-checkbox"
                  type="checkbox"
                  checked={uActive}
                  onChange={(e) => setUActive(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {t('settings.statusActive')}
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {t('settings.cancel')}
                </button>
                <button
                  id="user-save-btn"
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Check size={16} />
                  {t('settings.saveUser')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

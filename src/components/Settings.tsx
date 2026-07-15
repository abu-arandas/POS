import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Cloud,
  UploadCloud,
  DownloadCloud,
  RefreshCw,
  Save,
} from 'lucide-react';
import { StoreSettings } from '../types';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { testCloudConnection, pushAllToCloud, pullAllFromCloud } from '../lib/sync';

export default function Settings() {
  const { settings, setSettings, language, setLanguage, supabaseConfig, setSupabaseConfig } =
    useSettingsStore();
  const { products, categories, setProducts, setCategories } = useProductStore();
  const { customers, setCustomers } = useCustomerStore();
  const { transactions, setTransactions } = useTransactionStore();
  const { users, setUsers } = useAuthStore();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'supabase'>('profile');

  // Supabase form state, seeded from the persisted config.
  const [sbUrl, setSbUrl] = useState(supabaseConfig.url);
  const [sbKey, setSbKey] = useState(supabaseConfig.anonKey);
  const [sbEnabled, setSbEnabled] = useState(supabaseConfig.enabled);
  const [busy, setBusy] = useState<null | 'test' | 'push' | 'pull'>(null);

  const handleUpdateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings({ ...settings, [key]: value });
  };

  const persistConfig = (status: 'disconnected' | 'connected' | 'error') => {
    setSupabaseConfig({
      url: sbUrl.trim(),
      anonKey: sbKey.trim(),
      enabled: sbEnabled,
      status,
    });
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
    setSupabaseConfig({
      url: sbUrl.trim(),
      anonKey: sbKey.trim(),
      enabled: value,
      status: supabaseConfig.status,
    });
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
    if (data.categories) setCategories(data.categories);
    if (data.products) setProducts(data.products);
    if (data.customers) setCustomers(data.customers);
    if (data.users) setUsers(data.users);
    if (data.transactions) setTransactions(data.transactions);
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
    { id: 'supabase', label: t('settings.supabaseSync'), icon: Cloud },
  ] as const;

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
                  onClick={() => setActiveTab(tab.id as 'profile' | 'supabase')}
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
                  <h3 className="font-semibold text-slate-900 dark:text-white">{t('settings.title')}</h3>
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
    </div>
  );
}

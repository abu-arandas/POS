import React, { useState } from 'react';
import { Settings as SettingsIcon, Cloud } from 'lucide-react';
import { StoreSettings, SupabaseConfig } from '../types';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';

export default function Settings() {
  const { settings, setSettings, language, setLanguage } = useSettingsStore();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'supabase'>('profile');

  // Supabase Local State
  const [supabaseConfig] = useState<SupabaseConfig>(() => {
    const saved = localStorage.getItem('pos_supabase_config');
    return saved
      ? JSON.parse(saved)
      : {
          url: '',
          anonKey: '',
          enabled: false,
          status: 'disconnected',
        };
  });

  const handleUpdateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings({ ...settings, [key]: value });
  };

  const tabs = [
    { id: 'profile', label: t('settings.title'), icon: SettingsIcon },
    { id: 'supabase', label: t('settings.supabaseSync'), icon: Cloud },
  ] as const;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="text-emerald-500" />
            {t('settings.systemControlCenter')}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        <div className="w-full md:w-64 bg-white border-e border-slate-200 shrink-0 p-4 overflow-y-auto">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-start transition-colors ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-emerald-500' : 'text-slate-400'} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          <div className="max-w-3xl mx-auto">
            {activeTab === 'profile' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-semibold text-slate-900">{t('settings.title')}</h3>
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
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
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
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
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
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
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
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
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
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
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
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {t('settings.language')}
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
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
              <div className="p-6 bg-white rounded-2xl border border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-4">{t('settings.supabaseConfig')}</h3>
                <p className="text-sm text-slate-600">{t('settings.status')}: {supabaseConfig.status}</p>
                <p className="text-xs text-slate-400 mt-2">{t('settings.configureEnv')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

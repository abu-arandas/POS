import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, Cloud
} from 'lucide-react';
import { StoreSettings, SupabaseConfig } from '../types';

import { useSettingsStore } from '../stores/settingsStore';

export default function Settings() {
  const { settings, setSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'supabase'>('profile');

  // Supabase Local State
  const [supabaseConfig] = useState<SupabaseConfig>(() => {
    const saved = localStorage.getItem('pos_supabase_config');
    return saved ? JSON.parse(saved) : {
      url: '',
      anonKey: '',
      enabled: false,
      status: 'disconnected'
    };
  });

  const handleUpdateSetting = (key: keyof StoreSettings, value: string | number) => {
    setSettings({ ...settings, [key]: value });
  };

  const tabs = [
    { id: 'profile', label: 'Store Profile', icon: SettingsIcon },
    { id: 'supabase', label: 'Supabase Sync', icon: Cloud }
  ] as const;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="text-emerald-500" />
            System Control Center
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        <div className="w-full md:w-64 bg-white border-r border-slate-200 shrink-0 p-4 overflow-y-auto">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
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
                  <h3 className="font-semibold text-slate-900">Store Profile</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Store Name</label>
                      <input
                        type="text"
                        value={settings.storeName}
                        onChange={(e) => handleUpdateSetting('storeName', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Currency Symbol</label>
                      <input
                        type="text"
                        value={settings.currency}
                        onChange={(e) => handleUpdateSetting('currency', e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'supabase' && (
              <div className="p-6 bg-white rounded-2xl border border-slate-200">
                 <h3 className="font-semibold text-slate-900 mb-4">Supabase Config</h3>
                 <p className="text-sm text-slate-600">Status: {supabaseConfig.status}</p>
                 <p className="text-xs text-slate-400 mt-2">Configure through .env file</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

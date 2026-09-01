import type { TFunction } from 'i18next';
import { Cloud, DownloadCloud, RefreshCw, Save, UploadCloud } from 'lucide-react';
import type { SupabaseConfig } from '../../types';

export interface SupabasePanelProps {
  t: TFunction;
  supabaseConfig: SupabaseConfig;
  sbUrl: string;
  sbKey: string;
  sbAuthEmail: string;
  sbAuthPassword: string;
  sbEnabled: boolean;
  sbStoreId: string;
  busy: null | 'test' | 'push' | 'pull';
  onSbUrlChange(value: string): void;
  onSbKeyChange(value: string): void;
  onSbAuthEmailChange(value: string): void;
  onSbAuthPasswordChange(value: string): void;
  onSbStoreIdChange(value: string): void;
  onToggleEnabled(value: boolean): void;
  onSaveConfig(): void;
  onTest(): void | Promise<void>;
  onPull(): void | Promise<void>;
  onPush(): void | Promise<void>;
}

export function SupabasePanel({
  t,
  supabaseConfig,
  sbUrl,
  sbKey,
  sbAuthEmail,
  sbAuthPassword,
  sbEnabled,
  sbStoreId,
  busy,
  onSbUrlChange,
  onSbKeyChange,
  onSbAuthEmailChange,
  onSbAuthPasswordChange,
  onSbStoreIdChange,
  onToggleEnabled,
  onSaveConfig,
  onTest,
  onPull,
  onPush,
}: SupabasePanelProps) {
  return (
    <div className="surface rounded-2xl max-w-3xl mx-auto overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Cloud size={18} className="text-blue-500" />
          {t('settings.supabaseConfig')}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">
            {t('settings.status')}
          </span>
          {supabaseConfig.status === 'connected' && (
            <span className="badge badge-emerald flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {t('settings.statusConnected')}
            </span>
          )}
          {supabaseConfig.status === 'disconnected' && (
            <span className="badge badge-slate flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              {t('settings.statusDisconnected')}
            </span>
          )}
          {supabaseConfig.status === 'error' && (
            <span className="badge badge-rose flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              {t('settings.statusError')}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {t('settings.syncSetupHint')}
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="set-supabase-url"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.supabaseUrl')}
            </label>
            <input
              id="set-supabase-url"
              type="url"
              dir="ltr"
              placeholder="https://YOUR_PROJECT.supabase.co"
              value={sbUrl}
              onChange={(e) => onSbUrlChange(e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="set-supabase-anon-key"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.supabaseAnonKey')}
            </label>
            <input
              id="set-supabase-anon-key"
              type="password"
              dir="ltr"
              placeholder="eyJhbGciOi..."
              value={sbKey}
              onChange={(e) => onSbKeyChange(e.target.value)}
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
              <label
                htmlFor="set-device-email"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.deviceEmail')}
              </label>
              <input
                id="set-device-email"
                type="email"
                dir="ltr"
                autoComplete="off"
                placeholder="terminal@store.com"
                value={sbAuthEmail}
                onChange={(e) => onSbAuthEmailChange(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="set-device-password"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.devicePassword')}
              </label>
              <input
                id="set-device-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                placeholder="••••••••"
                value={sbAuthPassword}
                onChange={(e) => onSbAuthPasswordChange(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="set-store-id"
            className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
          >
            {t('settings.storeIdLabel')}
          </label>
          <input
            id="set-store-id"
            type="text"
            dir="ltr"
            placeholder={t('settings.storeIdPlaceholder')}
            value={sbStoreId}
            onChange={(e) => onSbStoreIdChange(e.target.value)}
            className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            {t('settings.storeIdHint')}
          </p>
        </div>

        <label className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl cursor-pointer">
          <input
            type="checkbox"
            checked={sbEnabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
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
            onClick={onSaveConfig}
            disabled={busy !== null}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <Save size={16} />
            {t('settings.saveConfig')}
          </button>
          <button
            onClick={onTest}
            disabled={busy !== null}
            className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={16} className={busy === 'test' ? 'animate-spin' : ''} />
            {busy === 'test' ? t('settings.testing') : t('settings.testConnection')}
          </button>
          <div className="flex-1"></div>
          <button
            onClick={onPull}
            disabled={busy !== null}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <DownloadCloud size={16} />
            {busy === 'pull' ? t('settings.pulling') : t('settings.pullFromCloud')}
          </button>
          <button
            onClick={onPush}
            disabled={busy !== null}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <UploadCloud size={16} />
            {busy === 'push' ? t('settings.pushing') : t('settings.pushToCloud')}
          </button>
        </div>
      </div>
    </div>
  );
}

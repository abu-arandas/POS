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

/**
 * Settings' cloud panel: the Supabase credentials, the store this terminal
 * syncs as, and the manual push/pull controls with the connection state.
 */
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
    <div className="bg-card border border-border rounded-xl max-w-3xl mx-auto overflow-hidden shadow-2xs">
      <div className="px-5 py-3.5 border-b border-border bg-secondary/20 flex items-center justify-between">
        <h3 className="font-semibold text-xs sm:text-sm text-foreground flex items-center gap-2">
          <Cloud size={16} className="text-muted-foreground" />
          {t('settings.supabaseConfig')}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">
            {t('settings.status')}
          </span>
          {supabaseConfig.status === 'connected' && (
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500"></span>
              {t('settings.statusConnected')}
            </span>
          )}
          {supabaseConfig.status === 'disconnected' && (
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-secondary text-muted-foreground border-border flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-muted-foreground"></span>
              {t('settings.statusDisconnected')}
            </span>
          )}
          {supabaseConfig.status === 'error' && (
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-destructive"></span>
              {t('settings.statusError')}
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('settings.syncSetupHint')}
        </p>

        <div className="space-y-3.5">
          <div>
            <label
              htmlFor="set-supabase-url"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
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
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="set-supabase-anon-key"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
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
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 bg-secondary/15">
          <p className="text-[11px] text-muted-foreground mb-3">
            {t('settings.deviceAuthHint')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="set-device-email"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
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
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="set-device-password"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
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
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="set-store-id"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
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
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            {t('settings.storeIdHint')}
          </p>
        </div>

        <label className="flex items-start gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
          <input
            type="checkbox"
            checked={sbEnabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="mt-0.5 size-4 rounded border-border text-foreground focus:ring-foreground accent-foreground"
          />
          <div>
            <span className="block text-xs font-semibold text-foreground">
              {t('settings.enableSync')}
            </span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              {t('settings.enableSyncHint')}
            </span>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            onClick={onSaveConfig}
            disabled={busy !== null}
            className="btn-primary h-9 px-4 text-xs font-medium gap-1.5"
          >
            <Save size={14} />
            {t('settings.saveConfig')}
          </button>
          <button
            onClick={onTest}
            disabled={busy !== null}
            className="btn-secondary h-9 px-3 text-xs font-medium gap-1.5"
          >
            <RefreshCw size={13} className={busy === 'test' ? 'animate-spin' : ''} />
            {busy === 'test' ? t('settings.testing') : t('settings.testConnection')}
          </button>
          <div className="flex-1"></div>
          <button
            onClick={onPull}
            disabled={busy !== null}
            className="btn-secondary h-9 px-3 text-xs font-medium gap-1.5"
          >
            <DownloadCloud size={14} />
            {busy === 'pull' ? t('settings.pulling') : t('settings.pullFromCloud')}
          </button>
          <button
            onClick={onPush}
            disabled={busy !== null}
            className="btn-secondary h-9 px-3 text-xs font-medium gap-1.5"
          >
            <UploadCloud size={14} />
            {busy === 'push' ? t('settings.pushing') : t('settings.pushToCloud')}
          </button>
        </div>
      </div>
    </div>
  );
}

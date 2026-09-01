import type { TFunction } from 'i18next';
import { Mail, RotateCcw } from 'lucide-react';
import type { StoreSettings, ReceiptEmailTemplate } from '../../types';
import { safeImageUrl } from '../../lib/imageUrl';
import { DEFAULT_EMAIL_TEMPLATE } from '../../stores/settingsStore';

export interface ProfilePanelProps {
  t: TFunction;
  settings: StoreSettings;
  language: 'en' | 'ar';
  emailTemplate: ReceiptEmailTemplate;
  onUpdateSetting(key: keyof StoreSettings, value: string | number): void;
  onLanguageChange(value: 'en' | 'ar'): void;
  onEmailTemplateChange(value: ReceiptEmailTemplate): void;
}

export function ProfilePanel({
  t,
  settings,
  language,
  emailTemplate,
  onUpdateSetting,
  onLanguageChange,
  onEmailTemplateChange,
}: ProfilePanelProps) {
  return (
    <div className="space-y-6">
      {/* General Info Card */}
      <div className="surface rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-6">
          {t('settings.generalDetails')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="set-store-name"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.storeName')}
            </label>
            <input
              id="set-store-name"
              type="text"
              value={settings.storeName}
              onChange={(e) => onUpdateSetting('storeName', e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl"
            />
          </div>
          <div>
            <label
              htmlFor="set-store-phone"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.storePhone')}
            </label>
            <input
              id="set-store-phone"
              type="text"
              value={settings.storePhone}
              onChange={(e) => onUpdateSetting('storePhone', e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl"
            />
          </div>
          <div>
            <label
              htmlFor="set-branch-name"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.branchName')}
            </label>
            <input
              id="set-branch-name"
              type="text"
              value={settings.branchName || ''}
              onChange={(e) => onUpdateSetting('branchName', e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl"
            />
          </div>
          <div>
            <label
              htmlFor="set-tax-number"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.taxNumber')}
            </label>
            <input
              id="set-tax-number"
              type="text"
              value={settings.taxNumber || ''}
              onChange={(e) => onUpdateSetting('taxNumber', e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="set-store-address"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.storeAddress')}
            </label>
            <input
              id="set-store-address"
              type="text"
              value={settings.storeAddress}
              onChange={(e) => onUpdateSetting('storeAddress', e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="set-store-logo-url"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.storeLogoUrl')}
            </label>
            <div className="flex gap-2">
              <input
                id="set-store-logo-url"
                type="text"
                placeholder={t('settings.logoUrlPlaceholder')}
                value={settings.storeLogo || ''}
                onChange={(e) => onUpdateSetting('storeLogo', e.target.value)}
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
                        onUpdateSetting('storeLogo', event.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>
            {safeImageUrl(settings.storeLogo) && (
              <div className="mt-4 p-4 surface border border-slate-200 dark:border-slate-700 rounded-xl inline-block shadow-sm">
                <img
                  src={safeImageUrl(settings.storeLogo)}
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
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-6">
            {t('settings.regional')}
          </h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="set-currency-symbol"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.currencySymbol')}
              </label>
              <input
                id="set-currency-symbol"
                type="text"
                value={settings.currency}
                onChange={(e) => onUpdateSetting('currency', e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl"
              />
            </div>
            <div>
              <label
                htmlFor="set-tax-rate"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.taxRate')}
              </label>
              <div className="relative">
                <input
                  id="set-tax-rate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.taxRate}
                  onChange={(e) => onUpdateSetting('taxRate', parseFloat(e.target.value) || 0)}
                  className="glass-input w-full px-4 py-2.5 rounded-xl pe-8"
                />
                <span className="absolute inset-e-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm">
                  %
                </span>
              </div>
            </div>
            <div>
              <label
                htmlFor="set-language"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.language')}
              </label>
              <select
                id="set-language"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as 'en' | 'ar')}
                className="glass-input w-full px-4 py-2.5 rounded-xl appearance-none"
              >
                <option value="en">{t('settings.english')}</option>
                <option value="ar">{t('settings.arabic')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="surface rounded-2xl p-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-6">
            {t('settings.loyaltyProgram')}
          </h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="set-loyalty-points-rate"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.loyaltyPointsRate', 'Points Earned per Currency Unit')}
              </label>
              <input
                id="set-loyalty-points-rate"
                type="number"
                min="0"
                step="0.1"
                value={settings.loyaltyPointsRate}
                onChange={(e) =>
                  onUpdateSetting('loyaltyPointsRate', parseFloat(e.target.value) || 0)
                }
                className="glass-input w-full px-4 py-2.5 rounded-xl"
                placeholder="e.g. 1 point per $1"
              />
            </div>
            <div>
              <label
                htmlFor="set-loyalty-point-value"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.loyaltyPointValue', 'Discount Value per Point')}
              </label>
              <div className="relative">
                <span className="absolute inset-s-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm">
                  {settings.currency}
                </span>
                <input
                  id="set-loyalty-point-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.loyaltyPointValue}
                  onChange={(e) =>
                    onUpdateSetting('loyaltyPointValue', parseFloat(e.target.value) || 0)
                  }
                  className="glass-input w-full px-4 py-2.5 rounded-xl ps-8"
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
            <label
              htmlFor="set-email-subject"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
            >
              {t('settings.emailSubject')}
            </label>
            <input
              id="set-email-subject"
              type="text"
              value={emailTemplate.subject}
              onChange={(e) => onEmailTemplateChange({ ...emailTemplate, subject: e.target.value })}
              className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="set-email-header"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.emailHeader')}
              </label>
              <textarea
                id="set-email-header"
                rows={4}
                value={emailTemplate.header}
                onChange={(e) =>
                  onEmailTemplateChange({ ...emailTemplate, header: e.target.value })
                }
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm resize-y"
              />
            </div>
            <div>
              <label
                htmlFor="set-email-footer"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2"
              >
                {t('settings.emailFooter')}
              </label>
              <textarea
                id="set-email-footer"
                rows={4}
                value={emailTemplate.footer}
                onChange={(e) =>
                  onEmailTemplateChange({ ...emailTemplate, footer: e.target.value })
                }
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm resize-y"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onEmailTemplateChange(DEFAULT_EMAIL_TEMPLATE)}
              className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center gap-2 transition-colors"
            >
              <RotateCcw size={14} />
              {t('settings.resetTemplate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

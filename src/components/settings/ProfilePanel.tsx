import type { TFunction } from 'i18next';
import { Mail, RotateCcw } from 'lucide-react';
import type { StoreSettings, ReceiptEmailTemplate } from '../../types';
import { safeImageUrl } from '../../lib/imageUrl';
import { DEFAULT_EMAIL_TEMPLATE } from '../../stores/settingsStore';
import type { Locale } from '../../lib/i18n';

export interface ProfilePanelProps {
  t: TFunction;
  settings: StoreSettings;
  language: Locale;
  emailTemplate: ReceiptEmailTemplate;
  showProductImages: boolean;
  soundEffects: boolean;
  onShowProductImagesChange(value: boolean): void;
  onSoundEffectsChange(value: boolean): void;
  onUpdateSetting(key: keyof StoreSettings, value: string | number): void;
  onLanguageChange(value: Locale): void;
  onEmailTemplateChange(value: ReceiptEmailTemplate): void;
}

/**
 * Settings' store panel: the identity that prints on receipts, plus the
 * tax, currency, loyalty, language and display preferences.
 */
export function ProfilePanel({
  t,
  settings,
  language,
  emailTemplate,
  showProductImages,
  soundEffects,
  onShowProductImagesChange,
  onSoundEffectsChange,
  onUpdateSetting,
  onLanguageChange,
  onEmailTemplateChange,
}: ProfilePanelProps) {
  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* General Info Card */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-5">
          {t('settings.generalDetails')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="set-store-name"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('settings.storeName')}
            </label>
            <input
              id="set-store-name"
              type="text"
              value={settings.storeName}
              onChange={(e) => onUpdateSetting('storeName', e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="set-store-phone"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('settings.storePhone')}
            </label>
            <input
              id="set-store-phone"
              type="text"
              value={settings.storePhone}
              onChange={(e) => onUpdateSetting('storePhone', e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="set-branch-name"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('settings.branchName')}
            </label>
            <input
              id="set-branch-name"
              type="text"
              value={settings.branchName || ''}
              onChange={(e) => onUpdateSetting('branchName', e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="set-tax-number"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('settings.taxNumber')}
            </label>
            <input
              id="set-tax-number"
              type="text"
              value={settings.taxNumber || ''}
              onChange={(e) => onUpdateSetting('taxNumber', e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="set-store-address"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('settings.storeAddress')}
            </label>
            <input
              id="set-store-address"
              type="text"
              value={settings.storeAddress}
              onChange={(e) => onUpdateSetting('storeAddress', e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="set-store-logo-url"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
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
                className="flex-1 bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
              />
              <label className="btn-secondary h-9 px-3 text-xs cursor-pointer flex items-center shrink-0">
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
              <div className="mt-3 p-3 bg-secondary/30 border border-border rounded-lg inline-block">
                <img
                  src={safeImageUrl(settings.storeLogo)}
                  alt="Store Logo"
                  className="h-14 w-auto object-contain rounded"
                />
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="flex items-start gap-3 p-3.5 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
              <input
                id="set-show-product-images"
                type="checkbox"
                checked={showProductImages}
                onChange={(e) => onShowProductImagesChange(e.target.checked)}
                className="size-4 mt-0.5 rounded border-border text-foreground focus:ring-foreground shrink-0 accent-foreground"
              />
              <span>
                <span className="block text-xs font-semibold text-foreground">
                  {t('settings.showProductImages')}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  {t('settings.showProductImagesHint')}
                </span>
              </span>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="flex items-start gap-3 p-3.5 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
              <input
                id="set-sound-effects"
                type="checkbox"
                checked={soundEffects}
                onChange={(e) => onSoundEffectsChange(e.target.checked)}
                className="size-4 mt-0.5 rounded border-border text-foreground focus:ring-foreground shrink-0 accent-foreground"
              />
              <span>
                <span className="block text-xs font-semibold text-foreground">
                  {t('settings.soundEffects')}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  {t('settings.soundEffectsHint')}
                </span>
              </span>
            </label>
          </div>

          {/* Customer-facing display. It is a second browser window on the
              counter's second screen, mirrored from the register over a
              BroadcastChannel, so the only thing needed here is a way to open
              it. Opened with noopener: it must not be able to script this
              window back. */}
          <div className="md:col-span-2">
            <div className="flex items-start justify-between gap-3 p-3.5 bg-secondary/20 border border-border rounded-lg">
              <span>
                <span className="block text-xs font-semibold text-foreground">
                  {t('settings.customerDisplay')}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  {t('settings.customerDisplayHint')}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `${window.location.pathname}?display=customer`,
                    'ea-pos-customer-display',
                    'noopener,noreferrer',
                  )
                }
                className="btn-secondary h-8 px-3 rounded-lg text-xs shrink-0"
              >
                {t('settings.openCustomerDisplay')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Regional & Loyalty Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-4">
            {t('settings.regional')}
          </h3>
          <div className="space-y-3.5">
            <div>
              <label
                htmlFor="set-currency-symbol"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t('settings.currencySymbol')}
              </label>
              <input
                id="set-currency-symbol"
                type="text"
                value={settings.currency}
                onChange={(e) => onUpdateSetting('currency', e.target.value)}
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="set-tax-rate"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
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
                  className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors font-mono pe-8"
                />
                <span className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">
                  %
                </span>
              </div>
            </div>
            <div>
              <label
                htmlFor="set-language"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t('settings.language')}
              </label>
              <select
                id="set-language"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as Locale)}
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
              >
                <option value="en">{t('settings.english')}</option>
                <option value="ar">{t('settings.arabic')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-4">
            {t('settings.loyaltyProgram')}
          </h3>
          <div className="space-y-3.5">
            <div>
              <label
                htmlFor="set-loyalty-points-rate"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t('settings.loyaltyPointsRate')}
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
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors"
                placeholder="e.g. 1 point per $1"
              />
            </div>
            <div>
              <label
                htmlFor="set-loyalty-point-value"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t('settings.loyaltyPointValue')}
              </label>
              <div className="relative">
                <span className="absolute inset-s-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">
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
                  className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground font-mono focus:outline-none focus:border-foreground/50 transition-colors ps-7"
                  placeholder="e.g. $0.05"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Email Template */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono mb-1.5 flex items-center gap-2">
          <Mail size={14} className="text-muted-foreground" />
          {t('settings.emailTemplateTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
          {t('settings.emailTemplateHint')}
        </p>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="set-email-subject"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              {t('settings.emailSubject')}
            </label>
            <input
              id="set-email-subject"
              type="text"
              value={emailTemplate.subject}
              onChange={(e) => onEmailTemplateChange({ ...emailTemplate, subject: e.target.value })}
              className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors font-mono"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="set-email-header"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t('settings.emailHeader')}
              </label>
              <textarea
                id="set-email-header"
                rows={3}
                value={emailTemplate.header}
                onChange={(e) =>
                  onEmailTemplateChange({ ...emailTemplate, header: e.target.value })
                }
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors resize-y font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="set-email-footer"
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {t('settings.emailFooter')}
              </label>
              <textarea
                id="set-email-footer"
                rows={3}
                value={emailTemplate.footer}
                onChange={(e) =>
                  onEmailTemplateChange({ ...emailTemplate, footer: e.target.value })
                }
                className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors resize-y font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onEmailTemplateChange(DEFAULT_EMAIL_TEMPLATE)}
              className="btn-secondary h-8 px-3 text-xs gap-1.5"
            >
              <RotateCcw size={13} />
              {t('settings.resetTemplate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { TFunction } from 'i18next';
import {
  BusinessProfile,
  BusinessTemplate,
  MODULE_IDS,
  TEMPLATE_IDS,
  isModuleEnabled,
  profileFromTemplate,
  withModule,
} from '../../lib/businessProfile';
import { businessText } from './businessText';

export interface BusinessProfilePanelProps {
  t: TFunction;
  profile: BusinessProfile;
  onChange(profile: BusinessProfile): void;
}

/**
 * Settings' business panel: which kind of business this terminal runs and which
 * optional modules it offers. Picking a template resets the modules to that
 * template's; the toggles then adjust them one at a time. Turning a module off
 * only hides its screens — nothing it recorded is deleted.
 */
export function BusinessProfilePanel({ t, profile, onChange }: BusinessProfilePanelProps) {
  const text = businessText(t);
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs max-w-3xl mx-auto space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
          {t('business.panelTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1.5">{t('business.panelHint')}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={t('business.panelTitle')}
        className="grid sm:grid-cols-2 gap-3"
      >
        {TEMPLATE_IDS.map((template: BusinessTemplate) => {
          const selected = profile.template === template;
          return (
            <button
              key={template}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(profileFromTemplate(template))}
              className={`text-start p-3 rounded-lg border transition-colors ${
                selected
                  ? 'border-foreground bg-secondary/40'
                  : 'border-border bg-secondary/10 hover:bg-secondary/30'
              }`}
            >
              <span className="block text-xs font-semibold text-foreground">
                {text.templates[template].title}
              </span>
              <span className="block text-xs text-muted-foreground mt-1">
                {text.templates[template].hint}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('business.modules')}</p>
        {MODULE_IDS.map((module) => (
          <label
            key={module}
            className="flex items-start gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors"
          >
            <input
              type="checkbox"
              checked={isModuleEnabled(profile, module)}
              onChange={(e) => onChange(withModule(profile, module, e.target.checked))}
              className="size-4 mt-0.5 rounded border-border text-foreground focus:ring-foreground accent-foreground"
            />
            <span>
              <span className="block text-xs font-medium text-foreground">
                {text.modules[module].title}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {text.modules[module].hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

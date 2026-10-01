import type { TFunction } from 'i18next';
import type { BusinessTemplate, ModuleId } from '../../lib/businessProfile';

/** A name and a one-line description, in the active language. */
export interface BusinessCopy {
  title: string;
  hint: string;
}

/**
 * The words for each template and module, looked up once. Shared by first-run
 * setup and the Settings panel so the two describe a module the same way. Every
 * key is spelled out statically so the locale test can see it is defined.
 */
export function businessText(t: TFunction): {
  templates: Record<BusinessTemplate, BusinessCopy>;
  modules: Record<ModuleId, BusinessCopy>;
} {
  return {
    templates: {
      'general-retail': {
        title: t('business.templateGeneralRetail'),
        hint: t('business.templateGeneralRetailHint'),
      },
      restaurant: {
        title: t('business.templateRestaurant'),
        hint: t('business.templateRestaurantHint'),
      },
    },
    modules: {
      tables: { title: t('business.moduleTables'), hint: t('business.moduleTablesHint') },
      kitchen: { title: t('business.moduleKitchen'), hint: t('business.moduleKitchenHint') },
      qrmenu: { title: t('business.moduleQrmenu'), hint: t('business.moduleQrmenuHint') },
    },
  };
}

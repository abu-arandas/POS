---
name: pos-i18n-localization
description: Guidelines and standards for multi-language support (English & Arabic), dynamic LTR/RTL layout switching, i18next key conventions, number/currency formatting, and typography.
---

# EA POS — i18n & Arabic RTL Localization Guide

EA POS features dynamic multi-language localization supporting English (LTR) and Arabic (RTL) across all POS screens, reports, receipts, and customer menu views.

## 📚 Detailed Sub-References

- **Tailwind Logical Properties & RTL Layout Cheatsheet**: [references/rtl-styling-cheatsheet.md](references/rtl-styling-cheatsheet.md)

---

## 🌐 Localization Engine (`src/lib/i18n.ts`)

Powered by `i18next` and `react-i18next`:

```typescript
import { useTranslation } from 'react-i18next';

export function CartHeader() {
  const { t, i18n } = useTranslation();
  
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold">{t('cart.title')}</h2>
      <button onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}>
        {i18n.language === 'ar' ? 'English' : 'عربي'}
      </button>
    </div>
  );
}
```

---

## 📐 Dynamic Direction Handling (`dir="rtl"`)

When switching language to Arabic (`ar`), the document root `<html dir="rtl">` automatically flips layout alignment.

### Styling Guidelines for RTL
1. Use logical utilities: `start-0`, `end-0`, `ps-4`, `pe-4`, `text-start`, `text-end`.
2. Flip directional arrow icons dynamically with `rotate-180`.

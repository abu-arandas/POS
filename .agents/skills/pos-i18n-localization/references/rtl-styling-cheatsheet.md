# Dynamic RTL & Arabic Styling Cheatsheet

This reference provides rules, Tailwind CSS utilities, and layout guidelines for dynamic LTR (English) and RTL (Arabic) rendering in EA POS.

## 📐 1. Tailwind Logical Property Map

Replace standard directional utilities with CSS Logical Properties:

| Standard LTR Utility (Avoid) | Logical RTL-Safe Utility (Use) | Purpose |
| :--- | :--- | :--- |
| `left-0` | `start-0` | Inline Start positioning |
| `right-0` | `end-0` | Inline End positioning |
| `ml-4` | `ms-4` | Margin Inline Start |
| `mr-4` | `me-4` | Margin Inline End |
| `pl-4` | `ps-4` | Padding Inline Start |
| `pr-4` | `pe-4` | Padding Inline End |
| `text-left` | `text-start` | Alignment at inline start |
| `text-right` | `text-end` | Alignment at inline end |
| `border-l` | `border-s` | Border at inline start |
| `border-r` | `border-e` | Border at inline end |
| `rounded-l-lg` | `rounded-s-lg` | Border radius at inline start |
| `rounded-r-lg` | `rounded-e-lg` | Border radius at inline end |

---

## 🔁 2. Icon Direction Flipping

Icons indicating motion or progression (`ChevronRight`, `ArrowRight`, `BackArrow`) must flip horizontally in RTL mode:

```tsx
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

export function NavigationButton() {
  const { i18n } = useTranslation();
  const isRtl = i18n.dir() === 'rtl';

  return (
    <button className="flex items-center gap-2">
      <span>Next</span>
      <ChevronRight className={isRtl ? 'rotate-180' : ''} />
    </button>
  );
}
```

---

## 🔤 3. Typography & Font Fallbacks

Arabic rendering uses clean Sans-Serif font fallbacks:
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans Arabic', sans-serif;
```

---
name: pos-testing-qa
description: Standards and execution guide for Vitest unit testing, React Testing Library component tests, Playwright end-to-end checkout automation, accessibility testing, and security sanitization.
---

# EA POS — Quality Assurance & Testing Guide

EA POS maintains strict quality assurance standards guarded by fast unit tests (Vitest) and complete end-to-end browser checkout automation (Playwright).

## 🧪 Vitest Suite (`npm test`)

The unit test suite covers core domain engines:
- **Pricing & Discounts**: `test/lib/pricing.test.ts`
- **Tender & Payments**: `test/lib/payments.test.ts`
- **Line-Item Refunds**: `test/lib/refunds.test.ts`
- **ESC/POS Encoding**: `test/lib/escpos.test.ts`
- **Receipt Formatting**: `test/lib/receiptFormat.test.ts` & `test/lib/receiptPrinter.test.ts`
- **HTML Security Escaping**: `test/lib/escapeHtml.test.ts`
- **Accessibility & Focus Traps**: `test/lib/useModalA11y.test.tsx`
- **Cart Component**: `test/components/CartPanel.test.tsx`

### Running Unit Tests

```bash
cmd /c npm test
```

---

## 🎭 Playwright End-to-End Suite (`npm run test:e2e`)

Playwright drives a headless Chromium instance through real user checkout flows:
1. **PIN Login**: Staff authentication with role-based access.
2. **Catalog Interaction**: Category navigation, product addition, quantity adjustment.
3. **Cart Discounts & Hold Order**: Parking and resuming order carts.
4. **Checkout Settlement**: Cash, card, and split payment execution.
5. **Shift Reconciliation**: Z-report generation and shift closing.

```bash
cmd /c npm run test:e2e
```

---

## 🛡️ Security & Input Sanitization Rule

To prevent XSS when printing receipts or rendering external client menus, **all user-supplied strings** must be sanitized using `escapeHtml()`:

```typescript
import { escapeHtml } from '../lib/escapeHtml';

const safeCustomerName = escapeHtml(customer.name);
```

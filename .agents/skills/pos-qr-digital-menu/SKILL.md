---
name: pos-qr-digital-menu
description: Guide for embedded Express server, digital QR menu generation, HTML menu rendering, dynamic QR code vector export, and customer menu browsing in EA POS.
---

# EA POS — Digital QR Menu Server

EA POS contains an embedded HTTP menu server allowing cafes and restaurants to serve an instant, live mobile menu to customer smartphones via scannable QR codes.

## 📱 Server & Architecture (`electron/main.cjs` & `src/components/QRMenu.tsx`)

```
[ Customer Phone ] ---> Scan QR Code ---> HTTP GET http://<Terminal-IP>:3001/menu
                                                       |
                                               [ Express Server ]
                                                       |
                                            Renders [ electron/menu.html ]
                                            with live store catalog & prices
```

### Key Components

1. **Embedded Express App**: Runs inside Electron main process (`electron/main.cjs`), listening on port `3001` (configurable).
2. **Menu HTML Template** (`electron/menu.html`): Self-contained, responsive mobile HTML view with product search, category filtering, dark/light styling, and Arabic/English language toggle.
3. **QR Generator Component** (`src/components/QRMenu.tsx`): Generates SVG/PNG QR codes bound to local LAN IP address (`http://192.168.x.x:3001/menu`) or custom domain.

---

## 🖨️ Printing Table & Stand QR Codes

Operators can customize and print table stand QR display cards directly from the app:
- **Card Customization**: Store name, tagline, table number, logo, accent colors.
- **Export Formats**: Thermal paper 80mm table tickets or full A4/Letter table stand cards.

---

## 🧪 Verification

Test QR Menu catalog payload builder:
```bash
npx vitest test/lib/digitalReceipt.test.ts
```

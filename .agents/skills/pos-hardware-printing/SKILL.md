---
name: pos-hardware-printing
description: Deep technical guide for ESC/POS raw thermal receipt binary generation, Web Serial API printing, network TCP sockets, hardware barcode scanner wedge, and customizable receipt templates in EA POS.
---

# EA POS — Hardware Integration & Thermal Printing

EA POS supports hardware receipt printing (Web Serial thermal printers, network raw TCP sockets, Electron native printers, browser print fallback) and hardware barcode scanner keyboard wedges.

## 📚 Detailed Sub-References

- **ESC/POS Command Table & Paper Specs**: [references/escpos-command-reference.md](references/escpos-command-reference.md)

---

## 🖨️ Thermal Receipt Printing Architecture

Print generation consists of two stages:
1. **ESC/POS Command Encoder** (`src/lib/escpos.ts`): Builds raw binary `Uint8Array` byte buffers containing ESC/POS commands (initialization, text alignment, font sizing, bold formatting, line feeds, paper cut commands).
2. **Hardware Dispatcher** (`src/lib/receiptPrinter.ts` & `src/lib/hardwarePrint.ts`): Routes binary byte buffers or HTML templates to target printers based on user preferences in `Settings.tsx`.

---

## 🔌 Connection Interfaces

1. **Web Serial API**: Connects directly to USB/Serial thermal printers via Web Serial in Chromium / Electron (`navigator.serial`).
2. **Network TCP Direct Socket**: Connects over LAN to thermal printers listening on raw TCP port 9100.
3. **Electron Main IPC**: Uses `ipcRenderer.invoke('print-receipt', rawData)` in desktop mode to bypass browser security restrictions.

---

## 📷 Barcode Scanner Wedge (`src/lib/useBarcodeScanner.ts`)

Hardware barcode scanners operate as high-speed keyboard wedge input devices.
- **Detection**: Listens for keydown events occurring at high speed (< 50ms inter-key delay).
- **Auto-Search**: Auto-searches product catalog by SKU and immediately adds matching items to active cart.

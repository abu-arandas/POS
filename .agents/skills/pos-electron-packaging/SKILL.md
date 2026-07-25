---
name: pos-electron-packaging
description: Complete packaging guide for Electron desktop builds, electron-builder NSIS installers, portable executable builds, IPC main/preload process communication, and Windows build troubleshooting.
---

# EA POS — Electron Packaging & Build Guide

EA POS packages into a standalone Windows desktop app using **Electron 43** and **`electron-builder`**.

## 📦 Build Commands

### 1. Development Mode (Electron + Vite Dev Server)
Spins up Vite dev server at `localhost:3000` and launches an Electron container attached to it:
```bash
npm run electron:dev
```

### 2. Windows Desktop Build (`.exe`)
Compiles React production assets to `dist/` and bundles inside NSIS installer executable:
```bash
npm run electron:build
```

### 3. Portable Single-File Executable
Generates a portable executable requiring no installation:
```bash
npm run portable
```

---

## 📂 Output Artifacts (`release/`)

- **NSIS Installer**: `release/EA POS Setup 1.0.0.exe` (User installation executable with Desktop & Start Menu shortcuts).
- **Unpacked Portable App**: `release/win-unpacked/EA POS.exe` (Direct executable for USB drives or restricted Windows machines).

---

## 🌉 IPC Preload Architecture (`electron/preload.cjs`)

Electron isolates web frontend context from Node.js capabilities. Communication uses secure `contextBridge`:

```javascript
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
  getPrinterList: () => ipcRenderer.invoke('get-printers'),
  openCashDrawer: () => ipcRenderer.invoke('open-drawer')
});
```

---

## 🛠️ Windows EPERM / Lock Troubleshooting

If `electron-builder` fails with `EPERM: operation not permitted, unlink release/...`:
1. Ensure no File Explorer window or terminal is open inside `release/` or `dist/`.
2. Close running instances of `EA POS.exe` in Task Manager (`taskkill /F /IM "EA POS.exe"`).

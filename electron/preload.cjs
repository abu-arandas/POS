const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, explicit API to the renderer instead of enabling full
// nodeIntegration. This keeps contextIsolation on so a compromised renderer
// (e.g. via a malicious image/logo URL) cannot reach Node.js/Electron internals.
contextBridge.exposeInMainWorld('electronAPI', {
  // Returns the machine's LAN IPv4 address and the actual port the embedded
  // QR digital-menu server bound to (it falls back past 3001 when taken).
  getMenuInfo: () => ipcRenderer.invoke('get-menu-info'),
  // Pushes the latest public catalog/settings snapshot to the embedded menu
  // server. The renderer sends only customer-safe fields (no cost/stock).
  updateMenuData: (data) => ipcRenderer.send('update-menu-data', data),
  // Streams a raw ESC/POS byte array to a network thermal printer over TCP.
  // Resolves true on success. { ip, port, data:number[] }.
  printEscpos: (payload) => ipcRenderer.invoke('print-escpos', payload),
  // Silently prints a receipt HTML document to a named OS printer (no dialog).
  // { html, deviceName? }.
  printHtml: (payload) => ipcRenderer.invoke('print-html', payload),
  // Streams raw ESC/POS bytes to a named local/USB Windows printer via the
  // spooler (RAW) — silent receipt + cash-drawer pulse. { printerName, data:number[] }.
  printRaw: (payload) => ipcRenderer.invoke('print-raw', payload),
  // Lists the OS printers visible to the app window (Printer settings screen).
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  // Scans the local /24 subnet for hosts with TCP 9100 open (network thermal
  // printers). Resolves an array of responding IP strings. { port?, timeoutMs? }.
  scanNetworkPrinters: (opts) => ipcRenderer.invoke('scan-network-printers', opts),
});

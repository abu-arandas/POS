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
  // Lists the OS-installed printers (name/displayName/isDefault/status) so the
  // renderer can offer a printer picker for the 'system' printer type.
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  // Silently prints an HTML document to a specific OS printer (or the default
  // when deviceName is empty). Resolves true on success. { html, deviceName }.
  printHtml: (payload) => ipcRenderer.invoke('print-html', payload),
});

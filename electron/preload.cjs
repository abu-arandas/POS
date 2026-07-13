const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, explicit API to the renderer instead of enabling full
// nodeIntegration. This keeps contextIsolation on so a compromised renderer
// (e.g. via a malicious image/logo URL) cannot reach Node.js/Electron internals.
contextBridge.exposeInMainWorld('electronAPI', {
  // Returns the machine's LAN IPv4 address for the QR digital-menu link.
  getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
  // Pushes the latest catalog/settings snapshot to the embedded menu server.
  updateMenuData: (data) => ipcRenderer.send('update-menu-data', data),
});

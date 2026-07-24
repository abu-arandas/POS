const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const os = require('os');
const net = require('net');

let menuData = { products: [], categories: [], settings: {} };

// Setup Express Server (serves the customer-facing QR digital menu).
// The renderer only ever sends customer-safe fields here (no cost/stock
// counts) — see App.tsx / preload.cjs.
const expressApp = express();
expressApp.use(cors());

expressApp.get('/api/menu', (req, res) => {
  res.json(menuData);
});

expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
});

// The port actually bound (null until the server is up). Starts at 3001 and
// walks forward when the port is taken — an unhandled 'listen' error would
// otherwise crash the whole app (EADDRINUSE is an async 'error' event).
let serverPort = null;

function startMenuServer(port, attemptsLeft) {
  const server = expressApp.listen(port, '0.0.0.0', () => {
    serverPort = port;
    console.log(`Menu Express server listening on port ${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} in use, trying ${port + 1}…`);
      startMenuServer(port + 1, attemptsLeft - 1);
    } else {
      console.error('Menu server failed to start:', err.message);
    }
  });
}

startMenuServer(3001, 10);

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over non-ipv4 and internal (i.e. 127.0.0.1) addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

ipcMain.handle('get-menu-info', () => {
  return { ip: getLocalIp(), port: serverPort ?? 3001 };
});

ipcMain.on('update-menu-data', (event, data) => {
  menuData = data;
});

// Lists the OS printers visible to this window (name, status, default flag)
// so the renderer's Printer settings screen can show what's connected.
ipcMain.handle('list-printers', async (event) => {
  try {
    const printers = await event.sender.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      status: p.status,
      isDefault: !!p.isDefault,
    }));
  } catch (err) {
    console.error('list-printers failed:', err.message);
    return [];
  }
});

// Probes one host:port for an open TCP socket, resolving true only on a clean
// connect within the timeout. Used by the subnet printer scan below.
function probeTcp(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.connect(port, ip, () => done(true));
  });
}

// Scans the terminal's own /24 subnet for hosts with TCP 9100 (RAW/JetDirect)
// open — the port network thermal printers listen on. Returns the responding
// IPs. Probes run in bounded-size batches so we never open 254 sockets at once.
ipcMain.handle('scan-network-printers', async (event, opts) => {
  const port = (opts && opts.port) || 9100;
  const timeoutMs = (opts && opts.timeoutMs) || 400;
  const base = getLocalIp();
  if (base === 'localhost') return [];
  const prefix = base.slice(0, base.lastIndexOf('.') + 1); // "192.168.1."
  const self = base.slice(base.lastIndexOf('.') + 1);
  const found = [];
  const BATCH = 32;
  for (let start = 1; start <= 254; start += BATCH) {
    const batch = [];
    for (let host = start; host < start + BATCH && host <= 254; host++) {
      if (String(host) === self) continue; // don't probe ourselves
      const ip = `${prefix}${host}`;
      batch.push(probeTcp(ip, port, timeoutMs).then((ok) => (ok ? ip : null)));
    }
    for (const ip of await Promise.all(batch)) {
      if (ip) found.push(ip);
    }
  }
  return found;
});

// Streams raw ESC/POS bytes to a network thermal printer (RAW/JetDirect on TCP
// 9100). Resolves true on a clean write, false on any socket error/timeout.
ipcMain.handle('print-escpos', (event, payload) => {
  const { ip, port = 9100, data } = payload || {};
  return new Promise((resolve) => {
    if (!ip || !Array.isArray(data)) {
      resolve(false);
      return;
    }
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(5000);
    socket.on('timeout', () => done(false));
    socket.on('error', (err) => {
      console.error('ESC/POS network print error:', err.message);
      done(false);
    });
    socket.connect(port, ip, () => {
      socket.write(Buffer.from(data), () => socket.end(() => done(true)));
    });
  });
});

// Silent print of a receipt HTML document to a named OS printer (or the default
// when deviceName is empty). Renders the doc in a hidden window and prints with
// no dialog — the operator is never prompted. Resolves true on success.
ipcMain.handle('print-html', async (event, payload) => {
  const { html, deviceName } = payload || {};
  if (typeof html !== 'string') return false;
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return await new Promise((resolve) => {
      win.webContents.print(
        {
          silent: true,
          deviceName: deviceName || undefined,
          printBackground: true,
          margins: { marginType: 'none' },
        },
        (success) => resolve(success),
      );
    });
  } catch (err) {
    console.error('print-html failed:', err.message);
    return false;
  } finally {
    if (!win.isDestroyed()) win.close();
  }
});

// PowerShell that streams RAW bytes straight to a Windows printer by name via
// the winspool spooler (RAW datatype) — bypassing the driver so ESC/POS
// (receipt text, barcode, and the cash-drawer pulse) reaches a USB thermal
// printer unmodified, silently, with no dialog. Windows-only.
const RAW_PRINT_PS1 = `param([Parameter(Mandatory=$true)][string]$PrinterName,[Parameter(Mandatory=$true)][string]$DataPath)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class EAPosRaw {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static bool Send(string printer, byte[] bytes) {
    IntPtr h;
    if(!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    var di = new DOCINFO(); di.pDocName = "EA POS"; di.pDataType = "RAW";
    bool ok = false;
    try {
      if(StartDocPrinter(h, 1, ref di)) {
        if(StartPagePrinter(h)) { int w; ok = WritePrinter(h, bytes, bytes.Length, out w); EndPagePrinter(h); }
        EndDocPrinter(h);
      }
    } finally { ClosePrinter(h); }
    return ok;
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($DataPath)
if([EAPosRaw]::Send($PrinterName, $bytes)) { exit 0 } else { exit 1 }`;

ipcMain.handle('print-raw', async (event, payload) => {
  const { printerName, data } = payload || {};
  if (process.platform !== 'win32') return false; // spooler RAW path is Windows-only
  if (!printerName || !Array.isArray(data) || data.length === 0) return false;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dataPath = path.join(os.tmpdir(), `eapos-${stamp}.bin`);
  const psPath = path.join(os.tmpdir(), `eapos-${stamp}.ps1`);
  try {
    fs.writeFileSync(dataPath, Buffer.from(data));
    fs.writeFileSync(psPath, RAW_PRINT_PS1, 'utf8');
    return await new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psPath,
          '-PrinterName', printerName, '-DataPath', dataPath],
        { windowsHide: true },
      );
      ps.on('error', () => resolve(false));
      ps.on('exit', (code) => resolve(code === 0));
    });
  } catch (err) {
    console.error('print-raw failed:', err.message);
    return false;
  } finally {
    try { fs.unlinkSync(dataPath); } catch { /* ignore */ }
    try { fs.unlinkSync(psPath); } catch { /* ignore */ }
  }
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'EA POS',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../buildResources/icon.png'), // dev icon; packaged app uses the exe's embedded icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Completely remove the default menu bar (File, Edit, View, etc.)
  mainWindow.setMenu(null);

  // Depending on whether we are in dev mode or prod mode, load the app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // In dev mode, connect to Vite server
    mainWindow.loadURL('http://localhost:3000');
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  } else {
    // In production mode, load the built HTML file
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

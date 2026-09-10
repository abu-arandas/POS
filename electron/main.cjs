const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const os = require('os');
const net = require('net');
const { fileURLToPath } = require('url');
const { hasPublisherName, resolveUpdatePolicy } = require('./updatePolicy.cjs');
const { selectLocalIp, pickListenHost, shouldRebindMenuServer } = require('./menuServer.cjs');
const {
  MAX_MENU_DATA_BYTES,
  isValidRawBytes,
  isValidPrinterPayload,
  isSafeMenuData,
  isPrivateIPv4,
} = require('./validation.cjs');

// Exactly one terminal process per machine. Two instances would fight over the
// menu server's port, and cleanupTempFiles() below deletes every eapos-*.bin at
// startup — including a sibling instance's in-flight print job. A CommonJS
// module body is function-wrapped, so this top-level return is legal and stops
// the second instance before it starts a server or touches the temp directory.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let menuData = { products: [], categories: [], settings: {} };

// Setup Express Server (serves the customer-facing QR digital menu).
// The renderer only ever sends customer-safe fields here (no cost/stock
// counts) — see App.tsx / preload.cjs.
const expressApp = express();

const menuRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

expressApp.use(menuRateLimiter);

expressApp.get('/api/menu', (req, res) => {
  res.json(menuData);
});

expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
});

// The port and address actually bound (null until the server is up). The port
// starts at 3001 and walks forward when it is taken — an unhandled 'listen'
// error would otherwise crash the whole app (EADDRINUSE is an async 'error'
// event).
let serverPort = null;
let boundHost = null;
let menuServer = null;

// Resolves once the server is either listening or definitively not coming up.
// listen() is asynchronous, so without something to await, get-menu-info called
// during startup — or during the port-retry walk, or the moment after a rebind
// — would report the fallback port while nothing was bound there yet, and the
// QR code would be generated for an endpoint that does not exist.
//
// It resolves rather than rejects on failure: the caller wants to know the
// attempt is over, and `running` in the reply already says how it ended.
function startMenuServer(port, attemptsLeft) {
  return new Promise((resolve) => {
    const host = getLocalIp();
    const server = expressApp.listen(port, pickListenHost(host), () => {
      menuServer = server;
      serverPort = port;
      boundHost = host;
      console.log(`Menu Express server listening on ${host}:${port}`);
      resolve();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.warn(`Port ${port} in use, trying ${port + 1}…`);
        startMenuServer(port + 1, attemptsLeft - 1).then(resolve);
        return;
      }
      menuServer = null;
      serverPort = null;
      boundHost = null;
      console.error('Menu server failed to start:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send(
          'menu-server-error',
          'Menu server failed to start: ' + err.message,
        );
      }
      resolve();
    });
  });
}

let menuServerReady = startMenuServer(3001, 10);

function getLocalIp() {
  return selectLocalIp(os.networkInterfaces());
}

// The bound address and the advertised one must not drift apart. A DHCP renewal
// or a move from wifi to ethernet leaves the server listening on an address the
// machine no longer has, while the QR code is drawn from the current one — so
// the code resolves to nowhere and the menu silently stops working. Checked
// whenever the renderer asks for the menu address, which is exactly when a QR
// code is about to be produced.
function ensureMenuServerAddress() {
  const currentHost = getLocalIp();
  if (!shouldRebindMenuServer({ boundHost, currentHost })) return;

  console.log(`Menu server address changed (${boundHost} -> ${currentHost}); rebinding.`);
  const previous = menuServer;
  menuServer = null;
  boundHost = null;
  serverPort = null;
  if (previous) previous.close();
  menuServerReady = startMenuServer(3001, 10);
}

ipcMain.handle('get-menu-info', async () => {
  ensureMenuServerAddress();
  // Wait for the bind to settle before answering. A QR code is about to be
  // drawn from this reply, and reporting a provisional address during startup,
  // a port-retry walk, or the instant after a rebind produces a code for an
  // endpoint nothing is serving yet.
  await menuServerReady;
  // `running` then distinguishes "listening" from "gave up" — the previous
  // `serverPort ?? 3001` reported the default port either way, so a server that
  // failed to bind still produced a confident QR code.
  return {
    ip: boundHost ?? getLocalIp(),
    port: serverPort ?? 3001,
    running: serverPort !== null,
  };
});

ipcMain.on('update-menu-data', (event, data) => {
  // Validate the structured-clone payload before serialization. This bounds the
  // number and size of values the privileged main process will inspect and keeps
  // the menu endpoint limited to its documented customer-safe shape.
  if (!isSafeMenuData(data)) {
    console.error('Invalid menu data payload. Update rejected.');
    return;
  }
  try {
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_MENU_DATA_BYTES) {
      console.error('Menu data payload too large. Update rejected.');
      return;
    }
    menuData = data;
  } catch (err) {
    console.error('Failed to serialize menu data:', err);
  }
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
  // Printer discovery is deliberately restricted to the terminal's private
  // IPv4 /24 and the only supported raw-printer port. Never turn this IPC bridge
  // into a general-purpose network scanner.
  const port = 9100;
  const requestedTimeout = Number(opts && opts.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(2_000, Math.max(100, requestedTimeout))
    : 400;
  const base = getLocalIp();
  if (!isPrivateIPv4(base)) return [];
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
  if (!isValidPrinterPayload(payload)) return false;
  const { ip, port, data } = payload;
  return new Promise((resolve) => {
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
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_MENU_DATA_BYTES)
    return false;
  if (deviceName !== undefined && (typeof deviceName !== 'string' || deviceName.length > 256))
    return false;
  // The receipt HTML is assembled from operator-entered data (store name, item
  // names, footer text). It renders in a throwaway window with no preload, no
  // Node, and sandboxed — so even if something slipped past the escaping in
  // src/lib/receiptPrinter.ts it has nothing to reach for.
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: false,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false, // a receipt is static markup; it never needs script
    },
  });
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
//
// This is the preamble only; print-raw appends the two call lines and hands the
// whole thing to PowerShell via -EncodedCommand (see there for why it is not
// written to disk).
const RAW_PRINT_PS1 = `$ErrorActionPreference = 'Stop'
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
"@`;

ipcMain.handle('print-raw', async (event, payload) => {
  const { printerName, data } = payload || {};
  if (process.platform !== 'win32') return false; // spooler RAW path is Windows-only
  if (typeof printerName !== 'string' || printerName.length === 0 || printerName.length > 256)
    return false;
  if (!isValidRawBytes(data)) return false;

  // The script is handed to PowerShell as -EncodedCommand rather than written to
  // a .ps1 in the temp directory and executed by path. The packaged application
  // runs asInvoker, so anything that could win the race between writing that file
  // and spawning it would still be unsafe code execution. There is no longer a
  // script file to swap. The printer name
  // and the byte payload are embedded as PowerShell literals below, so nothing
  // reaches a command line where argument parsing could reinterpret it.
  //
  // The receipt bytes still need a file (WritePrinter takes a byte[] and a
  // multi-kilobyte base64 literal in a command line is fragile), but that file
  // is only ever *read* — swapping it changes what gets printed, not what runs.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dataPath = path.join(os.tmpdir(), `eapos-${stamp}.bin`);
  try {
    fs.writeFileSync(dataPath, Buffer.from(data));
    // Single-quoted PowerShell literals: the only escape needed is '' for '.
    const psLiteral = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const script =
      `${RAW_PRINT_PS1}\n` +
      `$bytes = [System.IO.File]::ReadAllBytes(${psLiteral(dataPath)})\n` +
      `if([EAPosRaw]::Send(${psLiteral(printerName)}, $bytes)) { exit 0 } else { exit 1 }`;
    // -EncodedCommand takes UTF-16LE base64.
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return await new Promise((resolve) => {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { windowsHide: true },
      );
      ps.on('error', () => resolve(false));
      ps.on('exit', (code) => resolve(code === 0));
    });
  } catch (err) {
    console.error('print-raw failed:', err.message);
    return false;
  } finally {
    try {
      fs.unlinkSync(dataPath);
    } catch {
      /* ignore */
    }
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

function cleanupTempFiles() {
  try {
    const tmpdir = os.tmpdir();
    const files = fs.readdirSync(tmpdir);
    for (const file of files) {
      if (/^eapos-.*\.(bin|ps1)$/.test(file)) {
        try {
          fs.unlinkSync(path.join(tmpdir, file));
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.error('Failed to clean up temp files:', err);
  }
}

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  console.log('electron-updater not available in dev mode');
}

// Reads the publisher name out of the packaged app-update.yml — the only thing
// that makes electron-updater actually verify an update's signature.
function updateSignatureVerified() {
  try {
    const ymlPath = path.join(process.resourcesPath, 'app-update.yml');
    return hasPublisherName(fs.readFileSync(ymlPath, 'utf8'));
  } catch {
    return false; // unreadable/absent config => assume unverified
  }
}

let updatePolicy = { enabled: false, installSilently: false, reason: 'not-initialized' };

function setupAutoUpdater() {
  if (!autoUpdater) return;

  updatePolicy = resolveUpdatePolicy({
    signatureVerified: updateSignatureVerified(),
    isPackaged: app.isPackaged,
  });
  autoUpdater.autoDownload = updatePolicy.autoDownload;
  autoUpdater.autoInstallOnAppQuit = updatePolicy.autoInstallOnAppQuit;

  if (updatePolicy.reason === 'unverified-no-publisher-name') {
    console.warn(
      'AutoUpdater: no publisherName in app-update.yml, so downloaded updates ' +
        'are NOT signature-verified. Automatic installation is disabled, which ' +
        'is what an unsigned build gets. Sign the build to restore unattended ' +
        'updates.',
    );
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('AutoUpdater: Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('AutoUpdater: Update available:', info?.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('AutoUpdater: Update downloaded:', info?.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
    }
    // Only install unattended when the artifact's signature was actually
    // checked. Without that, silently running a downloaded installer as
    // administrator means trusting whoever served the file.
    if (updatePolicy.installSilently) {
      autoUpdater.quitAndInstall(false, true);
    } else {
      console.warn(
        'AutoUpdater: update staged but not installed (unverified build). ' +
          'It will be applied when an operator confirms.',
      );
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater Error:', err?.message);
  });

  // Perform initial check on startup
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Initial update check failed:', err?.message);
    });
  }

  // Schedule daily check every 24 hours
  const DAILY_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Daily update check failed:', err?.message);
      });
    }
  }, DAILY_MS);
}

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater || !app.isPackaged) return { status: 'dev' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: 'ok',
      version: result?.updateInfo?.version,
      // So the UI can tell the operator whether an update will apply on its own
      // or is waiting on them (see resolveUpdatePolicy).
      policy: updatePolicy.reason,
      installSilently: updatePolicy.installSilently,
    };
  } catch (err) {
    return { status: 'error', error: err?.message };
  }
});

// Applies an already-downloaded update on the operator's say-so. This is the
// path for unsigned builds, where unattended installation is refused: a person
// is choosing to trust the artifact.
ipcMain.handle('install-update', () => {
  if (!autoUpdater || !app.isPackaged) return false;
  try {
    autoUpdater.quitAndInstall(false, true);
    return true;
  } catch (err) {
    console.error('install-update failed:', err?.message);
    return false;
  }
});

// Navigation lockdown. The renderer shows operator-supplied content (a store
// logo URL, product image URLs, receipt text), so a stray or hostile link must
// never be able to steer the app window somewhere else or spawn a second window
// that inherits the preload bridge. In-app navigation stays allowed; anything
// else is handed to the real browser, outside Electron.
const ALLOWED_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

// The app's own directory — in a packaged build this is inside app.asar, which
// holds dist/ and electron/. Anything outside it is not our renderer.
const APP_ROOT = path.resolve(__dirname, '..');

function isInternal(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      // Only the packaged renderer under APP_ROOT — not "any file: URL". The
      // blanket allow meant a navigation to file:///etc/passwd (or a UNC path
      // on Windows, which would also hit the network) was treated as in-app.
      // path.relative escaping upward means it is somewhere else on disk.
      let filePath;
      try {
        filePath = fileURLToPath(url);
      } catch {
        return false; // not a well-formed local file URL (e.g. a UNC host)
      }
      const rel = path.relative(APP_ROOT, filePath);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    }
    return ALLOWED_ORIGINS.has(url.origin); // the Vite dev server
  } catch {
    return false;
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    // The app opens blank windows it then writes print documents into — the
    // product-label sheet (lib/productLabels), the Z-report (ShiftScreen), and
    // the browser-fallback receipt path (lib/receiptPrinter). Allowed, but
    // stripped of the preload bridge and sandboxed: a print window renders
    // operator-entered text and never needs electronAPI.
    //
    // Verified against Electron 43 that this override keeps the opener's
    // document.write working, along with the inline `onload="window.print()"`
    // the print documents rely on — sandbox disables Node integration, not
    // scripting or same-origin access.
    if (url === '' || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            preload: undefined,
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    if (isInternal(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Never hand out camera/mic/geolocation etc. to renderer content.
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Someone launched the app again (desktop shortcut, another double-click).
// Surface the window we already have instead of starting a second terminal.
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('ready', () => {
  cleanupTempFiles();
  createWindow();
  setupAutoUpdater();
});

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

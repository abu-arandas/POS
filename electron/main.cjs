const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const os = require('os');

let menuData = { products: [], categories: [], settings: {} };

// Setup Express Server
const expressApp = express();
expressApp.use(cors());

expressApp.get('/api/menu', (req, res) => {
  res.json(menuData);
});

expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
});

// Use 3001 or fallback to another port if needed
let serverPort = 3001;
expressApp.listen(serverPort, '0.0.0.0', () => {
  console.log(`Menu Express server listening on port ${serverPort}`);
});

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

ipcMain.handle('get-local-ip', () => {
  return getLocalIp();
});

ipcMain.on('update-menu-data', (event, data) => {
  menuData = data;
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "EA POS",
    icon: path.join(__dirname, 'icon.ico'), // Ensure you have an icon, or this is ignored
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity in this local POS app
    }
  });

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

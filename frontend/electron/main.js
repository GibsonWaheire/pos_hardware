/**
 * Electron main process — wraps the React frontend in a kiosk-capable window.
 *
 * Development: loads from Vite dev server (http://localhost:5173)
 * Production:  loads from built dist/index.html
 *
 * Run with:  npm run electron:dev
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV !== 'production'
const VITE_DEV_URL = 'http://localhost:5173'

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    fullscreen: !isDev,           // Kiosk fullscreen in production
    autoHideMenuBar: !isDev,
    backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'POS Hardware',
  })

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  // Remove default menu in production
  if (!isDev) Menu.setApplicationMenu(null)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// IPC: allow renderer to request kiosk toggle
ipcMain.on('toggle-kiosk', () => {
  if (mainWindow) {
    mainWindow.setKiosk(!mainWindow.isKiosk())
  }
})

// IPC: allow renderer to check if running in Electron
ipcMain.handle('is-electron', () => true)

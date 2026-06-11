/**
 * Electron preload script — exposes a safe bridge to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: () => ipcRenderer.invoke('is-electron'),
  toggleKiosk: () => ipcRenderer.send('toggle-kiosk'),
})

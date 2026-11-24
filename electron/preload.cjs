// Exposes the offline engine to the page as window.kjxOffline (only in the desktop app).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kjxOffline', {
  status: () => ipcRenderer.invoke('offline:status'),
  has: (urls) => ipcRenderer.invoke('offline:has', urls),
  startPack: () => ipcRenderer.invoke('offline:startPack'),
  pausePack: () => ipcRenderer.invoke('offline:pausePack'),
  clearCache: () => ipcRenderer.invoke('offline:clearCache'),
  estimateArea: (bbox) => ipcRenderer.invoke('offline:estimateArea', bbox),
  downloadArea: (bbox) => ipcRenderer.invoke('offline:downloadArea', bbox),
  cancelArea: () => ipcRenderer.invoke('offline:cancelArea'),
  onUpdate: (fn) => ipcRenderer.on('offline:update', (_e, s) => fn(s)),
});

// Window chrome: show/hide the macOS traffic lights with the top bar; tell the page about fullscreen.
contextBridge.exposeInMainWorld('kjxApp', {
  onTopBar: (fn) => ipcRenderer.on('ui:topbar-state', (_e, v) => fn(v)),
  onFullscreen: (fn) => ipcRenderer.on('ui:fullscreen', (_e, v) => fn(v)),
  isFullscreen: () => ipcRenderer.invoke('ui:isFullscreen'),
});

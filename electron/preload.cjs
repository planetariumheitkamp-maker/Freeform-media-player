const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freeform', {
  isDesktop: true,
  platform: process.platform,
  openLocalFiles: () => ipcRenderer.invoke('media:open'),
  authorizeMedia: (paths) => ipcRenderer.invoke('media:authorize', paths),
  listDesktopSources: () => ipcRenderer.invoke('desktop:sources'),
  prepareDesktopCapture: (id, withAudio) => ipcRenderer.invoke('desktop:prepare', id, withAudio),
  saveProject: (defaultName, content) => ipcRenderer.invoke('project:save', defaultName, content),
  openProject: () => ipcRenderer.invoke('project:open'),
  setFullscreen: (value) => ipcRenderer.invoke('window:fullscreen', value),
});

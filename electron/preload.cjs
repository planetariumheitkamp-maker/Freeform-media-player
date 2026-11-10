const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freeform', {
  isDesktop: true,
  platform: process.platform,
  openLocalFiles: () => ipcRenderer.invoke('media:open'),
  openBackgroundImage: () => ipcRenderer.invoke('media:open-background'),
  authorizeMedia: (paths) => ipcRenderer.invoke('media:authorize', paths),
  listDesktopSources: () => ipcRenderer.invoke('desktop:sources'),
  prepareDesktopCapture: (id, withAudio) => ipcRenderer.invoke('desktop:prepare', id, withAudio),
  openProviderCapture: (input) => ipcRenderer.invoke('provider:open', input),
  setProviderAdBlockSettings: (settings) => ipcRenderer.invoke('provider:set-ad-block', settings),
  prepareProviderCapture: (id, withAudio) => ipcRenderer.invoke('provider:prepare', id, withAudio),
  closeProviderCapture: (id) => ipcRenderer.invoke('provider:close', id),
  onProviderCaptureState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('provider:capture-state', listener);
    return () => ipcRenderer.removeListener('provider:capture-state', listener);
  },
  verifyCustomSource: (input) => ipcRenderer.invoke('custom:verify', input),
  getRecordingState: () => ipcRenderer.invoke('recording:state'),
  chooseRecordingDirectory: () => ipcRenderer.invoke('recording:choose-directory'),
  startRecording: (input) => ipcRenderer.invoke('recording:start', input),
  appendRecording: (id, chunk) => ipcRenderer.invoke('recording:append', id, chunk),
  finishRecording: (id) => ipcRenderer.invoke('recording:finish', id),
  discardRecording: (id) => ipcRenderer.invoke('recording:discard', id),
  listRecordings: () => ipcRenderer.invoke('recording:list'),
  openRecording: (name) => ipcRenderer.invoke('recording:open', name),
  showRecordingFolder: () => ipcRenderer.invoke('recording:show-folder'),
  saveProject: (defaultName, content) => ipcRenderer.invoke('project:save', defaultName, content),
  openProject: () => ipcRenderer.invoke('project:open'),
  setFullscreen: (value) => ipcRenderer.invoke('window:fullscreen', value),
  getWindowPlacement: () => ipcRenderer.invoke('window:get-placement'),
  setWindowPlacement: (placement) => ipcRenderer.invoke('window:set-placement', placement),
  setWindowLocked: (value) => ipcRenderer.invoke('window:set-locked', value),
  setTransparency: (value) => ipcRenderer.invoke('window:transparency', value),
  beginWindowResize: (direction, cursor) => ipcRenderer.invoke('window:begin-resize', direction, cursor),
  updateWindowResize: (cursor) => ipcRenderer.invoke('window:update-resize', cursor),
  endWindowResize: () => ipcRenderer.invoke('window:end-resize'),
});

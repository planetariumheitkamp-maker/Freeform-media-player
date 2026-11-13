const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freeform', {
  isDesktop: true,
  platform: process.platform,
  openLocalFiles: () => ipcRenderer.invoke('media:open'),
  openBackgroundImage: () => ipcRenderer.invoke('media:open-background'),
  authorizeMedia: (paths) => ipcRenderer.invoke('media:authorize', paths),
  listDesktopSources: () => ipcRenderer.invoke('desktop:sources'),
  prepareDesktopCapture: (id, withAudio) => ipcRenderer.invoke('desktop:prepare', id, withAudio),
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
  openPresentation: (project) => ipcRenderer.invoke('presentation:open', project),
  closePresentation: () => ipcRenderer.invoke('presentation:close'),
  getPresentationProject: () => ipcRenderer.invoke('presentation:get-project'),
  syncPresentation: (project) => ipcRenderer.invoke('presentation:sync', project),
  onPresentationProject: (callback) => {
    const listener = (_event, project) => callback(project);
    ipcRenderer.on('presentation:project', listener);
    return () => ipcRenderer.removeListener('presentation:project', listener);
  },
  syncPresentationMedia: (states) => ipcRenderer.invoke('presentation:media-sync', states),
  onPresentationMedia: (callback) => {
    const listener = (_event, states) => callback(states);
    ipcRenderer.on('presentation:media', listener);
    return () => ipcRenderer.removeListener('presentation:media', listener);
  },
  onPresentationClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('presentation:closed', listener);
    return () => ipcRenderer.removeListener('presentation:closed', listener);
  },
  setFullscreen: (value) => ipcRenderer.invoke('window:fullscreen', value),
  getWindowPlacement: () => ipcRenderer.invoke('window:get-placement'),
  setWindowPlacement: (placement) => ipcRenderer.invoke('window:set-placement', placement),
  setWindowLocked: (value) => ipcRenderer.invoke('window:set-locked', value),
  setTransparency: (value) => ipcRenderer.invoke('window:transparency', value),
  beginWindowResize: (direction, cursor) => ipcRenderer.invoke('window:begin-resize', direction, cursor),
  updateWindowResize: (cursor) => ipcRenderer.invoke('window:update-resize', cursor),
  endWindowResize: () => ipcRenderer.invoke('window:end-resize'),
  beginWindowMove: (cursor) => ipcRenderer.invoke('window:begin-move', cursor),
  updateWindowMove: (cursor) => ipcRenderer.invoke('window:update-move', cursor),
  endWindowMove: () => ipcRenderer.invoke('window:end-move'),
});

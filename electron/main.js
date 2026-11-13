import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  systemPreferences,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canUseMainWindowCapture } from './capturePermissions.js';
import { isMainWindowFrame } from './windowSecurity.js';
import { createRecordingController } from './recordings.js';
import { moveWindowBounds, resizeWindowBounds, resolveWindowPlacement, selectNormalWindowBounds, WINDOW_RESIZE_DIRECTIONS } from './presentationWindow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const allowedMediaPaths = new Set();
const MAIN_WINDOW_MINIMUM_SIZE = [1080, 700];
const PRESENT_WINDOW_MINIMUM_SIZE = [320, 240];
let mainWindow;
let presentationWindow;
let presentationProject = null;
const pendingDesktopRequests = new Map();
let presentationWindowLocked = false;
let presentationWindowFullscreen = false;
let applyingWindowPlacement = false;
let presentationNormalPlacement = null;
let windowResizeSession = null;
let windowMoveSession = null;

function finishWindowResize() {
  windowResizeSession = null;
}

function finishWindowMove() {
  windowMoveSession = null;
}

function leaveWindowFullscreen(window) {
  if (!presentationWindowFullscreen && !window.isFullScreen()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.removeListener('leave-full-screen', finish);
      window.removeListener('closed', finish);
      resolve();
    };
    window.once('leave-full-screen', finish);
    window.once('closed', finish);
    window.setFullScreen(false);
  });
}

function sameWindowBounds(first, second) {
  return ['x', 'y', 'width', 'height'].every((key) => first?.[key] === second?.[key]);
}

async function restoreNormalWindow(window, savedPlacement = presentationNormalPlacement) {
  const placement = selectNormalWindowBounds(savedPlacement);
  const isNormal = () => !window.isDestroyed() && !window.isMaximized()
    && (!placement || sameWindowBounds(window.getBounds(), placement));
  // Transparent Windows windows may not emit unmaximize. Poll the real native
  // state for at most five seconds instead of trusting that event or a stale flag.
  for (let attempt = 0; attempt < 20 && !window.isDestroyed(); attempt += 1) {
    if (isNormal()) return true;
    applyingWindowPlacement = true;
    try {
      // Unlocking can leave native size limits behind. Electron also reuses
      // its transparent-window restore rectangle for maximize and fullscreen,
      // so explicitly restore Freeform's independently saved normal placement.
      window.setMaximumSize(0, 0);
      window.unmaximize();
      if (placement) window.setBounds(placement);
    } finally {
      applyingWindowPlacement = false;
    }
    if (isNormal()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return isNormal();
}

function getPresentationWindowPlacement() {
  if (!presentationWindow) return null;
  const bounds = selectNormalWindowBounds(
    presentationNormalPlacement,
    presentationWindow.getNormalBounds(),
    presentationWindow.getBounds(),
  );
  if (!bounds) return null;
  const display = screen.getDisplayMatching(bounds);
  return { ...bounds, displayId: String(display.id) };
}

function canControlPresentation(frame) {
  return Boolean(presentationWindow && (
    isMainWindowFrame(frame, mainWindow) || isMainWindowFrame(frame, presentationWindow)
  ));
}

function sendToPresentation(channel, payload) {
  if (!presentationWindow || presentationWindow.isDestroyed() || presentationWindow.webContents.isDestroyed()) return;
  presentationWindow.webContents.send(channel, payload);
}

const recordings = createRecordingController({ getMainWindow: () => mainWindow, describeFile });

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'freeform-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const extensionTypes = new Map([
  ['.mp4', ['video', 'video/mp4']],
  ['.m4v', ['video', 'video/mp4']],
  ['.webm', ['video', 'video/webm']],
  ['.ogv', ['video', 'video/ogg']],
  ['.mov', ['video', 'video/quicktime']],
  ['.mp3', ['audio', 'audio/mpeg']],
  ['.wav', ['audio', 'audio/wav']],
  ['.m4a', ['audio', 'audio/mp4']],
  ['.aac', ['audio', 'audio/aac']],
  ['.ogg', ['audio', 'audio/ogg']],
  ['.flac', ['audio', 'audio/flac']],
  ['.png', ['image', 'image/png']],
  ['.jpg', ['image', 'image/jpeg']],
  ['.jpeg', ['image', 'image/jpeg']],
  ['.webp', ['image', 'image/webp']],
  ['.gif', ['image', 'image/gif']],
]);

function describeFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const [mediaType = 'video', mime] = extensionTypes.get(extension) ?? [];
  allowedMediaPaths.add(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    url: `freeform-media://local/${encodeURIComponent(filePath)}`,
    mediaType,
    mime,
  };
}

function isTrustedMainFrame(frame) {
  return isMainWindowFrame(frame, mainWindow) || isMainWindowFrame(frame, presentationWindow);
}

function registerProjectHandlers() {
  ipcMain.handle('media:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add media files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Media',
          extensions: [...new Set([...extensionTypes.keys()].map((value) => value.slice(1)))],
        },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths.map(describeFile);
  });

  ipcMain.handle('media:open-background', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import a custom grid',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    return result.canceled || !result.filePaths[0] ? null : describeFile(result.filePaths[0]);
  });

  ipcMain.handle('media:authorize', async (_event, paths) => {
    const urls = {};
    if (!Array.isArray(paths)) return urls;
    for (const filePath of paths) {
      if (typeof filePath !== 'string') continue;
      try {
        await fs.access(filePath);
        urls[filePath] = describeFile(filePath).url;
      } catch {
        // Missing or unavailable files remain disconnected in the workspace.
      }
    }
    return urls;
  });

  ipcMain.handle('project:save', async (_event, defaultName, content) => {
    const safeName = String(defaultName || 'Freeform workspace').replace(/[\\/:*?"<>|]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save workspace',
      defaultPath: path.join(app.getPath('documents'), `${safeName}.freeform.json`),
      filters: [{ name: 'Freeform workspace', extensions: ['freeform.json', 'json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, content, 'utf8');
    return { canceled: false, path: result.filePath };
  });

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open workspace',
      properties: ['openFile'],
      filters: [{ name: 'Freeform workspace', extensions: ['freeform.json', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    return { canceled: false, path: filePath, content };
  });

  ipcMain.handle('presentation:open', async (event, project) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow)) throw new Error('Only the Freeform editor can open Present.');
    if (typeof project !== 'string') throw new Error('A workspace snapshot is required.');
    presentationProject = project;
    if (!presentationWindow) await createPresentationWindow();
    presentationWindow?.show();
    mainWindow?.focus();
  });

  ipcMain.handle('presentation:close', (event) => {
    if (!canControlPresentation(event.senderFrame)) throw new Error('Only Freeform can close Present.');
    presentationWindow?.close();
  });

  ipcMain.handle('presentation:get-project', (event) => {
    if (!isMainWindowFrame(event.senderFrame, presentationWindow)) return null;
    return presentationProject;
  });

  ipcMain.handle('presentation:sync', (event, project) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow) || typeof project !== 'string') return;
    presentationProject = project;
    sendToPresentation('presentation:project', project);
  });

  ipcMain.handle('presentation:media-sync', (event, states) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow) || !Array.isArray(states)) return;
    sendToPresentation('presentation:media', states);
  });

  ipcMain.handle('window:fullscreen', async (event, value) => {
    if (!canControlPresentation(event.senderFrame)) throw new Error('Only Freeform can change the output window.');
    const output = presentationWindow;
    finishWindowResize();
    finishWindowMove();
    if (value) {
      // Keep valid normal output bounds independently of the fullscreen transition.
      presentationNormalPlacement = getPresentationWindowPlacement();
      output.setFullScreen(true);
    } else {
      await leaveWindowFullscreen(output);
      if (presentationWindow !== output || output.isDestroyed()) return;
      await restoreNormalWindow(output);
      presentationNormalPlacement = null;
    }
  });

  ipcMain.handle('window:get-placement', (event) => {
    if (!canControlPresentation(event.senderFrame)) return null;
    return getPresentationWindowPlacement();
  });

  ipcMain.handle('window:set-placement', async (event, input) => {
    if (!canControlPresentation(event.senderFrame)) return null;
    const output = presentationWindow;
    finishWindowMove();
    const placement = resolveWindowPlacement(
      input,
      screen.getAllDisplays(),
      output.getNormalBounds(),
      PRESENT_WINDOW_MINIMUM_SIZE,
    );
    if (!placement) return null;
    await leaveWindowFullscreen(output);
    if (presentationWindow !== output || output.isDestroyed()) return null;
    await restoreNormalWindow(output);
    applyingWindowPlacement = true;
    try {
      // Unlocking cannot clear this transparent window's native size limits.
      output.setMaximumSize(0, 0);
      output.setBounds(placement);
    } finally {
      applyingWindowPlacement = false;
    }
    presentationNormalPlacement = { ...placement };
    return { ...output.getNormalBounds(), displayId: placement.displayId };
  });

  ipcMain.handle('window:set-locked', (event, value) => {
    if (!canControlPresentation(event.senderFrame)) throw new Error('Only Freeform can lock the output window.');
    presentationWindowLocked = Boolean(value);
    if (presentationWindowLocked) {
      finishWindowResize();
      finishWindowMove();
    }
    presentationWindow?.setMovable(!presentationWindowLocked);
    presentationWindow?.setResizable(!presentationWindowLocked);
  });

  ipcMain.handle('window:begin-resize', (event, direction, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, presentationWindow)) return false;
    if (presentationWindowLocked || !WINDOW_RESIZE_DIRECTIONS.has(direction)
      || (presentationWindowFullscreen || presentationWindow.isFullScreen()) || presentationWindow.isMaximized()) return false;
    finishWindowMove();
    const nativeCursor = screen.getCursorScreenPoint();
    windowResizeSession = {
      direction,
      bounds: presentationWindow.getBounds(),
      cursor: {
        x: Number.isFinite(cursor?.x) ? cursor.x : nativeCursor.x,
        y: Number.isFinite(cursor?.y) ? cursor.y : nativeCursor.y,
      },
    };
    return true;
  });

  ipcMain.handle('window:update-resize', (event, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, presentationWindow) || !windowResizeSession) return null;
    if (presentationWindowLocked || !Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return null;
    const session = windowResizeSession;
    const bounds = resizeWindowBounds(
      session.bounds,
      { x: cursor.x - session.cursor.x, y: cursor.y - session.cursor.y },
      session.direction,
      PRESENT_WINDOW_MINIMUM_SIZE,
    );
    // Windows constrains programmatic sizing while this transparent window is
    // natively non-resizable. Release that constraint for this trusted IPC update.
    presentationWindow.setMaximumSize(0, 0);
    presentationWindow.setBounds(bounds);
    return { ...presentationWindow.getBounds(), displayId: String(screen.getDisplayMatching(presentationWindow.getBounds()).id) };
  });

  ipcMain.handle('window:end-resize', (event) => {
    if (isMainWindowFrame(event.senderFrame, presentationWindow)) finishWindowResize();
  });

  ipcMain.handle('window:begin-move', async (event, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, presentationWindow) || presentationWindowLocked) return false;
    const output = presentationWindow;
    finishWindowResize();
    finishWindowMove();
    const normalPlacement = getPresentationWindowPlacement();
    if (presentationWindowFullscreen || output.isFullScreen()) await leaveWindowFullscreen(output);
    if (presentationWindow !== output || output.isDestroyed() || presentationWindowLocked) return false;
    if (!(await restoreNormalWindow(output, normalPlacement))) return false;
    if (presentationWindow !== output || output.isDestroyed() || presentationWindowLocked) return false;
    presentationNormalPlacement = null;
    const nativeCursor = screen.getCursorScreenPoint();
    windowMoveSession = {
      bounds: output.getNormalBounds(),
      cursor: {
        x: Number.isFinite(cursor?.x) ? cursor.x : nativeCursor.x,
        y: Number.isFinite(cursor?.y) ? cursor.y : nativeCursor.y,
      },
    };
    return true;
  });

  ipcMain.handle('window:update-move', (event, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, presentationWindow) || !windowMoveSession) return null;
    if (presentationWindowLocked || !Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return null;
    if ((presentationWindowFullscreen || presentationWindow.isFullScreen()) || presentationWindow.isMaximized()) {
      finishWindowMove();
      return null;
    }
    const session = windowMoveSession;
    const cursorDelta = { x: cursor.x - session.cursor.x, y: cursor.y - session.cursor.y };
    const requested = moveWindowBounds(session.bounds, cursorDelta);
    const scaleFactor = screen.getDisplayMatching(requested).scaleFactor;
    const bounds = moveWindowBounds(session.bounds, cursorDelta, scaleFactor);
    presentationWindow.setPosition(bounds.x, bounds.y);
    const current = presentationWindow.getBounds();
    return { ...current, displayId: String(screen.getDisplayMatching(current).id) };
  });

  ipcMain.handle('window:end-move', (event) => {
    if (isMainWindowFrame(event.senderFrame, presentationWindow)) finishWindowMove();
  });

  ipcMain.handle('window:transparency', (event, value) => {
    if (!canControlPresentation(event.senderFrame)) throw new Error('Only Freeform can change output transparency.');
    presentationWindow?.setBackgroundColor(value ? '#00000000' : '#1f1f1f');
  });
}

function registerCaptureHandlers() {
  ipcMain.handle('desktop:sources', async (event) => {
    if (!isTrustedMainFrame(event.senderFrame)) return [];
    const excludedTitles = [mainWindow, presentationWindow]
      .filter((window) => window && !window.isDestroyed())
      .map((window) => window.getTitle());
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 360, height: 220 },
      fetchWindowIcons: true,
    });
    return sources
      .filter((source) => !excludedTitles.includes(source.name))
      .map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon?.toDataURL(),
        displayId: source.display_id,
      }));
  });

  ipcMain.handle('desktop:permission', () => ({
    platform: process.platform,
    status: process.platform === 'darwin'
      ? systemPreferences.getMediaAccessStatus('screen')
      : 'not-required',
  }));

  ipcMain.handle('desktop:prepare', (event, id, withAudio) => {
    if (!isTrustedMainFrame(event.senderFrame)) throw new Error('Only Freeform can prepare desktop capture.');
    if (typeof id !== 'string' || !id) throw new Error('A desktop source is required.');
    pendingDesktopRequests.set(event.senderFrame.frameTreeNodeId, { id, withAudio: Boolean(withAudio) });
  });
  ipcMain.handle('recording:state', (event) => recordings.getState(event));
  ipcMain.handle('recording:choose-directory', (event) => recordings.chooseDirectory(event));
  ipcMain.handle('recording:start', (event, input) => recordings.start(event, input));
  ipcMain.handle('recording:append', (event, id, chunk) => recordings.append(event, id, chunk));
  ipcMain.handle('recording:finish', (event, id) => recordings.finish(event, id));
  ipcMain.handle('recording:discard', (event, id) => recordings.discard(event, id));
  ipcMain.handle('recording:list', (event) => recordings.list(event));
  ipcMain.handle('recording:open', (event, name) => recordings.open(event, name));
  ipcMain.handle('recording:show-folder', (event) => recordings.showFolder(event));

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(canUseMainWindowCapture(webContents, [mainWindow, presentationWindow], permission, details));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    return canUseMainWindowCapture(webContents, [mainWindow, presentationWindow], permission, details);
  });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const frameId = request.frame?.frameTreeNodeId;
    const requested = pendingDesktopRequests.get(frameId);
    pendingDesktopRequests.delete(frameId);
    if (!requested || !isTrustedMainFrame(request.frame)) {
      callback(null);
      return;
    }
    desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
    }).then((sources) => {
      const source = sources.find((candidate) => candidate.id === requested.id);
      if (!source) {
        callback(null);
        return;
      }
      callback({
        video: source,
        ...(requested.withAudio ? { audio: 'loopback' } : {}),
      });
    }).catch(() => callback(null));
  });
}

async function loadRenderer(window, presentation = false) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    if (presentation) url.searchParams.set('present', '1');
    else url.searchParams.delete('present');
    await window.loadURL(url.toString());
    return;
  }
  await window.loadFile(
    path.join(__dirname, '..', 'dist', 'index.html'),
    presentation ? { query: { present: '1' } } : undefined,
  );
}

function rendererPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: MAIN_WINDOW_MINIMUM_SIZE[0],
    minHeight: MAIN_WINDOW_MINIMUM_SIZE[1],
    resizable: true,
    frame: true,
    title: 'Freeform',
    backgroundColor: '#1f1f1f',
    transparent: false,
    autoHideMenuBar: true,
    webPreferences: rendererPreferences(),
  });

  await loadRenderer(mainWindow);
  mainWindow.on('closed', () => {
    presentationWindow?.close();
    finishWindowResize();
    presentationWindowLocked = false;
    presentationNormalPlacement = null;
    presentationProject = null;
    mainWindow = null;
  });
}

async function createPresentationWindow() {
  presentationWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: PRESENT_WINDOW_MINIMUM_SIZE[0],
    minHeight: PRESENT_WINDOW_MINIMUM_SIZE[1],
    resizable: true,
    frame: false,
    show: false,
    hasShadow: false,
    title: 'Freeform Present',
    backgroundColor: '#00000000',
    transparent: true,
    autoHideMenuBar: true,
    webPreferences: rendererPreferences(),
  });

  presentationWindow.on('will-move', (event) => {
    if (presentationWindowLocked && !applyingWindowPlacement) event.preventDefault();
  });
  presentationWindow.on('will-resize', (event) => {
    if (presentationWindowLocked && !applyingWindowPlacement) event.preventDefault();
  });
  presentationWindow.on('enter-full-screen', () => {
    presentationWindowFullscreen = true;
    finishWindowMove();
  });
  presentationWindow.on('leave-full-screen', () => {
    presentationWindowFullscreen = false;
    finishWindowMove();
  });
  presentationWindow.on('closed', () => {
    finishWindowResize();
    finishWindowMove();
    presentationWindowLocked = false;
    presentationWindowFullscreen = false;
    presentationNormalPlacement = null;
    presentationProject = null;
    presentationWindow = null;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('presentation:closed');
    }
  });

  try {
    await loadRenderer(presentationWindow, true);
  } catch (error) {
    presentationWindow?.close();
    throw error;
  }
}

app.whenReady().then(async () => {
  protocol.handle('freeform-media', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname.slice(1));
      if (!allowedMediaPaths.has(filePath)) {
        return new Response('Media path has not been authorized.', { status: 403 });
      }
      const response = await net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers,
      });
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      return new Response(`Unable to read media: ${error.message}`, { status: 404 });
    }
  });

  registerProjectHandlers();
  registerCaptureHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

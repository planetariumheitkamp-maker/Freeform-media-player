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
import { resizeWindowBounds, resolveWindowPlacement, WINDOW_RESIZE_DIRECTIONS } from './presentationWindow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const allowedMediaPaths = new Set();
const MAIN_WINDOW_MINIMUM_SIZE = [1080, 700];
let mainWindow;
let pendingDesktopRequest = null;
let presentationWindowLocked = false;
let applyingWindowPlacement = false;
let presentationNormalPlacement = null;
let windowResizeSession = null;

function finishWindowResize() {
  windowResizeSession = null;
}

function getMainWindowPlacement() {
  if (!mainWindow) return null;
  if (presentationNormalPlacement) return { ...presentationNormalPlacement };
  const bounds = mainWindow.getNormalBounds();
  const display = screen.getDisplayMatching(bounds);
  return { ...bounds, displayId: String(display.id) };
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

  ipcMain.handle('window:fullscreen', async (event, value) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow)) throw new Error('Only Freeform can change the window.');
    finishWindowResize();
    if (value) {
      // Some Windows configurations expand the window without reporting
      // isFullScreen(). Keep the editing bounds independently of either path.
      presentationNormalPlacement ??= getMainWindowPlacement();
      mainWindow?.setFullScreen(true);
    } else {
      mainWindow?.setFullScreen(false);
      presentationNormalPlacement = null;
    }
  });

  ipcMain.handle('window:get-placement', (event) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow)) return null;
    return getMainWindowPlacement();
  });

  ipcMain.handle('window:set-placement', (event, input) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow) || !mainWindow) return null;
    const placement = resolveWindowPlacement(
      input,
      screen.getAllDisplays(),
      mainWindow.getNormalBounds(),
      MAIN_WINDOW_MINIMUM_SIZE,
    );
    if (!placement) return null;
    applyingWindowPlacement = true;
    try {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      // Unlocking cannot clear this transparent window's native size limits.
      mainWindow.setMaximumSize(0, 0);
      mainWindow.setBounds(placement);
    } finally {
      applyingWindowPlacement = false;
    }
    return { ...mainWindow.getNormalBounds(), displayId: placement.displayId };
  });

  ipcMain.handle('window:set-locked', (event, value) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow)) throw new Error('Only Freeform can lock the window.');
    presentationWindowLocked = Boolean(value);
    if (presentationWindowLocked) finishWindowResize();
    if (!mainWindow) return;
    mainWindow.setMovable(!presentationWindowLocked);
    mainWindow.setResizable(!presentationWindowLocked);
  });

  ipcMain.handle('window:begin-resize', (event, direction, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow) || !mainWindow) return false;
    if (presentationWindowLocked || !WINDOW_RESIZE_DIRECTIONS.has(direction)
      || mainWindow.isFullScreen() || mainWindow.isMaximized()) return false;
    const nativeCursor = screen.getCursorScreenPoint();
    windowResizeSession = {
      direction,
      bounds: mainWindow.getBounds(),
      cursor: {
        x: Number.isFinite(cursor?.x) ? cursor.x : nativeCursor.x,
        y: Number.isFinite(cursor?.y) ? cursor.y : nativeCursor.y,
      },
    };
    return true;
  });

  ipcMain.handle('window:update-resize', (event, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow) || !mainWindow || !windowResizeSession) return null;
    if (presentationWindowLocked || !Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return null;
    const session = windowResizeSession;
    const bounds = resizeWindowBounds(
      session.bounds,
      { x: cursor.x - session.cursor.x, y: cursor.y - session.cursor.y },
      session.direction,
      MAIN_WINDOW_MINIMUM_SIZE,
    );
    // Windows constrains programmatic sizing while this transparent window is
    // natively non-resizable. Release that constraint for this trusted IPC update.
    mainWindow.setMaximumSize(0, 0);
    mainWindow.setBounds(bounds);
    return { ...mainWindow.getBounds(), displayId: String(screen.getDisplayMatching(mainWindow.getBounds()).id) };
  });

  ipcMain.handle('window:end-resize', (event) => {
    if (isMainWindowFrame(event.senderFrame, mainWindow)) finishWindowResize();
  });

  ipcMain.handle('window:transparency', (event, value) => {
    if (!isMainWindowFrame(event.senderFrame, mainWindow)) throw new Error('Only Freeform can change transparency.');
    mainWindow?.setBackgroundColor(value ? '#00000000' : '#1f1f1f');
  });
}

function registerCaptureHandlers() {
  ipcMain.handle('desktop:sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 360, height: 220 },
      fetchWindowIcons: true,
    });
    return sources
      .filter((source) => !mainWindow || source.name !== mainWindow.getTitle())
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
    if (!isMainWindowFrame(event.senderFrame, mainWindow)) throw new Error('Only Freeform can prepare desktop capture.');
    if (typeof id !== 'string' || !id) throw new Error('A desktop source is required.');
    pendingDesktopRequest = { id, withAudio: Boolean(withAudio) };
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
    callback(canUseMainWindowCapture(webContents, mainWindow, permission, details));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    return canUseMainWindowCapture(webContents, mainWindow, permission, details);
  });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const requested = pendingDesktopRequest;
    pendingDesktopRequest = null;
    if (!requested || !isMainWindowFrame(request.frame, mainWindow)) {
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: MAIN_WINDOW_MINIMUM_SIZE[0],
    minHeight: MAIN_WINDOW_MINIMUM_SIZE[1],
    resizable: true,
    title: 'Freeform',
    backgroundColor: '#00000000',
    transparent: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.on('will-move', (event) => {
    if (presentationWindowLocked && !applyingWindowPlacement) event.preventDefault();
  });
  mainWindow.on('will-resize', (event) => {
    if (presentationWindowLocked && !applyingWindowPlacement) event.preventDefault();
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.on('closed', () => {
    finishWindowResize();
    presentationWindowLocked = false;
    presentationNormalPlacement = null;
    mainWindow = null;
  });
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

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
let presentationWindowKind = 'native';
let presentationProject = null;
const pendingDesktopRequests = new Map();
let presentationWindowLocked = false;
let presentationWindowFullscreen = false;
let applyingWindowPlacement = false;
let presentationNormalPlacement = null;
let presentationRestoredWorkAreaPlacement = null;
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

function sameRestoredWindowBounds(first, second) {
  const tolerance = process.platform === 'win32' ? 1 : 0;
  return ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(first?.[key])
    && Number.isFinite(second?.[key]) && Math.abs(first[key] - second[key]) <= tolerance);
}

function isTransparentWorkAreaRestore(window, placement) {
  return process.platform === 'win32' && presentationWindowKind === 'overlay'
    && window === presentationWindow && Boolean(placement)
    && sameWindowBounds(placement, screen.getDisplayMatching(placement).workArea);
}

function hasExplicitWorkAreaRestore(window) {
  return presentationWindowKind === 'overlay' && window === presentationWindow
    && sameWindowBounds(presentationRestoredWorkAreaPlacement, window.getBounds());
}

function applyNormalWindowPlacement(window, placement) {
  if (placement) window.setBounds(placement);
  // Electron 45 defines every transparent Windows window with work-area bounds
  // as maximized, even after restoring it. Record only our explicit restoration,
  // never an assumed native state, and preserve the exact saved rectangle.
  const restoredWorkArea = isTransparentWorkAreaRestore(window, placement)
    && sameWindowBounds(window.getBounds(), placement);
  if (restoredWorkArea && !presentationWindowLocked) {
    // Refresh stale native constraints left by locking/fullscreen. Without this,
    // Windows can add one DIP to each axis on every subsequent setPosition call.
    window.setResizable(false);
    window.setResizable(true);
    window.setMaximumSize(0, 0);
  }
  if (window === presentationWindow) {
    presentationRestoredWorkAreaPlacement = restoredWorkArea ? { ...placement } : null;
  }
  return restoredWorkArea;
}

async function restoreNormalWindow(window, savedPlacement = presentationNormalPlacement) {
  const placement = selectNormalWindowBounds(savedPlacement);
  if (window === presentationWindow) presentationRestoredWorkAreaPlacement = null;
  let restoredWorkArea = false;
  const isNormal = () => !window.isDestroyed() && (!window.isMaximized() || restoredWorkArea)
    && (!placement || sameRestoredWindowBounds(window.getBounds(), placement));
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
      restoredWorkArea = applyNormalWindowPlacement(window, placement);
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
    hasExplicitWorkAreaRestore(presentationWindow) ? presentationRestoredWorkAreaPlacement : null,
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
      // The actual normal rectangle is newer than any saved placement. In particular,
      // transparent frame rounding can differ by one DIP after an output replacement.
      // An explicitly restored work area is the exception: Windows calls it maximized
      // and reports the preceding normal rectangle through getNormalBounds().
      presentationNormalPlacement = selectNormalWindowBounds(
        hasExplicitWorkAreaRestore(output) ? presentationRestoredWorkAreaPlacement : null,
        output.getNormalBounds(),
        output.getBounds(),
        getPresentationWindowPlacement(),
      );
      presentationRestoredWorkAreaPlacement = null;
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
      getPresentationWindowPlacement() ?? output.getBounds(),
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
      applyNormalWindowPlacement(output, placement);
    } finally {
      applyingWindowPlacement = false;
    }
    const current = output.getBounds();
    presentationNormalPlacement = { ...current };
    return { ...current, displayId: placement.displayId };
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
    if (!isMainWindowFrame(event.senderFrame, presentationWindow) || presentationWindowKind !== 'overlay') return false;
    if (presentationWindowLocked || !WINDOW_RESIZE_DIRECTIONS.has(direction)
      || (presentationWindowFullscreen || presentationWindow.isFullScreen())
      || (presentationWindow.isMaximized() && !hasExplicitWorkAreaRestore(presentationWindow))) return false;
    finishWindowMove();
    // Clear stale native size limits once, not on every pointer update. Windows 10
    // can otherwise reapply old constraints during a transparent-window resize.
    presentationWindow.setMaximumSize(0, 0);
    presentationRestoredWorkAreaPlacement = null;
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
    presentationWindow.setBounds(bounds);
    return { ...presentationWindow.getBounds(), displayId: String(screen.getDisplayMatching(presentationWindow.getBounds()).id) };
  });

  ipcMain.handle('window:end-resize', (event) => {
    if (isMainWindowFrame(event.senderFrame, presentationWindow)) finishWindowResize();
  });

  ipcMain.handle('window:begin-move', async (event, cursor) => {
    if (!isMainWindowFrame(event.senderFrame, presentationWindow) || presentationWindowKind !== 'overlay'
      || presentationWindowLocked || presentationWindowFullscreen || presentationWindow.isFullScreen()) return false;
    const output = presentationWindow;
    finishWindowResize();
    finishWindowMove();
    const normalPlacement = getPresentationWindowPlacement();
    if (presentationWindowFullscreen || output.isFullScreen()) await leaveWindowFullscreen(output);
    if (presentationWindow !== output || output.isDestroyed() || presentationWindowLocked) return false;
    if (!(await restoreNormalWindow(output, normalPlacement))) return false;
    if (presentationWindow !== output || output.isDestroyed() || presentationWindowLocked) return false;
    const restoredWorkArea = hasExplicitWorkAreaRestore(output);
    presentationNormalPlacement = null;
    presentationRestoredWorkAreaPlacement = null;
    const nativeCursor = screen.getCursorScreenPoint();
    windowMoveSession = {
      bounds: output.getBounds(),
      restoredWorkArea,
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
    // Only an explicitly restored Windows work-area rectangle may still report
    // itself as maximized here; ordinary maximized windows still reject motion.
    if ((presentationWindowFullscreen || presentationWindow.isFullScreen())
      || (presentationWindow.isMaximized() && !windowMoveSession.restoredWorkArea)) {
      finishWindowMove();
      return null;
    }
    const session = windowMoveSession;
    const cursorDelta = { x: cursor.x - session.cursor.x, y: cursor.y - session.cursor.y };
    const requested = moveWindowBounds(session.bounds, cursorDelta);
    const scaleFactor = screen.getDisplayMatching(requested).scaleFactor;
    const bounds = moveWindowBounds(session.bounds, cursorDelta, scaleFactor);
    // A move must not resend the transparent window's fractional-DIP size:
    // Windows can otherwise keep the origin unchanged and grow one edge instead.
    presentationWindow.setPosition(bounds.x, bounds.y);
    const current = presentationWindow.getBounds();
    return { ...current, displayId: String(screen.getDisplayMatching(current).id) };
  });

  ipcMain.handle('window:end-move', (event) => {
    if (isMainWindowFrame(event.senderFrame, presentationWindow)) finishWindowMove();
  });

  ipcMain.handle('window:transparency', async (event, value) => {
    if (!canControlPresentation(event.senderFrame)) throw new Error('Only Freeform can change output transparency.');
    const transparent = Boolean(value);
    const nextKind = transparent ? 'overlay' : 'native';
    if (process.platform === 'win32' && presentationWindowKind !== nextKind) {
      await replacePresentationWindow(nextKind);
      return;
    }
    presentationWindow?.setBackgroundColor(transparent ? '#00000000' : '#1f1f1f');
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

async function loadRenderer(window, presentation = false, windowKind = 'native') {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    if (presentation) {
      url.searchParams.set('present', '1');
      url.searchParams.set('window-kind', windowKind);
    } else {
      url.searchParams.delete('present');
      url.searchParams.delete('window-kind');
    }
    await window.loadURL(url.toString());
    return;
  }
  await window.loadFile(
    path.join(__dirname, '..', 'dist', 'index.html'),
    presentation ? { query: { present: '1', 'window-kind': windowKind } } : undefined,
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

function requestedPresentationWindowKind() {
  if (process.platform !== 'win32') return 'overlay';
  try {
    return JSON.parse(presentationProject)?.present?.transparency ? 'overlay' : 'native';
  } catch {
    return 'native';
  }
}

function buildPresentationWindow(kind) {
  const native = kind === 'native';
  return new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: PRESENT_WINDOW_MINIMUM_SIZE[0],
    minHeight: PRESENT_WINDOW_MINIMUM_SIZE[1],
    resizable: true,
    frame: false,
    thickFrame: native,
    show: false,
    hasShadow: native,
    title: 'Freeform Present',
    backgroundColor: native ? '#1f1f1f' : '#00000000',
    transparent: !native,
    autoHideMenuBar: true,
    webPreferences: rendererPreferences(),
  });
}

function watchPresentationWindow(output) {
  output.on('will-move', (event) => {
    if (output === presentationWindow && presentationWindowLocked && !applyingWindowPlacement) event.preventDefault();
  });
  output.on('will-resize', (event) => {
    if (output === presentationWindow && presentationWindowLocked && !applyingWindowPlacement) event.preventDefault();
  });
  output.on('enter-full-screen', () => {
    if (output !== presentationWindow) return;
    presentationWindowFullscreen = true;
    finishWindowMove();
  });
  output.on('leave-full-screen', () => {
    if (output !== presentationWindow) return;
    presentationWindowFullscreen = false;
    finishWindowMove();
  });
  output.on('closed', () => {
    // Replacing an output closes the old native object after the new one loads.
    // Its lifecycle events must not clear the replacement or stop editor sync.
    if (output !== presentationWindow) return;
    finishWindowResize();
    finishWindowMove();
    presentationWindowLocked = false;
    presentationWindowFullscreen = false;
    presentationNormalPlacement = null;
    presentationRestoredWorkAreaPlacement = null;
    presentationProject = null;
    presentationWindow = null;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('presentation:closed');
    }
  });
}

async function createPresentationWindow() {
  const kind = requestedPresentationWindowKind();
  const output = buildPresentationWindow(kind);
  presentationWindow = output;
  presentationWindowKind = kind;
  watchPresentationWindow(output);
  try {
    await loadRenderer(output, true, kind);
    return output;
  } catch (error) {
    if (!output.isDestroyed()) output.close();
    throw error;
  }
}

async function replacePresentationWindow(kind) {
  const previous = presentationWindow;
  if (!previous || previous.isDestroyed() || kind === presentationWindowKind) return previous;
  const previousKind = presentationWindowKind;
  const placement = getPresentationWindowPlacement();
  const state = {
    fullscreen: presentationWindowFullscreen || previous.isFullScreen(),
    locked: presentationWindowLocked,
    normalPlacement: presentationNormalPlacement ? { ...presentationNormalPlacement } : null,
    restoredWorkArea: presentationRestoredWorkAreaPlacement ? { ...presentationRestoredWorkAreaPlacement } : null,
  };
  finishWindowResize();
  finishWindowMove();

  const output = buildPresentationWindow(kind);
  // Authorize the new renderer before it asks for the current workspace.
  presentationWindow = output;
  presentationWindowKind = kind;
  watchPresentationWindow(output);
  try {
    await loadRenderer(output, true, kind);
  } catch (error) {
    const latestProject = presentationProject;
    // Restore identity before closing the failed window so its closed event is inert.
    presentationWindow = previous;
    presentationWindowKind = previousKind;
    presentationProject = latestProject;
    presentationWindowLocked = state.locked;
    presentationWindowFullscreen = state.fullscreen;
    presentationNormalPlacement = state.normalPlacement;
    presentationRestoredWorkAreaPlacement = state.restoredWorkArea;
    if (!output.isDestroyed()) output.close();
    throw error;
  }

  const normalPlacement = placement ?? state.normalPlacement;
  presentationWindowLocked = state.locked;
  presentationWindowFullscreen = false;
  presentationRestoredWorkAreaPlacement = null;
  output.setMovable(!state.locked);
  output.setResizable(!state.locked);
  if (normalPlacement) applyNormalWindowPlacement(output, normalPlacement);
  presentationNormalPlacement = state.fullscreen ? normalPlacement : state.normalPlacement;
  output.show();
  if (state.fullscreen) output.setFullScreen(true);
  mainWindow?.focus();
  if (!previous.isDestroyed()) previous.close();
  return output;
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

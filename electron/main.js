import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  systemPreferences,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const allowedMediaPaths = new Set();
let mainWindow;
let pendingDesktopRequest = null;

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

  ipcMain.handle('window:fullscreen', async (_event, value) => {
    mainWindow?.setFullScreen(Boolean(value));
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

  ipcMain.handle('desktop:prepare', (_event, id, withAudio) => {
    if (typeof id !== 'string' || !id) throw new Error('A desktop source is required.');
    pendingDesktopRequest = { id, withAudio: Boolean(withAudio) };
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const ours = mainWindow && webContents.id === mainWindow.webContents.id;
    callback(Boolean(ours && (permission === 'media' || permission === 'display-capture')));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const ours = mainWindow && webContents.id === mainWindow.webContents.id;
    return Boolean(ours && (permission === 'media' || permission === 'display-capture'));
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const requested = pendingDesktopRequest;
    pendingDesktopRequest = null;
    if (!requested) {
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
    minWidth: 1080,
    minHeight: 700,
    title: 'Freeform',
    backgroundColor: '#1f1f1f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.on('closed', () => {
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

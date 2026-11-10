import { app, dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isMainWindowFrame } from './providerCaptureRules.js';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeLabel(value) {
  return String(value || 'Sandbox recording')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Sandbox recording';
}

export function createRecordingController({ getMainWindow, describeFile }) {
  let directory = null;
  const active = new Map();

  function getDirectory() {
    if (!directory) directory = path.join(app.getPath('videos'), 'Freeform Recordings');
    return directory;
  }

  function assertMainSender(event) {
    if (!isMainWindowFrame(event.senderFrame, getMainWindow())) {
      throw new Error('Only the main Freeform window can control recordings.');
    }
  }

  function recordingPath(name) {
    if (typeof name !== 'string' || path.basename(name) !== name || path.extname(name).toLowerCase() !== '.webm') {
      throw new Error('Only WebM recordings from the selected recording folder can be opened.');
    }
    const base = getDirectory();
    const filePath = path.resolve(base, name);
    if (path.dirname(filePath) !== path.resolve(base)) throw new Error('The recording path is outside the selected folder.');
    return filePath;
  }

  async function chooseDirectory(event) {
    assertMainSender(event);
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Choose where Freeform saves recordings',
      defaultPath: getDirectory(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) directory = path.resolve(result.filePaths[0]);
    return { directory: getDirectory(), canceled: result.canceled };
  }

  async function start(event, input) {
    assertMainSender(event);
    const base = getDirectory();
    await fs.mkdir(base, { recursive: true });
    const name = `${timestamp()} ${safeLabel(input?.label)}.webm`;
    const filePath = recordingPath(name);
    const handle = await fs.open(filePath, 'wx');
    const id = randomUUID();
    active.set(id, { id, name, path: filePath, handle, queue: Promise.resolve(), bytes: 0 });
    return { id, name, path: filePath, directory: base };
  }

  function getActive(id) {
    const entry = active.get(id);
    if (!entry) throw new Error('This recording is no longer active. Start a new recording.');
    return entry;
  }

  async function append(event, id, data) {
    assertMainSender(event);
    const entry = getActive(id);
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      throw new Error('Recording data must be a binary chunk.');
    }
    const buffer = ArrayBuffer.isView(data)
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : Buffer.from(data);
    if (!buffer.byteLength || buffer.byteLength > 32 * 1024 * 1024) throw new Error('Invalid recording chunk size.');
    entry.queue = entry.queue.then(() => entry.handle.write(buffer));
    await entry.queue;
    entry.bytes += buffer.byteLength;
    return { bytes: entry.bytes };
  }

  async function finish(event, id) {
    assertMainSender(event);
    const entry = getActive(id);
    active.delete(id);
    try {
      await entry.queue;
      await entry.handle.close();
    } catch (error) {
      try { await entry.handle.close(); } catch { /* Already closed. */ }
      throw error;
    }
    const stat = await fs.stat(entry.path);
    return { id, name: entry.name, path: entry.path, bytes: stat.size };
  }

  async function discard(event, id) {
    assertMainSender(event);
    const entry = getActive(id);
    active.delete(id);
    try { await entry.queue; } catch { /* Finish cleanup even after a failed write. */ }
    try { await entry.handle.close(); } catch { /* Already closed. */ }
    await fs.rm(entry.path, { force: true });
    return { discarded: true };
  }

  async function list(event) {
    assertMainSender(event);
    let names;
    try {
      names = await fs.readdir(getDirectory(), { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return { directory: getDirectory(), recordings: [] };
      throw error;
    }
    const recordings = await Promise.all(names
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.webm')
      .map(async (entry) => {
        try {
          const filePath = recordingPath(entry.name);
          const stat = await fs.stat(filePath);
          return { name: entry.name, path: filePath, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
        } catch { return null; }
      }));
    return {
      directory: getDirectory(),
      recordings: recordings.filter(Boolean).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 200),
    };
  }

  async function open(event, name) {
    assertMainSender(event);
    const filePath = recordingPath(name);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('The selected recording is not a file.');
    return describeFile(filePath);
  }

  async function showFolder(event) {
    assertMainSender(event);
    await fs.mkdir(getDirectory(), { recursive: true });
    const result = await shell.openPath(getDirectory());
    if (result) throw new Error(result);
    return { directory: getDirectory() };
  }

  return {
    getState: async (event) => { assertMainSender(event); return { directory: getDirectory() }; },
    chooseDirectory,
    start,
    append,
    finish,
    discard,
    list,
    open,
    showFolder,
  };
}

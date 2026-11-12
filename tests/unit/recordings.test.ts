import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRecordingController } from '../../electron/recordings.js';

const harness = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => harness.directory) },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn().mockResolvedValue('') },
}));
vi.mock('../../electron/windowSecurity.js', () => ({
  isMainWindowFrame: (frame: any, window: any) => frame?.owner === window && !window?.destroyed,
}));

describe('local recording files', () => {
  let controller: ReturnType<typeof createRecordingController>;
  let mainWindow: any;
  let event: any;

  beforeEach(async () => {
    harness.directory = await mkdtemp(path.join(tmpdir(), 'freeform-recordings-'));
    mainWindow = { destroyed: false };
    event = { senderFrame: { owner: mainWindow } };
    controller = createRecordingController({
      getMainWindow: () => mainWindow,
      describeFile: (filePath) => ({ name: path.basename(filePath), path: filePath, url: `freeform-media://local/${encodeURIComponent(filePath)}`, mediaType: 'video', mime: 'video/webm' }),
    });
  });

  afterEach(async () => {
    await rm(harness.directory, { recursive: true, force: true });
  });

  it('writes binary chunks in order and finalizes a listable WebM file', async () => {
    const started = await controller.start(event, { label: 'Custom / player: calibration' });
    expect(started.name).toMatch(/Custom - player- calibration\.webm$/);
    await controller.append(event, started.id, new TextEncoder().encode('first').buffer);
    await controller.append(event, started.id, new Uint8Array([45, 45, 45]));
    const saved = await controller.finish(event, started.id);
    expect(saved.bytes).toBe(8);
    expect(await readFile(saved.path)).toEqual(Buffer.from([102, 105, 114, 115, 116, 45, 45, 45]));
    const library = await controller.list(event);
    expect(library.recordings).toHaveLength(1);
    expect(library.recordings[0]).toMatchObject({ name: started.name, bytes: 8 });
    await expect(controller.open(event, started.name)).resolves.toMatchObject({ mediaType: 'video', mime: 'video/webm', path: saved.path });
  });

  it('discards an unfinished recording and rejects duplicate or invalid operations', async () => {
    const started = await controller.start(event, { label: 'Discard test' });
    await controller.append(event, started.id, new Uint8Array([1, 2, 3]));
    await expect(controller.discard(event, started.id)).resolves.toEqual({ discarded: true });
    await expect(stat(started.path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(controller.append(event, started.id, new Uint8Array([1]))).rejects.toThrow('no longer active');
    await expect(controller.finish(event, started.id)).rejects.toThrow('no longer active');
  });

  it('lists only WebM files and cannot open a path outside the selected folder', async () => {
    const directory = (await controller.getState(event)).directory;
    const { mkdir } = await import('node:fs/promises');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'known.webm'), 'webm');
    await writeFile(path.join(directory, 'ignore.txt'), 'not a recording');
    const result = await controller.list(event);
    expect(result.recordings.map((recording: any) => recording.name)).toEqual(['known.webm']);
    await expect(controller.open(event, '../outside.webm')).rejects.toThrow('Only WebM recordings');
    await expect(controller.open(event, 'ignore.txt')).rejects.toThrow('Only WebM recordings');
    await expect(controller.open(event, 'missing.webm')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(directory)).toEqual(['ignore.txt', 'known.webm']);
  });

  it('persists a newly selected directory and supports opening that folder', async () => {
    const { dialog, shell } = await import('electron');
    const destination = path.join(harness.directory, 'Selected folder');
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [destination] } as any);
    expect((await controller.chooseDirectory(event)).directory).toBe(destination);
    const started = await controller.start(event, { label: 'Selected destination' });
    expect(started.path.startsWith(destination)).toBe(true);
    await controller.discard(event, started.id);
    await controller.showFolder(event);
    expect(shell.openPath).toHaveBeenCalledWith(destination);
  });

  it('rejects recording IPC from another frame or a destroyed main window', async () => {
    await expect(controller.start({ senderFrame: { owner: {} } }, { label: 'Wrong frame' })).rejects.toThrow('Only the main Freeform window');
    mainWindow.destroyed = true;
    await expect(controller.list(event)).rejects.toThrow('Only the main Freeform window');
  });
});

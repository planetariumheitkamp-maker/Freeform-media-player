const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const output = path.join(root, 'artifacts', 'present-mode');
const reportPath = path.join(output, 'report.json');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const report = { platform: process.platform, runtimeErrors: [], lock: {}, transparency: {}, ambient: {}, restart: {} };
let phase = 'initial';
let started = false;

const save = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
const evaluate = (contents, code) => contents.executeJavaScript(code, true);
const nativeState = (main) => ({
  fullScreen: main.isFullScreen(), maximized: main.isMaximized(), visible: main.isVisible(),
  movable: main.isMovable(), resizable: main.isResizable(),
  bounds: main.getBounds(), normalBounds: main.getNormalBounds(),
  displayId: String(screen.getDisplayMatching(main.getNormalBounds()).id),
});
async function waitFor(contents, code, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(contents, code)) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${description}`);
}
async function click(contents, text) {
  const found = await evaluate(contents, `(() => {
    const button = [...document.querySelectorAll('button')].find(candidate => candidate.textContent.includes(${JSON.stringify(text)}) && !candidate.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(found, `Button should be available: ${text}`);
  await wait(250);
}
async function key(contents, key) {
  await evaluate(contents, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`);
  await wait(150);
}
async function controls(contents, open) {
  const current = await evaluate(contents, `Boolean(document.querySelector('[aria-label="Present mode controls"]'))`);
  if (current !== open) await key(contents, 'h');
  await waitFor(contents, `Boolean(document.querySelector('[aria-label="Present mode controls"]')) === ${open}`, `${open ? 'Open' : 'Close'} Present controls`);
}
async function enter(contents) {
  await click(contents, 'Present');
  await waitFor(contents, `Boolean(document.querySelector('[aria-label="Present controls"]'))`, 'Present toolbar');
  await wait(900);
}
async function readProject(contents) {
  return evaluate(contents, `(() => {
    const key = 'freeform.workspace.autosave.v1';
    const generations = Object.keys(localStorage).filter(candidate => candidate.startsWith(key + '.')).map(candidate => {
      try { return JSON.parse(localStorage.getItem(candidate) || '{}'); } catch { return null; }
    }).filter(envelope => envelope?.version === 1 && typeof envelope.savedAt === 'string' && typeof envelope.content === 'string').sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return JSON.parse(generations[0]?.content || localStorage.getItem(key) || '{}');
  })()`);
}
async function range(contents, label, value) {
  await evaluate(contents, `(() => {
    const input = document.querySelector('input[aria-label=${JSON.stringify(label)}]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
async function capture(contents, main, label) {
  const bounds = main.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } });
  const source = sources.find(candidate => String(candidate.display_id) === String(display.id)) ?? sources[0];
  assert(source, 'A desktop capture source is required.');
  const image = source.thumbnail;
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const point = { x: bounds.x + bounds.width * 0.9, y: bounds.y + bounds.height * 0.42 };
  const x = Math.max(0, Math.min(width - 1, Math.floor((point.x - display.bounds.x) / display.bounds.width * width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor((point.y - display.bounds.y) / display.bounds.height * height)));
  const offset = (y * width + x) * 4;
  await fs.writeFile(path.join(output, `${label}.png`), image.toPNG());
  return { filename: `${label}.png`, size: { width, height }, samplePoint: { x, y }, pixel: { r: bitmap[offset + 2], g: bitmap[offset + 1], b: bitmap[offset], a: bitmap[offset + 3] } };
}
async function referenceWindow(main) {
  const display = screen.getDisplayMatching(main.getBounds());
  const reference = new BrowserWindow({ ...display.bounds, frame: false, show: false, focusable: false, skipTaskbar: true, backgroundColor: '#00b8c8', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const html = '<body style="margin:0;background:#00b8c8;color:#08262c;font:36px Arial"><h1>WINDOW BEHIND FREEFORM</h1></body>';
  await reference.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  reference.showInactive();
  main.focus();
  main.moveTop();
}
async function exerciseEditingResize(contents, main, placement) {
  const handleCount = await evaluate(contents, `document.querySelectorAll('[data-window-resize]').length`);
  assert.equal(handleCount, 8, 'All editing-window edge and corner handles must be available.');
  const before = main.getBounds();
  const apiAfter = await evaluate(contents, `(async () => {
    const started = await window.freeform.beginWindowResize('se', { x: 100, y: 100 });
    if (!started) return { started };
    const resized = await window.freeform.updateWindowResize({ x: 160, y: 140 });
    await window.freeform.endWindowResize();
    return { started, resized };
  })()`);
  assert.equal(apiAfter.resized?.width, before.width + 60, 'The desktop resize IPC must resize window width.');
  assert.equal(apiAfter.resized?.height, before.height + 40, 'The desktop resize IPC must resize window height.');
  await evaluate(contents, `window.freeform.setWindowPlacement(${JSON.stringify(placement)})`);
  await wait(250);
  // webContents.sendInputEvent reports zero screenX/screenY, so exercise the
  // handles through actual Windows input in the interactive desktop session.
  main.focus();
  main.moveTop();
  await wait(300);
  const scale = screen.getDisplayMatching(before).scaleFactor;
  const start = { x: Math.round((before.x + before.width - 4) * scale), y: Math.round((before.y + before.height - 4) * scale) };
  await require('node:util').promisify(require('node:child_process').execFile)(path.join(root, 'test-results', 'native-pointer-drag.exe'), [
    String(start.x), String(start.y), String(Math.round(60 * scale)), String(Math.round(40 * scale)),
  ], { timeout: 15000 });
  await wait(250);
  const after = main.getBounds();
  report.lock.editingResize = { handleCount, before, apiAfter, after, nativeResizable: main.isResizable(), pointerInput: 'Windows', focused: main.isFocused() };
  assert.equal(after.width, before.width + 60, 'The south-east pointer drag must resize the editing window.');
  assert.equal(after.height, before.height + 40, 'The south-east pointer drag must resize the editing-window height.');
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
  await evaluate(contents, `window.freeform.setWindowPlacement(${JSON.stringify(placement)})`);
  await wait(250);
}
async function exit(contents, main, placement) {
  await key(contents, 'Escape');
  await waitFor(contents, `Boolean([...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Present'))`, 'Exit Present');
  await wait(1100);
  const state = nativeState(main);
  assert.equal(state.movable, true);
  assert.equal(state.fullScreen, false);
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(state.normalBounds[key], placement[key], `Restored editing window ${key}`);
  await exerciseEditingResize(contents, main, placement);
  return nativeState(main);
}
async function exerciseFloatingResize(contents, main) {
  const before = await evaluate(contents, `(() => {
    const panel = document.querySelector('.present-control-panel');
    const handle = document.querySelector('.present-resize-handle');
    if (!panel || !handle) return null;
    const panelBounds = panel.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();
    return { width: panelBounds.width, height: panelBounds.height, handle: { x: handleBounds.x, y: handleBounds.y, width: handleBounds.width, height: handleBounds.height } };
  })()`);
  assert(before, 'The floating Present resize handle must be available on desktop.');
  main.focus();
  main.moveTop();
  await wait(300);
  const content = main.getContentBounds();
  const scale = screen.getDisplayMatching(main.getBounds()).scaleFactor;
  const start = {
    x: Math.round((content.x + before.handle.x + before.handle.width / 2) * scale),
    y: Math.round((content.y + before.handle.y + before.handle.height / 2) * scale),
  };
  await require('node:util').promisify(require('node:child_process').execFile)(path.join(root, 'test-results', 'native-pointer-drag.exe'), [
    String(start.x), String(start.y), String(Math.round(120 * scale)), String(Math.round(90 * scale)),
  ], { timeout: 15000 });
  await wait(350);
  const after = await evaluate(contents, `(() => {
    const bounds = document.querySelector('.present-control-panel').getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  })()`);
  assert(Math.abs(after.width - (before.width + 120)) <= 2, `Desktop pointer drag must widen the Present panel: ${JSON.stringify({ before, after })}`);
  assert(Math.abs(after.height - (before.height + 90)) <= 2, `Desktop pointer drag must increase the Present panel height: ${JSON.stringify({ before, after })}`);
  await fs.writeFile(path.join(output, 'floating-present-dock-resized.png'), (await contents.capturePage()).toPNG());
  await evaluate(contents, `document.querySelector('.present-resize-handle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await wait(250);
  const reset = await evaluate(contents, `(() => {
    const bounds = document.querySelector('.present-control-panel').getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  })()`);
  assert(Math.abs(reset.width - before.width) <= 2, 'Double-click must restore the default desktop panel width.');
  assert(Math.abs(reset.height - before.height) <= 2, 'Double-click must restore automatic desktop panel height.');
  return { before: { width: before.width, height: before.height }, after, reset, pointerInput: 'Windows' };
}
async function firstPhase(contents, main) {
  const area = screen.getDisplayMatching(main.getNormalBounds()).workArea;
  const placement = { x: Math.round(area.x + (area.width - Math.min(1120, area.width)) / 2), y: Math.round(area.y + (area.height - Math.min(760, area.height)) / 2), width: Math.min(1120, area.width), height: Math.min(760, area.height) };
  const saved = await evaluate(contents, `(async () => { await window.freeform.setWindowPlacement(${JSON.stringify(placement)}); return window.freeform.getWindowPlacement(); })()`);
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(saved[key], placement[key], `Normal window ${key}`);
  report.lock.normalPlacement = saved;
  report.lock.editingNative = nativeState(main);
  report.editingDesktop = await capture(contents, main, 'desktop-editing');
  await fs.writeFile(path.join(output, 'renderer-editing.png'), (await contents.capturePage()).toPNG());
  await referenceWindow(main);
  await wait(700);
  report.referenceDesktop = await capture(contents, main, 'desktop-reference');
  await enter(contents);
  report.lock.beforeTransparency = nativeState(main);
  await controls(contents, true);
  report.floatingDock = await evaluate(contents, `(async () => {
    const controls = document.querySelector('.present-controls');
    const panel = document.querySelector('.present-control-panel');
    const tabs = [...document.querySelectorAll('.present-panel-tabs button')].map(button => button.textContent.trim());
    const players = [...document.querySelectorAll('.present-panel-tabs button')].find(button => button.textContent.trim() === 'Players');
    const media = [...document.querySelectorAll('.present-panel-tabs button')].find(button => button.textContent.trim() === 'Media');
    const rendered = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    players.click();
    await rendered();
    const playerList = Boolean(document.querySelector('.present-source-browser.is-players .player-list'));
    media.click();
    await rendered();
    const sourceList = Boolean(document.querySelector('.present-source-browser.is-media .source-list'));
    document.querySelector('.present-panel-tabs button').click();
    await rendered();
    return { left: controls.getBoundingClientRect().left, top: controls.getBoundingClientRect().top, panelWidth: panel.getBoundingClientRect().width, tabs, playerList, sourceList };
  })()`);
  assert.equal(report.floatingDock.left, 16);
  assert.equal(report.floatingDock.top, 16);
  assert(report.floatingDock.panelWidth <= 384);
  assert.deepEqual(report.floatingDock.tabs, ['Present', 'Players', 'Media']);
  assert(report.floatingDock.playerList && report.floatingDock.sourceList, 'Both standard lists must be available in desktop Present.');
  report.floatingDock.resize = await exerciseFloatingResize(contents, main);
  await fs.writeFile(path.join(output, 'floating-present-dock.png'), (await contents.capturePage()).toPNG());
  await click(contents, 'Layout + window');
  await wait(1300);
  const locked = await readProject(contents);
  assert.equal(locked.present.layoutLocked, true);
  assert.equal(locked.present.windowPlacement.displayId, saved.displayId);
  assert.deepEqual(locked.present.lockedLayout.output, locked.output);
  report.lock.presentation = nativeState(main);
  assert.equal(report.lock.presentation.movable, false);
  assert.equal(report.lock.presentation.resizable, false);
  assert.equal(await evaluate(contents, `document.querySelectorAll('[data-window-resize]').length`), 0, 'Present must not expose editing resize handles.');
  assert.equal(await evaluate(contents, `window.freeform.beginWindowResize('se', { x: 0, y: 0 })`), false, 'A locked window must reject programmatic resizing.');
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(locked.present.windowPlacement[key], placement[key], `Saved Present window ${key}`);
  await click(contents, 'Transparent background');
  await controls(contents, false);
  await wait(1000);
  const transparent = await capture(contents, main, 'desktop-transparent');
  await controls(contents, true);
  await click(contents, 'Transparent background');
  await controls(contents, false);
  await wait(1000);
  const opaque = await capture(contents, main, 'desktop-opaque');
  report.transparency = { transparent, opaque, expectedReferenceColor: '#00b8c8', pixelDifference: Math.hypot(...['r', 'g', 'b'].map(key => transparent.pixel[key] - opaque.pixel[key])) };
  assert(transparent.pixel.r < 55, `Transparent reference red: ${JSON.stringify(transparent.pixel)}`);
  assert(transparent.pixel.g > 125 && transparent.pixel.g < 235, `Transparent reference green: ${transparent.pixel.g}`);
  assert(transparent.pixel.b > 145 && transparent.pixel.b < 245, `Transparent reference blue: ${transparent.pixel.b}`);
  assert(report.transparency.pixelDifference > 100, 'Transparent and opaque desktop pixels must differ.');
  const before = await contents.capturePage();
  await fs.writeFile(path.join(output, 'canvas-before-ambient.png'), before.toPNG());
  await controls(contents, true);
  await click(contents, 'Transparent background');
  await click(contents, 'Ambient lighting');
  await click(contents, 'Edge matched');
  await range(contents, 'Ambient intensity', 1.4);
  await range(contents, 'Ambient spread', 96);
  await range(contents, 'Ambient smoothing', 0.36);
  await controls(contents, false);
  await wait(1500);
  const edge = await contents.capturePage();
  await fs.writeFile(path.join(output, 'canvas-ambient-edge.png'), edge.toPNG());
  report.ambient.edgeDesktop = await capture(contents, main, 'desktop-ambient-edge');
  await controls(contents, true);
  await click(contents, 'Average color');
  await controls(contents, false);
  await wait(1200);
  const average = await contents.capturePage();
  await fs.writeFile(path.join(output, 'canvas-ambient-average.png'), average.toPNG());
  report.ambient.averageDesktop = await capture(contents, main, 'desktop-ambient-average');
  assert(!edge.toPNG().equals(average.toPNG()), 'Edge and average ambient output must differ.');
  report.ambient.settings = (await readProject(contents)).present.ambient;
  assert.deepEqual(report.ambient.settings, { enabled: true, style: 'average', intensity: 1.4, spread: 96, smoothing: 0.36 });
  report.lock.exited = await exit(contents, main, placement);
  await click(contents, 'Output');
  await click(contents, 'Full HD');
  await click(contents, 'Apply size');
  await wait(1800);
  assert.equal((await readProject(contents)).output.width, 1920);
  assert.equal((await readProject(contents)).present.lockedLayout.output.width, locked.present.lockedLayout.output.width);
  report.status = 'restart';
  await save();
  app.relaunch();
  app.exit(0);
}
async function secondPhase(contents, main) {
  await referenceWindow(main);
  await enter(contents);
  const restored = await readProject(contents);
  const first = report.lock;
  assert.equal(restored.output.width, restored.present.lockedLayout.output.width);
  assert.equal(restored.output.height, restored.present.lockedLayout.output.height);
  assert.deepEqual(restored.players[0].position, restored.present.lockedLayout.players[0].position);
  assert.equal(restored.present.layoutLocked, true);
  assert.equal(restored.present.transparency, true);
  assert.equal(await evaluate(contents, `document.querySelector('canvas.warp-canvas').dataset.transparency`), 'native');
  const native = nativeState(main);
  assert.equal(native.movable, false);
  assert.equal(native.resizable, false);
  assert.equal(native.displayId, first.normalPlacement.displayId);
  const placement = await evaluate(contents, 'window.freeform.getWindowPlacement()');
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(placement[key], first.normalPlacement[key], `Restored Present window ${key}`);
  report.restart = { project: restored.present, native, placement };
  report.restart.exited = await exit(contents, main, first.normalPlacement);
  assert.deepEqual(report.runtimeErrors, [], 'Native Present must not produce renderer or shader errors.');
  report.status = 'passed';
  await save();
}
async function run(contents) {
  const main = BrowserWindow.fromWebContents(contents);
  contents.on('console-message', event => {
    if (event?.level === 'error') report.runtimeErrors.push(`Console: ${event.message}`);
  });
  try {
    if (phase === 'restart') await secondPhase(contents, main);
    else await firstPhase(contents, main);
  } catch (error) {
    report.status = 'failed';
    report.failure = error.stack;
    report.nativeAtFailure = nativeState(main);
    await save();
  } finally {
    if (report.status !== 'restart') setTimeout(() => app.exit(report.status === 'passed' ? 0 : 1), 500);
  }
}

app.setPath('userData', path.join(__dirname, 'profile'));
app.on('web-contents-created', (_event, contents) => {
  contents.on('did-finish-load', () => {
    if (started || !contents.getURL().startsWith('file:')) return;
    started = true;
    void waitFor(contents, `Boolean(document.querySelector('canvas.warp-canvas'))`, 'Freeform canvas', 30000).then(() => run(contents));
  });
});
setTimeout(async () => {
  if (report.status === 'passed' || report.status === 'restart') return;
  report.status = 'failed';
  report.failure = 'The interactive native verification timed out.';
  await save();
  app.exit(1);
}, 150000);
const production = import(pathToFileURL(path.join(root, 'electron/main.js')).href);
production.catch(async (error) => {
  report.status = 'failed';
  report.failure = error.stack;
  await save();
  app.exit(1);
});
void fs.mkdir(output, { recursive: true }).then(async () => {
  try {
    const previous = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    if (previous.status === 'restart') { phase = 'restart'; Object.assign(report, previous); }
    else { report.status = 'running'; await save(); }
  } catch { report.status = 'running'; await save(); }
  await production;
});

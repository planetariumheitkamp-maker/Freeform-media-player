const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { loadTimedMedia, exerciseMediaPlayback, verifyEditorAudioRestored } = require('./native-present-media.cjs');

const root = path.resolve(__dirname, '..', '..');
const outputDirectory = path.join(root, 'artifacts', 'present-mode');
const reportPath = path.join(outputDirectory, 'report.json');
const executeFile = promisify(execFile);
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const report = { platform: process.platform, runtimeErrors: [], lock: {}, transparency: {}, ambient: {}, restart: {} };
let phase = 'initial';
let started = false;
let reference;
const save = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
const evaluate = (contents, code) => contents.executeJavaScript(code, true);
const roleWindow = (role) => BrowserWindow.getAllWindows().find(window => {
  try {
    const url = new URL(window.webContents.getURL());
    return url.protocol === 'file:' && url.searchParams.get('present') === (role === 'present' ? '1' : null);
  } catch { return false; }
});
const nativeState = (window) => ({
  fullScreen: window.isFullScreen(), maximized: window.isMaximized(), visible: window.isVisible(),
  movable: window.isMovable(), resizable: window.isResizable(),
  bounds: window.getBounds(), normalBounds: window.getNormalBounds(),
  displayId: String(screen.getDisplayMatching(window.getNormalBounds()).id),
});
async function windowStyle(window) {
  const handle = window.getNativeWindowHandle();
  const address = process.arch === 'ia32' ? handle.readUInt32LE(0) : handle.readBigUInt64LE(0);
  const { stdout } = await executeFile(path.join(root, 'test-results', 'native-window-style.exe'), [String(address)], { timeout: 15000 });
  return JSON.parse(stdout);
}
async function waitFor(contents, code, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(contents, code)) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${description}`);
}
async function waitNative(check, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
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
async function key(contents, value) {
  await evaluate(contents, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true }))`);
  await wait(200);
}
async function controls(contents, open) {
  const current = await evaluate(contents, `Boolean(document.querySelector('[aria-label="Present mode controls"]'))`);
  if (current !== open) await key(contents, 'h');
  await waitFor(contents, `Boolean(document.querySelector('[aria-label="Present mode controls"]')) === ${open}`, `${open ? 'Open' : 'Close'} Present controls`);
  if (open) {
    const pinned = await evaluate(contents, `document.querySelector('.present-controls').classList.contains('is-pinned')`);
    if (!pinned) await evaluate(contents, `document.querySelector('[aria-label="Keep Present controls open"]').click()`);
  }
}
async function enter(contents) {
  await click(contents, 'Present');
  await waitNative(() => Boolean(roleWindow('present')), 'Create the separate Present output');
  const output = roleWindow('present');
  await waitFor(contents, `Boolean(document.querySelector('[aria-label="Present controls"]'))`, 'Editor Present controls');
  await waitFor(output.webContents, `Boolean(document.querySelector('.app-shell[data-window-role="present"] canvas.warp-canvas'))`, 'Output canvas', 30000);
  await wait(700);
  return output;
}
async function leaveFullscreen(contents, output) {
  await evaluate(contents, `window.freeform.setFullscreen(false)`);
  await waitNative(() => !output.isFullScreen(), 'Windowed output');
  await wait(350);
}
async function setOutputPlacement(contents, output, placement) {
  await evaluate(contents, `window.freeform.setWindowPlacement(${JSON.stringify(placement)})`);
  await waitNative(() => ['x', 'y', 'width', 'height'].every(key => output.getNormalBounds()[key] === placement[key]), 'Output placement');
  await waitFor(output.webContents, `innerWidth === ${placement.width} && innerHeight === ${placement.height}`, 'Output renderer matches native bounds');
  return evaluate(contents, 'window.freeform.getWindowPlacement()');
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
async function captureRenderer(contents, label) {
  const image = await contents.capturePage();
  await fs.writeFile(path.join(outputDirectory, `${label}.png`), image.toPNG());
  return image;
}
async function captureDesktop(window, label) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } });
  const source = sources.find(candidate => String(candidate.display_id) === String(display.id)) ?? sources[0];
  assert(source, 'A desktop capture source is required.');
  const image = source.thumbnail;
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();
  const point = { x: bounds.x + bounds.width * 0.9, y: bounds.y + bounds.height * 0.18 };
  const x = Math.max(0, Math.min(width - 1, Math.floor((point.x - display.bounds.x) / display.bounds.width * width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor((point.y - display.bounds.y) / display.bounds.height * height)));
  const offset = (y * width + x) * 4;
  await fs.writeFile(path.join(outputDirectory, `${label}.png`), image.toPNG());
  return { filename: `${label}.png`, size: { width, height }, samplePoint: { x, y }, pixel: { r: bitmap[offset + 2], g: bitmap[offset + 1], b: bitmap[offset], a: bitmap[offset + 3] } };
}
async function referenceWindow(output) {
  reference = new BrowserWindow({ ...output.getBounds(), frame: false, show: false, focusable: false, skipTaskbar: true, backgroundColor: '#00b8c8', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await reference.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="margin:0;background:#00b8c8;color:#08262c;font:36px Arial"><h1>WINDOW BEHIND FREEFORM</h1></body>')}`);
  reference.showInactive();
  output.moveTop();
}
async function exerciseFloatingResize(contents, editor) {
  const before = await evaluate(contents, `(() => {
    const panel = document.querySelector('.present-control-panel');
    const handle = document.querySelector('.present-resize-handle');
    const panelBounds = panel.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();
    return { width: panelBounds.width, height: panelBounds.height, handle: { x: handleBounds.x, y: handleBounds.y, width: handleBounds.width, height: handleBounds.height } };
  })()`);
  editor.focus();
  editor.moveTop();
  await wait(250);
  const content = editor.getContentBounds();
  const scale = screen.getDisplayMatching(editor.getBounds()).scaleFactor;
  const start = { x: Math.round((content.x + before.handle.x + before.handle.width / 2) * scale), y: Math.round((content.y + before.handle.y + before.handle.height / 2) * scale) };
  await executeFile(path.join(root, 'test-results', 'native-pointer-drag.exe'), [String(start.x), String(start.y), String(Math.round(120 * scale)), String(Math.round(90 * scale))], { timeout: 15000 });
  await wait(350);
  const after = await evaluate(contents, `(() => { const bounds = document.querySelector('.present-control-panel').getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; })()`);
  assert(Math.abs(after.width - (before.width + 120)) <= 2, `Pointer resizing must widen editor Present controls: ${JSON.stringify({ before, after })}`);
  assert(Math.abs(after.height - (before.height + 90)) <= 2, `Pointer resizing must increase editor Present controls height: ${JSON.stringify({ before, after })}`);
  await captureRenderer(contents, 'floating-present-dock-resized');
  await evaluate(contents, `document.querySelector('.present-resize-handle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await wait(250);
  const reset = await evaluate(contents, `(() => { const bounds = document.querySelector('.present-control-panel').getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; })()`);
  assert(Math.abs(reset.width - before.width) <= 2 && Math.abs(reset.height - before.height) <= 2, 'Double-click must restore default editor Present controls size.');
  return { before: { width: before.width, height: before.height }, after, reset, pointerInput: 'Windows' };
}
async function exerciseOutputMove(contents, output, delta, { fullscreen = false, placement = null, normalBounds = null, fullscreenEvents = [] } = {}) {
  if (placement) await setOutputPlacement(contents, output, placement);
  if (fullscreen) assert.equal(fullscreenEvents.at(-1), 'enter', 'The output must emit enter-full-screen before movement.');
  else assert(!output.isFullScreen(), 'The output must start windowed before ordinary movement.');
  assert.equal(await evaluate(output.webContents, `document.querySelectorAll('[data-window-move]').length`), 1, 'The unlocked output must expose its move surface.');
  const before = output.getBounds();
  const normalBefore = normalBounds ?? output.getNormalBounds();
  const projectBefore = JSON.parse(await evaluate(output.webContents, 'window.freeform.getPresentationProject()'));
  output.focus();
  output.moveTop();
  await wait(500);
  const hitTarget = await evaluate(output.webContents, `document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.getAttribute('data-window-move')`);
  assert.equal(hitTarget, 'surface', 'The center pointer must hit the native move surface.');
  const scale = screen.getDisplayMatching(before).scaleFactor;
  const start = { x: Math.round((before.x + before.width / 2) * scale), y: Math.round((before.y + before.height / 2) * scale) };
  await executeFile(path.join(root, 'test-results', 'native-pointer-drag.exe'), [String(start.x), String(start.y), String(Math.round(delta.x * scale)), String(Math.round(delta.y * scale))], { timeout: 15000 });
  await waitNative(() => fullscreen ? fullscreenEvents.at(-1) === 'leave' : !output.isFullScreen(), 'Dragging fullscreen restores a normal output window');
  await wait(350);
  const after = output.getBounds();
  const expected = fullscreen ? normalBefore : before;
  assert(Math.abs(after.x - expected.x - delta.x) <= 3, `Windows pointer drag must move output x: ${JSON.stringify({ before, normalBefore, after, delta })}`);
  assert(Math.abs(after.y - expected.y - delta.y) <= 3, `Windows pointer drag must move output y: ${JSON.stringify({ before, normalBefore, after, delta })}`);
  assert.equal(after.width, expected.width, 'Moving must preserve output width.');
  assert.equal(after.height, expected.height, 'Moving must preserve output height.');
  const projectAfter = JSON.parse(await evaluate(output.webContents, 'window.freeform.getPresentationProject()'));
  assert.deepEqual(projectAfter.players, projectBefore.players, 'Native window movement must not change player geometry.');
  assert.deepEqual(projectAfter.output, projectBefore.output, 'Native window movement must not change project output size.');
  await captureRenderer(output.webContents, fullscreen ? 'renderer-output-after-fullscreen-move' : 'renderer-output-after-move');
  return { before, normalBefore, after, delta, fullscreenEvents: [...fullscreenEvents], projectGeometryUnchanged: true, pointerInput: 'Windows' };
}
async function exerciseOutputResize(contents, output, placement) {
  assert.equal(await evaluate(output.webContents, `document.querySelectorAll('[data-window-resize]').length`), 8, 'The output must expose eight resize handles.');
  // Keep the southeast handle inside the physical desktop throughout the drag.
  // The placement-under-test intentionally fills the usable width for lock/restart coverage.
  const pointerPlacement = { ...placement, x: placement.x - 120, y: placement.y + 20, height: placement.height - 80 };
  await setOutputPlacement(contents, output, pointerPlacement);
  const before = output.getBounds();
  const apiAfter = await evaluate(output.webContents, `(async () => {
    const started = await window.freeform.beginWindowResize('se', { x: 100, y: 100 });
    if (!started) return { started };
    const resized = await window.freeform.updateWindowResize({ x: 160, y: 140 });
    await window.freeform.endWindowResize();
    return { started, resized };
  })()`);
  assert.equal(apiAfter.started, true);
  assert.equal(apiAfter.resized.width, before.width + 60);
  assert.equal(apiAfter.resized.height, before.height + 40);
  await setOutputPlacement(contents, output, pointerPlacement);
  output.focus();
  output.moveTop();
  await wait(500);
  const scale = screen.getDisplayMatching(before).scaleFactor;
  const start = { x: Math.round((before.x + before.width - 4) * scale), y: Math.round((before.y + before.height - 4) * scale) };
  await executeFile(path.join(root, 'test-results', 'native-pointer-drag.exe'), [String(start.x), String(start.y), String(Math.round(60 * scale)), String(Math.round(40 * scale))], { timeout: 15000 });
  await wait(350);
  const after = output.getBounds();
  assert(Math.abs(after.width - before.width - 60) <= 2, `Windows pointer drag must resize output width: ${JSON.stringify({ before, after })}`);
  assert(Math.abs(after.height - before.height - 40) <= 2, `Windows pointer drag must resize output height: ${JSON.stringify({ before, after })}`);
  assert.equal(after.x, before.x);
  assert.equal(after.y, before.y);
  await captureRenderer(output.webContents, 'renderer-output-after-resize');
  await setOutputPlacement(contents, output, placement);
  return { handleCount: 8, before, apiAfter, after, nativeResizable: output.isResizable(), pointerInput: 'Windows' };
}
async function firstPhase(contents, editor) {
  const area = screen.getDisplayMatching(editor.getNormalBounds()).workArea;
  const placement = { x: Math.round(area.x + area.width - Math.min(1120, area.width)), y: Math.round(area.y + (area.height - Math.min(760, area.height)) / 2), width: Math.min(1120, area.width), height: Math.min(760, area.height) };
  editor.setBounds({ x: area.x, y: area.y, width: Math.min(1120, area.width), height: Math.min(760, area.height) });
  editor.maximize();
  assert(editor.isMaximized());
  editor.unmaximize();
  assert(!editor.isMaximized());
  assert(editor.isMovable() && editor.isResizable());
  report.lock.editorNative = nativeState(editor);
  report.lock.editorStyle = await windowStyle(editor);
  assert(report.lock.editorStyle.caption && report.lock.editorStyle.minimizeBox && report.lock.editorStyle.maximizeBox && report.lock.editorStyle.systemMenu, 'The editor must retain the Windows title bar and ordinary window controls.');
  await captureRenderer(contents, 'renderer-editing');
  report.media = { loaded: await loadTimedMedia(contents, root, { evaluate, click, waitFor }) };
  const output = await enter(contents);
  report.lock.outputStyle = await windowStyle(output);
  assert(!report.lock.outputStyle.caption, 'The output must be frameless.');
  assert(editor.isMovable() && editor.isResizable());
  assert.equal(await evaluate(output.webContents, `document.querySelectorAll('.top-bar, .inspector, .source-rail, .present-controls').length`), 0, 'The output must not contain editing or Present controls.');
  assert.equal(await evaluate(output.webContents, `document.querySelectorAll('[data-window-resize]').length`), 8);
  const fullscreenEvents = [];
  output.on('enter-full-screen', () => fullscreenEvents.push('enter'));
  output.on('leave-full-screen', () => fullscreenEvents.push('leave'));
  await leaveFullscreen(contents, output);
  await setOutputPlacement(contents, output, placement);
  const earlyMovePlacement = { ...placement, x: placement.x - 120, y: placement.y + 20, height: placement.height - 80 };
  report.lock.outputMove = await exerciseOutputMove(contents, output, { x: 60, y: 40 }, { placement: earlyMovePlacement });
  await setOutputPlacement(contents, output, placement);
  const normalBeforeFullscreen = output.getNormalBounds();
  output.focus();
  output.moveTop();
  await wait(250);
  output.setFullScreen(true);
  await wait(1200);
  report.lock.fullscreenAttempt = { events: [...fullscreenEvents], fullScreenable: output.isFullScreenable(), state: nativeState(output) };
  assert.equal(fullscreenEvents.at(-1), 'enter', `Fullscreen output before dragging: ${JSON.stringify(report.lock.fullscreenAttempt)}`);
  report.lock.fullscreenMove = await exerciseOutputMove(contents, output, { x: -80, y: 60 }, { fullscreen: true, normalBounds: normalBeforeFullscreen, fullscreenEvents });
  await leaveFullscreen(contents, output);
  const saved = await setOutputPlacement(contents, output, placement);
  report.lock.normalPlacement = saved;
  Object.assign(report.media, await exerciseMediaPlayback(contents, output, { evaluate, waitFor, waitNative }));
  await referenceWindow(output);
  await captureDesktop(output, 'desktop-reference');
  await controls(contents, true);
  report.floatingDock = await evaluate(contents, `(async () => {
    const controls = document.querySelector('.present-controls');
    const panel = document.querySelector('.present-control-panel');
    const tabs = [...document.querySelectorAll('.present-panel-tabs button')].map(button => button.textContent.trim());
    const players = [...document.querySelectorAll('.present-panel-tabs button')].find(button => button.textContent.trim() === 'Players');
    const media = [...document.querySelectorAll('.present-panel-tabs button')].find(button => button.textContent.trim() === 'Media');
    const rendered = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    players.click(); await rendered();
    const playerList = Boolean(document.querySelector('.present-source-browser.is-players .player-list'));
    media.click(); await rendered();
    const sourceList = Boolean(document.querySelector('.present-source-browser.is-media .source-list'));
    document.querySelector('.present-panel-tabs button').click(); await rendered();
    return { left: controls.getBoundingClientRect().left, top: controls.getBoundingClientRect().top, panelWidth: panel.getBoundingClientRect().width, tabs, playerList, sourceList };
  })()`);
  assert.equal(report.floatingDock.left, 16);
  assert.equal(report.floatingDock.top, 16);
  assert(report.floatingDock.panelWidth <= 384);
  assert.deepEqual(report.floatingDock.tabs, ['Present', 'Players', 'Media']);
  assert(report.floatingDock.playerList && report.floatingDock.sourceList);
  report.floatingDock.resize = await exerciseFloatingResize(contents, editor);
  const beforeFrame = await evaluate(output.webContents, `document.querySelector('canvas.warp-canvas').toDataURL()`);
  await range(contents, 'Brightness', 1.4);
  await waitFor(contents, `document.querySelector('input[aria-label="Brightness"]').value === '1.4'`, 'Editor brightness');
  await waitNative(async () => (await evaluate(output.webContents, `document.querySelector('canvas.warp-canvas').toDataURL()`)) !== beforeFrame, 'Live editor visual change reaches output');
  await waitNative(async () => JSON.parse(await evaluate(output.webContents, 'window.freeform.getPresentationProject()')).players[0].visual.brightness === 1.4, 'Synchronized visual state');
  await captureRenderer(contents, 'renderer-editor-live');
  await captureRenderer(output.webContents, 'renderer-output-live');
  await click(contents, 'Layout + window');
  await waitNative(() => !output.isMovable() && !output.isResizable(), 'Lock only the output');
  await wait(1000);
  const locked = await readProject(contents);
  assert.equal(locked.present.layoutLocked, true);
  assert.equal(locked.present.windowPlacement.displayId, saved.displayId);
  assert.deepEqual(locked.present.lockedLayout.output, locked.output);
  assert(editor.isMovable() && editor.isResizable());
  assert.equal(await evaluate(output.webContents, `window.freeform.beginWindowResize('se', { x: 0, y: 0 })`), false, 'Locked output must reject resizing.');
  assert.equal(await evaluate(output.webContents, `window.freeform.beginWindowMove({ x: 0, y: 0 })`), false, 'Locked output must reject movement.');
  assert.equal(await evaluate(output.webContents, `document.querySelectorAll('[data-window-move]').length`), 0, 'Locked output must remove its move surface.');
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(locked.present.windowPlacement[key], placement[key]);
  report.lock.presentation = nativeState(output);
  await click(contents, 'Transparent background');
  await waitFor(output.webContents, `document.querySelector('canvas.warp-canvas').dataset.transparency === 'native'`, 'Output transparency');
  await controls(contents, false);
  output.moveTop();
  await wait(900);
  const transparent = await captureDesktop(output, 'desktop-transparent');
  await controls(contents, true);
  await click(contents, 'Transparent background');
  await controls(contents, false);
  output.moveTop();
  await wait(900);
  const opaque = await captureDesktop(output, 'desktop-opaque');
  report.transparency = { transparent, opaque, expectedReferenceColor: '#00b8c8', pixelDifference: Math.hypot(...['r', 'g', 'b'].map(key => transparent.pixel[key] - opaque.pixel[key])) };
  assert(transparent.pixel.r < 55, `Transparent reference red: ${JSON.stringify(transparent.pixel)}`);
  assert(transparent.pixel.g > 125 && transparent.pixel.g < 235, `Transparent reference green: ${transparent.pixel.g}`);
  assert(transparent.pixel.b > 145 && transparent.pixel.b < 245, `Transparent reference blue: ${transparent.pixel.b}`);
  assert(report.transparency.pixelDifference > 100, 'Transparent and opaque desktop pixels must differ.');
  await captureRenderer(output.webContents, 'canvas-before-ambient');
  await controls(contents, true);
  await click(contents, 'Transparent background');
  await click(contents, 'Ambient lighting');
  await click(contents, 'Edge matched');
  await range(contents, 'Ambient intensity', 1.4);
  await range(contents, 'Ambient spread', 96);
  await range(contents, 'Ambient smoothing', 0.36);
  await waitFor(output.webContents, `document.querySelector('canvas.warp-canvas').dataset.ambientSpread === '96'`, 'Live ambient settings');
  await controls(contents, false);
  output.moveTop();
  await wait(1200);
  const edge = await captureRenderer(output.webContents, 'canvas-ambient-edge');
  report.ambient.edgeDesktop = await captureDesktop(output, 'desktop-ambient-edge');
  await controls(contents, true);
  await click(contents, 'Average color');
  await waitFor(output.webContents, `document.querySelector('canvas.warp-canvas').dataset.ambientStyle === 'average'`, 'Average ambient mode');
  await controls(contents, false);
  output.moveTop();
  await wait(1000);
  const average = await captureRenderer(output.webContents, 'canvas-ambient-average');
  report.ambient.averageDesktop = await captureDesktop(output, 'desktop-ambient-average');
  assert(!edge.toPNG().equals(average.toPNG()), 'Edge and average ambient output must differ.');
  report.ambient.settings = (await readProject(contents)).present.ambient;
  assert.deepEqual(report.ambient.settings, { enabled: true, style: 'average', intensity: 1.4, spread: 96, smoothing: 0.36 });
  await controls(contents, true);
  await click(contents, 'Layout + window');
  await waitNative(() => output.isMovable() && output.isResizable(), 'Unlock output');
  await controls(contents, false);
  report.lock.outputResize = await exerciseOutputResize(contents, output, placement);
  await controls(contents, true);
  await click(contents, 'Exit');
  await waitNative(() => !roleWindow('present') && BrowserWindow.getAllWindows().length === 2, 'Exit closes only the output');
  assert(editor.isMovable() && editor.isResizable());
  report.media.editorAudioRestored = await verifyEditorAudioRestored(contents, { waitFor });
  await enter(contents);
  await key(contents, 'Escape');
  await waitNative(() => !roleWindow('present'), 'Escape closes only the output');
  const restartOutput = await enter(contents);
  await leaveFullscreen(contents, restartOutput);
  await setOutputPlacement(contents, restartOutput, placement);
  await controls(contents, true);
  await click(contents, 'Layout + window');
  await waitNative(() => !restartOutput.isMovable() && !restartOutput.isResizable(), 'Lock the restart layout');
  await wait(1000);
  const original = await readProject(contents);
  const changedPlacement = { ...placement, x: placement.x - 80, width: placement.width + 80, height: placement.height - 40 };
  await setOutputPlacement(contents, restartOutput, changedPlacement);
  await click(contents, 'Output');
  await click(contents, 'Full HD');
  await click(contents, 'Apply size');
  await wait(1400);
  const changed = await readProject(contents);
  assert.equal(changed.output.width, 1920);
  assert.equal(changed.present.lockedLayout.output.width, original.present.lockedLayout.output.width);
  assert.notEqual(changed.output.width, changed.present.lockedLayout.output.width);
  assert.equal(changed.present.layoutLocked, true);
  report.restart.savedPlacement = placement;
  report.restart.changedPlacement = changedPlacement;
  report.restart.changedNative = nativeState(restartOutput);
  report.restart.savedLockedLayout = original.present.lockedLayout;
  report.status = 'restart';
  await save();
  reference?.destroy();
  reference = null;
  app.relaunch();
  app.exit(0);
}
async function secondPhase(contents, editor) {
  const output = await enter(contents);
  await waitNative(() => !output.isMovable() && !output.isResizable(), 'Restore the output lock after restart');
  await waitFor(output.webContents, `document.querySelector('canvas.warp-canvas').dataset.transparency === 'native'`, 'Restore output transparency');
  await leaveFullscreen(contents, output);
  const restored = await readProject(contents);
  assert.equal(restored.output.width, restored.present.lockedLayout.output.width);
  assert.equal(restored.output.height, restored.present.lockedLayout.output.height);
  assert.deepEqual(restored.players[0].position, restored.present.lockedLayout.players[0].position);
  assert.equal(restored.present.layoutLocked, true);
  assert.equal(restored.present.transparency, true);
  assert(editor.isMovable() && editor.isResizable());
  const native = nativeState(output);
  const placement = await evaluate(contents, 'window.freeform.getWindowPlacement()');
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(placement[key], report.restart.savedPlacement[key], `Restored output ${key}`);
  report.restart.restored = { project: restored.present, output: restored.output, native, placement, editorStyle: await windowStyle(editor) };
  await waitFor(contents, `document.querySelector('.media-layer video')?.readyState >= 2`, 'Restore editor media after restart', 30000);
  await evaluate(contents, `(() => {
    const video = document.querySelector('.media-layer video');
    if (video?.paused) document.querySelector('.play-button').click();
  })()`);
  report.media.restart = await exerciseMediaPlayback(contents, output, { evaluate, waitFor, waitNative });
  await referenceWindow(output);
  await wait(500);
  report.restart.transparentDesktop = await captureDesktop(output, 'desktop-restart-transparent');
  const pixel = report.restart.transparentDesktop.pixel;
  assert(pixel.r < 55 && pixel.g > 125 && pixel.g < 235 && pixel.b > 145 && pixel.b < 245, `Restarted output must reveal the real desktop through transparency: ${JSON.stringify(pixel)}`);
  await captureRenderer(contents, 'renderer-restart-editor');
  await captureRenderer(output.webContents, 'renderer-restart-output');
  reference?.destroy();
  reference = null;
  await key(contents, 'Escape');
  await waitNative(() => !roleWindow('present') && BrowserWindow.getAllWindows().length === 1, 'Restart test closes only the output');
  assert(editor.isMovable() && editor.isResizable());
  report.media.restartEditorAudioRestored = await verifyEditorAudioRestored(contents, { waitFor });
  assert.deepEqual(report.runtimeErrors, [], 'Both windows must not produce renderer or shader errors.');
  report.status = 'passed';
  await save();
}
async function run(contents) {
  const editor = BrowserWindow.fromWebContents(contents);
  try {
    if (phase === 'restart') await secondPhase(contents, editor);
    else await firstPhase(contents, editor);
  } catch (error) {
    report.status = 'failed';
    report.failure = error.stack;
    report.windowsAtFailure = BrowserWindow.getAllWindows().map(window => ({ url: window.webContents.getURL(), ...nativeState(window) }));
    await save();
  } finally {
    if (report.status !== 'restart') setTimeout(() => app.exit(report.status === 'passed' ? 0 : 1), 500);
  }
}
async function start() {
  app.setPath('userData', path.join(__dirname, 'profile'));
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', event => {
      if (event?.level === 'error') report.runtimeErrors.push(`Console: ${event.message}`);
    });
    contents.on('did-finish-load', () => {
      if (started || !contents.getURL().startsWith('file:')) return;
      if (new URL(contents.getURL()).searchParams.get('present') === '1') return;
      started = true;
      void waitFor(contents, `Boolean(document.querySelector('canvas.warp-canvas'))`, 'Freeform editor canvas', 30000).then(() => run(contents));
    });
  });
  setTimeout(async () => {
    if (report.status === 'passed' || report.status === 'restart') return;
    report.status = 'failed';
    report.failure = 'The interactive native verification timed out.';
    await save();
    app.exit(1);
  }, 220000);
  // Start production before yielding to Electron's ready event. Reading the
  // restart checkpoint can then finish while the first renderer loads.
  const production = import(pathToFileURL(path.join(root, 'electron/main.js')).href);
  await fs.mkdir(outputDirectory, { recursive: true });
  try {
    const previous = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    if (previous.status === 'restart') { phase = 'restart'; Object.assign(report, previous); }
    else { report.status = 'running'; await save(); }
  } catch { report.status = 'running'; await save(); }
  await production;
}
start().catch(async error => {
  report.status = 'failed';
  report.failure = error.stack;
  await save();
  app.exit(1);
});

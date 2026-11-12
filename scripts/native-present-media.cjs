const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');

const mediaState = `(() => {
  const video = document.querySelector('.media-layer video');
  if (!video) return null;
  return {
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    muted: video.muted,
    rate: video.playbackRate,
    readyState: video.readyState,
    decodedAudioBytes: Number(video.webkitAudioDecodedByteCount || 0),
  };
})()`;

async function loadTimedMedia(contents, root, tools) {
  const { evaluate, click, waitFor } = tools;
  const dataUrl = await evaluate(contents, `(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(24);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const destination = audio.createMediaStreamDestination();
    oscillator.frequency.value = 440;
    gain.gain.value = 0.04;
    oscillator.connect(gain).connect(destination);
    stream.addTrack(destination.stream.getAudioTracks()[0]);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = event => reject(event.error || new Error('Test media encoding failed.'));
    });
    await audio.resume();
    oscillator.start();
    recorder.start(100);
    for (let frame = 0; frame < 48; frame += 1) {
      context.fillStyle = frame % 2 ? '#152a32' : '#26351c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#c5ffc3';
      context.fillRect(12 + frame * 5, 72, 38, 38);
      context.font = '18px sans-serif';
      context.fillText('NATIVE MEDIA SYNC', 20, 35);
      context.fillText(String(frame).padStart(2, '0'), 20, 154);
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    recorder.stop();
    await stopped;
    oscillator.stop();
    stream.getTracks().forEach(track => track.stop());
    await audio.close();
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (!blob.size) throw new Error('Test media is empty.');
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  })()`);
  assert(dataUrl.startsWith('data:video/webm;base64,'), 'Generate a real video/audio fixture in Chromium.');

  const fixture = path.join(root, 'test-results', 'native-media-sync.freeform.json');
  const originalSave = dialog.showSaveDialog;
  const originalOpen = dialog.showOpenDialog;
  try {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: fixture });
    await click(contents, 'Save file');
    const project = JSON.parse(await fs.readFile(fixture, 'utf8'));
    project.name = 'Native media synchronization';
    project.sources.unshift({
      id: 'source:native-sync-test',
      kind: 'stream',
      mediaType: 'video',
      name: 'Native audio/video sync test',
      uri: dataUrl,
      mime: 'video/webm',
      live: false,
      connected: true,
      detail: 'Generated test video with a sine-wave audio track',
    });
    project.players[0].sourceId = 'source:native-sync-test';
    project.players[0].autoplay = false;
    project.players[0].loop = true;
    project.present = { layoutLocked: false, transparency: false, ambient: { enabled: false } };
    await fs.writeFile(fixture, JSON.stringify(project));
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
    await click(contents, 'Open');
  } finally {
    dialog.showSaveDialog = originalSave;
    dialog.showOpenDialog = originalOpen;
  }
  await waitFor(contents, `document.querySelector('.media-layer video')?.readyState >= 2`, 'Load generated native video', 30000);
  await evaluate(contents, `document.querySelector('.play-button').click()`);
  await waitFor(contents, `!document.querySelector('.media-layer video')?.paused`, 'Start real editor playback');
  return evaluate(contents, mediaState);
}

async function exerciseMediaPlayback(contents, output, tools) {
  const { evaluate, waitFor, waitNative } = tools;
  await waitFor(contents, `document.querySelector('.media-layer video')?.readyState >= 2`, 'Editor media metadata', 30000);
  await waitFor(output.webContents, `document.querySelector('.media-layer video')?.readyState >= 2`, 'Output media metadata', 30000);
  await waitFor(output.webContents, `!document.querySelector('.media-layer video')?.paused`, 'Output follows editor playback');
  await waitFor(contents, `document.querySelector('.media-layer video')?.muted === true`, 'Mute editor while output is active');
  await waitFor(output.webContents, `document.querySelector('.media-layer video')?.muted === false`, 'Keep output audio enabled');
  const before = await evaluate(output.webContents, mediaState);
  await wait(350);
  const after = await evaluate(output.webContents, mediaState);
  assert(
    after.currentTime !== before.currentTime,
    `Output media must advance or loop: ${JSON.stringify({ before, after })}`,
  );

  await evaluate(contents, `document.querySelector('.play-button').click()`);
  await waitFor(contents, `document.querySelector('.media-layer video')?.paused === true`, 'Pause editor media');
  await waitFor(output.webContents, `document.querySelector('.media-layer video')?.paused === true`, 'Synchronize pause to output');
  const target = await evaluate(contents, `(() => {
    const video = document.querySelector('.media-layer video');
    const time = Math.min(0.55, video.duration * 0.6);
    video.currentTime = time;
    const rate = document.querySelector('select[aria-label="Playback rate"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(rate, '1.5');
    rate.dispatchEvent(new Event('change', { bubbles: true }));
    return time;
  })()`);
  await waitFor(output.webContents, `Math.abs(document.querySelector('.media-layer video').currentTime - ${target}) < 0.08`, 'Synchronize a paused seek to output');
  await waitFor(output.webContents, `document.querySelector('.media-layer video')?.playbackRate === 1.5`, 'Synchronize playback rate to output');
  await evaluate(contents, `document.querySelector('.play-button').click()`);
  await waitFor(output.webContents, `!document.querySelector('.media-layer video')?.paused`, 'Resume output from the editor');
  const editor = await evaluate(contents, mediaState);
  const presentation = await evaluate(output.webContents, mediaState);
  assert(editor.muted && !presentation.muted, 'Only the editor copy must be muted.');
  assert.equal(editor.rate, 1.5);
  assert.equal(presentation.rate, 1.5);
  assert(Math.abs(editor.currentTime - presentation.currentTime) < 0.45, 'Real output playback must follow editor time.');
  assert(editor.decodedAudioBytes > 0 && presentation.decodedAudioBytes > 0, 'Both native renderers must decode the real audio track.');
  return { seekTarget: target, editor, presentation, audioCheck: 'Decoded audio bytes and media mute properties' };
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyEditorAudioRestored(contents, tools) {
  await tools.waitFor(contents, `document.querySelector('.media-layer video')?.muted === false`, 'Restore editor audio after closing output');
  return true;
}

module.exports = { loadTimedMedia, exerciseMediaPlayback, verifyEditorAudioRestored };

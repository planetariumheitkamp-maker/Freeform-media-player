import type {
  DesktopSourceInfo,
  FreeformBridge,
  OpenedMedia,
  OpenProjectResult,
  SaveProjectResult,
} from '../types';

function fileMediaType(file: File): OpenedMedia['mediaType'] {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'video';
}

function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      resolve(files);
    }, { once: true });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve([]);
    }, { once: true });
    input.click();
  });
}

const browserBridge: FreeformBridge = {
  isDesktop: false,
  platform: 'browser',
  async openLocalFiles() {
    const files = await pickFiles('video/*,audio/*,image/*');
    return files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
      mime: file.type || undefined,
      mediaType: fileMediaType(file),
    }));
  },
  async openBackgroundImage() {
    const [file] = await pickFiles('image/*', false);
    if (!file) return null;
    return {
      name: file.name,
      url: URL.createObjectURL(file),
      mime: file.type || undefined,
      mediaType: 'image' as const,
    };
  },
  async authorizeMedia() {
    return {};
  },
  async listDesktopSources(): Promise<DesktopSourceInfo[]> {
    return [];
  },
  async prepareDesktopCapture() {
    // Browser capture uses the operating system picker directly.
  },
  async getRecordingState() {
    return { directory: 'Available only in the Freeform desktop app' };
  },
  async chooseRecordingDirectory() {
    throw new Error('Choose a recording folder in the Freeform desktop app.');
  },
  async startRecording() {
    throw new Error('Recording requires the Freeform desktop app.');
  },
  async appendRecording() {
    throw new Error('Recording requires the Freeform desktop app.');
  },
  async finishRecording() {
    throw new Error('Recording requires the Freeform desktop app.');
  },
  async discardRecording() {
    return { discarded: false };
  },
  async listRecordings() {
    return { directory: '', recordings: [] };
  },
  async openRecording() {
    throw new Error('Open saved recordings in the Freeform desktop app.');
  },
  async showRecordingFolder() {
    throw new Error('Open the recording folder in the Freeform desktop app.');
  },
  async saveProject(defaultName: string, content: string): Promise<SaveProjectResult> {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${defaultName.replace(/[\\/:*?"<>|]/g, '-')}.freeform.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { canceled: false, path: anchor.download };
  },
  async openProject(): Promise<OpenProjectResult> {
    const [file] = await pickFiles('.json,.freeform.json,application/json');
    if (!file) return { canceled: true };
    return { canceled: false, path: file.name, content: await file.text() };
  },
  async openPresentation() {
    throw new Error('A separate output window requires the Freeform desktop app.');
  },
  async closePresentation() {
    // Browser presentation uses the current tab instead of a separate window.
  },
  async getPresentationProject() {
    return null;
  },
  async syncPresentation() {
    // Browser presentation already shares the current renderer state.
  },
  onPresentationProject() {
    return () => undefined;
  },
  async syncPresentationMedia() {
    // Browser presentation already shares the current media elements.
  },
  onPresentationMedia() {
    return () => undefined;
  },
  onPresentationClosed() {
    return () => undefined;
  },
  async setFullscreen(value: boolean) {
    if (value && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else if (!value && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  },
  async getWindowPlacement() {
    return null;
  },
  async setWindowPlacement() {
    return null;
  },
  async setWindowLocked() {
    // Browser previews do not control an operating-system window.
  },
  async setTransparency() {
    throw new Error('True desktop transparency requires the Freeform Windows app.');
  },
  async beginWindowResize() {
    return false;
  },
  async updateWindowResize() {
    return null;
  },
  async endWindowResize() {
    // Browser previews use their ordinary operating-system window controls.
  },
};

export const runtime: FreeformBridge = window.freeform ?? browserBridge;

async function captureDisplay(prepare: () => Promise<void>, withAudio: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Display capture is not available in this runtime.');
  }
  await prepare();
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 60, max: 60 },
    },
    audio: withAudio,
  });
}

export function captureDesktop(sourceId: string, withAudio: boolean): Promise<MediaStream> {
  return captureDisplay(() => runtime.prepareDesktopCapture(sourceId, withAudio), withAudio);
}

export async function listCaptureDevices(requestPermission = false): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error('Capture devices are not available in this runtime.');
  }
  if (requestPermission) {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

export async function captureDevice(deviceId: string, withAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, max: 60 },
    },
    audio: withAudio,
  });
}

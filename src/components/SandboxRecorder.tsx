import { AudioLines, Circle, FolderOpen, LoaderCircle, Save, Square, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { captureProvider, runtime } from '../lib/runtime';
import type { RecordingInfo } from '../types';

type RecorderPhase = 'idle' | 'starting' | 'recording' | 'stopping' | 'saved' | 'error';
type PlayerAudioState = 'pending' | 'connected' | 'unavailable';

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function elapsedLabel(startedAt: number | null, now: number) {
  if (!startedAt) return '00:00';
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SandboxRecorder({ captureId, label, disabled = false }: {
  captureId: string;
  label: string;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [directory, setDirectory] = useState('Loading recording folder…');
  const [saved, setSaved] = useState<RecordingInfo | null>(null);
  const [error, setError] = useState('');
  const [playerAudio, setPlayerAudio] = useState<PlayerAudioState>('pending');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestStopRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void runtime.getRecordingState().then((state) => {
      if (mountedRef.current) setDirectory(state.directory);
    }).catch((cause) => {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'The recording folder is unavailable.');
    });
    return () => {
      mountedRef.current = false;
      if (requestStopRef.current) requestStopRef.current();
      else streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  const chooseDirectory = async () => {
    setError('');
    try {
      const state = await runtime.chooseRecordingDirectory();
      setDirectory(state.directory);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The recording folder could not be changed.');
    }
  };

  const start = async () => {
    if (disabled || phase === 'starting' || phase === 'recording' || phase === 'stopping') return;
    if (!runtime.isDesktop || typeof MediaRecorder === 'undefined') {
      setError('Player-window recording is available only in the Freeform desktop app.');
      return;
    }
    setPhase('starting');
    setError('');
    setSaved(null);
    setPlayerAudio('pending');
    let stream: MediaStream | null = null;
    let recordingId = '';
    try {
      // Recording always requests the authorized player frame's own audio.
      // It never selects the system loopback or another application's sound.
      stream = await captureProvider(captureId, true);
      setPlayerAudio(stream.getAudioTracks().length ? 'connected' : 'unavailable');
      streamRef.current = stream;
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      const recording = await runtime.startRecording({ label });
      recordingId = recording.id;
      if (!mountedRef.current) {
        await runtime.discardRecording(recordingId).catch(() => undefined);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
      recorderRef.current = recorder;
      let writes: Promise<unknown> = Promise.resolve();
      let finalized = false;
      const finalize = async () => {
        if (finalized) return;
        finalized = true;
        try {
          await writes;
          const result = await runtime.finishRecording(recordingId);
          if (mountedRef.current) {
            setSaved(result);
            setPhase('saved');
            setDirectory(recording.directory);
          }
        } catch (cause) {
          await runtime.discardRecording(recordingId).catch(() => undefined);
          if (mountedRef.current) {
            setError(cause instanceof Error ? cause.message : 'The recording could not be finalized.');
            setPhase('error');
          }
        } finally {
          stream?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          requestStopRef.current = null;
          if (mountedRef.current) setStartedAt(null);
        }
      };
      const requestStop = () => {
        if (recorder.state !== 'inactive') {
          if (mountedRef.current) setPhase('stopping');
          recorder.stop();
        }
      };
      requestStopRef.current = requestStop;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        writes = writes.then(async () => {
          const chunk = await event.data.arrayBuffer();
          await runtime.appendRecording(recordingId, chunk);
        });
      };
      recorder.onerror = () => {
        if (mountedRef.current) setError('The system recorder reported an error. Stop to finalize any readable data.');
      };
      recorder.onstop = () => { void finalize(); };
      stream.getTracks().forEach((track) => track.addEventListener('ended', requestStop, { once: true }));
      recorder.start(1000);
      setStartedAt(Date.now());
      setNow(Date.now());
      setPhase('recording');
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      requestStopRef.current = null;
      if (recordingId) await runtime.discardRecording(recordingId).catch(() => undefined);
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : 'The player-window recording could not be started.');
        setPhase('error');
      }
    }
  };

  const stop = () => {
    setPhase('stopping');
    requestStopRef.current?.();
  };

  const recording = phase === 'recording' || phase === 'stopping';
  return (
    <section className="sandbox-recorder" aria-label="Player window recording">
      <div className="sandbox-recorder-heading">
        <Circle size={12} fill={recording ? 'currentColor' : 'none'} />
        <strong>Screen recording</strong>
        <span>{phase === 'recording' ? `REC ${elapsedLabel(startedAt, now)}` : phase.toUpperCase()}</span>
      </div>
      <p>Records the visible player window and this player’s own audio—not system-wide computer audio. Start playback before recording. Stop manually, or close the player window to stop and save.</p>
      {recording && (
        <small className={`provider-capture-unavailable recording-audio-${playerAudio}`} role="status">
          {playerAudio === 'connected' ? <AudioLines size={12} /> : <VolumeX size={12} />}
          {playerAudio === 'connected' ? 'Player audio connected' : 'No player audio track available; recording video only'}
        </small>
      )}
      <div className="recording-directory"><span>SAVE FOLDER</span><code>{directory}</code></div>
      <div className="sandbox-recorder-actions">
        <button type="button" className="button subtle" disabled={recording || phase === 'starting' || !runtime.isDesktop} onClick={() => void chooseDirectory()}><FolderOpen size={13} />Choose folder</button>
        {recording ? (
          <button type="button" className="button danger" disabled={phase === 'stopping'} onClick={stop}><Square size={13} fill="currentColor" />{phase === 'stopping' ? 'Saving…' : 'Stop & save'}</button>
        ) : (
          <button type="button" className="button primary" disabled={disabled || phase === 'starting' || !runtime.isDesktop} onClick={() => void start()}>{phase === 'starting' ? <LoaderCircle size={13} className="spin" /> : <Circle size={13} fill="currentColor" />}{phase === 'starting' ? 'Starting…' : 'Record window'}</button>
        )}
      </div>
      {!runtime.isDesktop && <small className="provider-capture-unavailable">Recording is available only in the desktop app.</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <div className="recording-saved"><Save size={13} /><div><strong>Recording saved</strong><code>{saved.path}</code><span>{(saved.bytes / 1024 / 1024).toFixed(2)} MB · Open it later from Sources → Recordings.</span></div></div>}
    </section>
  );
}

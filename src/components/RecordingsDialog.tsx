import { FolderOpen, HardDrive, Plus, RefreshCw, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { runtime } from '../lib/runtime';
import { sourceFromFile } from '../lib/sourceActions';
import { useWorkspace } from '../store/useWorkspace';
import type { RecordingInfo } from '../types';
import { Dialog } from './Dialog';

export function RecordingsDialog({ onClose }: { onClose: () => void }) {
  const registerSources = useWorkspace((state) => state.registerSources);
  const addPlayer = useWorkspace((state) => state.addPlayer);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [directory, setDirectory] = useState('');
  const [recordings, setRecordings] = useState<RecordingInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!runtime.isDesktop) return;
    setLoading(true);
    setError('');
    try {
      const result = await runtime.listRecordings();
      setDirectory(result.directory);
      setRecordings(result.recordings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recordings could not be listed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseDirectory = async () => {
    try {
      const state = await runtime.chooseRecordingDirectory();
      setDirectory(state.directory);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The recording folder could not be changed.');
    }
  };

  const openRecording = async (recording: RecordingInfo) => {
    setOpening(recording.name);
    setError('');
    try {
      const file = await runtime.openRecording(recording.name);
      const source = sourceFromFile(file);
      registerSources([source]);
      addPlayer(source.id);
      pushToast({ title: 'Recording added to a new player', detail: source.name, tone: 'success' });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The recording could not be opened.');
    } finally {
      setOpening('');
    }
  };

  return (
    <Dialog title="Recording library" eyebrow="PLAYER CAPTURE / WEBM" onClose={onClose}>
      <div className="recording-library-toolbar">
        <button type="button" className="button subtle" disabled={!runtime.isDesktop} onClick={() => void chooseDirectory()}><FolderOpen size={14} />Choose save folder</button>
        <button type="button" className="button subtle" disabled={!runtime.isDesktop} onClick={() => void runtime.showRecordingFolder().catch((cause) => setError(cause instanceof Error ? cause.message : 'The folder could not be opened.'))}><HardDrive size={14} />Open folder</button>
        <button type="button" className="icon-button" aria-label="Refresh recordings" disabled={loading || !runtime.isDesktop} onClick={() => void refresh()}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
      </div>
      <div className="recording-library-directory"><span>SAVE FOLDER</span><code>{directory || 'Desktop app required'}</code></div>
      {!runtime.isDesktop && <p className="form-help">Player-window recording and the recording library require the Freeform desktop app. Existing local WebM files can still be added through Files.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {runtime.isDesktop && !loading && !recordings.length && <div className="recording-library-empty"><Video size={27} /><strong>No recordings in this folder</strong><p>Open a provider player window, choose Record window, then Stop & save.</p></div>}
      <div className="recording-library-list">
        {recordings.map((recording) => (
          <article key={recording.path} className="recording-library-row">
            <Video size={19} />
            <div><strong>{recording.name.replace(/\.webm$/i, '')}</strong><span>{(recording.bytes / 1024 / 1024).toFixed(2)} MB{recording.modifiedAt ? ` · ${new Date(recording.modifiedAt).toLocaleString()}` : ''}</span></div>
            <button type="button" className="button primary" disabled={Boolean(opening)} onClick={() => void openRecording(recording)}><Plus size={13} />{opening === recording.name ? 'Opening…' : 'Add to player'}</button>
          </article>
        ))}
      </div>
      <p className="form-help">Recordings are ordinary local WebM files. Adding one creates a native video source that can be warped, adjusted, saved, and reopened like other local media.</p>
    </Dialog>
  );
}

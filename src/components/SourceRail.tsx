import {
  Camera,
  Eye,
  EyeOff,
  FilePlus2,
  Film,
  Grid2X2,
  Image,
  Link2,
  LoaderCircle,
  Lock,
  Monitor,
  Music2,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { TEST_SOURCE } from '../data/defaults';
import { sourceTypeLabel } from '../lib/format';
import { listCaptureDevices, runtime } from '../lib/runtime';
import { connectLiveSource, sourceFromFile } from '../lib/sourceActions';
import { useWorkspace } from '../store/useWorkspace';
import type { MediaSource, MediaType } from '../types';
import { Dialog } from './Dialog';
import { useMedia } from './MediaContext';

function SourceIcon({ source, size = 15 }: { source: MediaSource; size?: number }) {
  if (source.kind === 'desktop') return <Monitor size={size} />;
  if (source.kind === 'device') return <Camera size={size} />;
  if (source.kind === 'stream') return <Radio size={size} />;
  if (source.kind === 'test') return <Grid2X2 size={size} />;
  if (source.mediaType === 'audio') return <Music2 size={size} />;
  if (source.mediaType === 'image') return <Image size={size} />;
  return <Film size={size} />;
}

type DialogName = 'stream' | 'desktop' | 'device' | null;

export function SourceRail() {
  const sources = useWorkspace((state) => state.sources);
  const players = useWorkspace((state) => state.players);
  const groups = useWorkspace((state) => state.groups);
  const activeId = useWorkspace((state) => state.activeId);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const registerSources = useWorkspace((state) => state.registerSources);
  const updateSource = useWorkspace((state) => state.updateSource);
  const removeSource = useWorkspace((state) => state.removeSource);
  const assignSource = useWorkspace((state) => state.assignSource);
  const addPlayer = useWorkspace((state) => state.addPlayer);
  const selectPlayer = useWorkspace((state) => state.selectPlayer);
  const updatePlayer = useWorkspace((state) => state.updatePlayer);
  const createGroup = useWorkspace((state) => state.createGroup);
  const pushToast = useWorkspace((state) => state.pushToast);
  const { setStream, stopStream } = useMedia();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [streamName, setStreamName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamType, setStreamType] = useState<Exclude<MediaType, 'capture' | 'test' | 'image'>>('video');
  const [desktopSources, setDesktopSources] = useState<Awaited<ReturnType<typeof runtime.listDesktopSources>>>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [withAudio, setWithAudio] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const active = players.find((player) => player.id === activeId);

  const assign = (sourceId: string) => {
    if (activeId) assignSource(activeId, sourceId);
    else addPlayer(sourceId);
  };

  const addFiles = async () => {
    try {
      const files = await runtime.openLocalFiles();
      if (!files.length) return;
      const incoming = files.map(sourceFromFile);
      registerSources(incoming);
      assign(incoming[0].id);
      pushToast({
        title: `${incoming.length} ${incoming.length === 1 ? 'source' : 'sources'} added`,
        detail: incoming.length > 1 ? `${incoming[0].name} is assigned to the active player.` : incoming[0].name,
        tone: 'success',
      });
    } catch (error) {
      pushToast({ title: 'Files could not be added', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };

  const openDesktop = async () => {
    setDialog('desktop');
    setDialogError('');
    setWithAudio(false);
    if (!runtime.isDesktop) return;
    setLoading(true);
    try {
      setDesktopSources(await runtime.listDesktopSources());
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Desktop sources could not be enumerated.');
    } finally {
      setLoading(false);
    }
  };

  const openDevices = async () => {
    setDialog('device');
    setDialogError('');
    setWithAudio(false);
    setLoading(true);
    try {
      setDevices(await listCaptureDevices(true));
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Capture devices could not be opened.');
    } finally {
      setLoading(false);
    }
  };

  const startLive = async (source: MediaSource) => {
    registerSources([source]);
    assign(source.id);
    setDialog(null);
    try {
      const stream = await connectLiveSource(source, withAudio, { setStream, updateSource });
      const label = stream.getVideoTracks()[0]?.label;
      if (label && source.desktopId === 'system-picker') updateSource(source.id, { name: label });
      pushToast({ title: 'Live source connected', detail: source.name, tone: 'success' });
    } catch (error) {
      pushToast({
        title: 'Capture did not start',
        detail: error instanceof Error ? error.message : 'Check permission and try again.',
        tone: 'warning',
      });
    }
  };

  const chooseDesktop = (id: string, name: string, thumbnail?: string) => {
    void startLive({
      id: crypto.randomUUID(),
      kind: 'desktop',
      mediaType: 'capture',
      name,
      desktopId: id,
      live: true,
      connected: false,
      detail: thumbnail ? 'Window or display capture' : 'Use the operating system source picker',
    });
  };

  const chooseDevice = (device: MediaDeviceInfo) => {
    void startLive({
      id: crypto.randomUUID(),
      kind: 'device',
      mediaType: 'capture',
      name: device.label || 'Capture device',
      deviceId: device.deviceId,
      live: true,
      connected: false,
      detail: 'Camera or video capture device',
    });
  };

  const addStream = (event: FormEvent) => {
    event.preventDefault();
    try {
      const url = new URL(streamUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS media URL.');
      const source: MediaSource = {
        id: crypto.randomUUID(),
        kind: 'stream',
        mediaType: streamType,
        name: streamName.trim() || url.hostname,
        uri: url.toString(),
        live: false,
        connected: true,
        detail: /\.m3u8(?:$|[?#])/i.test(url.toString()) ? 'HLS network stream' : 'Direct network media',
      };
      registerSources([source]);
      assign(source.id);
      setStreamUrl('');
      setStreamName('');
      setDialog(null);
      pushToast({ title: 'Network source added', detail: source.name, tone: 'success' });
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Enter a valid media URL.');
    }
  };

  const reconnect = async (source: MediaSource) => {
    try {
      if (source.live) {
        await connectLiveSource(source, source.withAudio ?? false, { setStream, updateSource });
      } else if (source.kind === 'file') {
        if (source.path && runtime.isDesktop) {
          const urls = await runtime.authorizeMedia([source.path]);
          if (!urls[source.path]) throw new Error('The file is unavailable at its saved path. Choose a replacement.');
          updateSource(source.id, { uri: urls[source.path], connected: true, detail: source.path });
        } else {
          const [file] = await runtime.openLocalFiles();
          if (!file) return;
          updateSource(source.id, {
            name: file.name,
            uri: file.url,
            path: file.path,
            mime: file.mime,
            mediaType: file.mediaType,
            connected: true,
            detail: file.path ?? 'Browser session file',
          });
        }
      } else {
        updateSource(source.id, { connected: true, detail: undefined });
      }
      pushToast({ title: 'Source reconnected', detail: source.name, tone: 'success' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The source could not be reconnected.';
      updateSource(source.id, { connected: false, detail });
      pushToast({ title: 'Reconnection failed', detail, tone: 'error' });
    }
  };

  return (
    <aside className="source-rail">
      <section className="rail-section sources-section">
        <div className="section-heading">
          <span>SOURCES</span>
          <span className="count-badge">{sources.length}</span>
        </div>
        <div className="source-actions">
          <button onClick={() => void addFiles()}><FilePlus2 size={15} /><span>Files</span></button>
          <button onClick={() => { setDialogError(''); setDialog('stream'); }}><Radio size={15} /><span>Stream</span></button>
          <button onClick={() => void openDesktop()}><Monitor size={15} /><span>Screen</span></button>
          <button onClick={() => void openDevices()}><Camera size={15} /><span>Device</span></button>
        </div>
        <div className="source-list scrollable">
          {sources.map((source) => {
            const assigned = active?.sourceId === source.id;
            return (
              <div
                key={source.id}
                className={`source-row ${assigned ? 'is-assigned' : ''}`}
                onClick={() => assign(source.id)}
                title={`Assign ${source.name} to the active player`}
              >
                <span className={`source-status ${source.connected ? 'connected' : 'disconnected'}`} />
                <span className="source-icon"><SourceIcon source={source} /></span>
                <span className="source-copy">
                  <strong>{source.name}</strong>
                  <small>{sourceTypeLabel(source.kind)} · {source.live ? 'LIVE' : source.mediaType.toUpperCase()}</small>
                </span>
                <span className="row-actions">
                  {(!source.connected || source.live) && (
                    <button
                      className="icon-button tiny"
                      title={source.live ? 'Start or reconnect capture' : 'Reconnect or replace media'}
                      onClick={(event) => { event.stopPropagation(); void reconnect(source); }}
                    ><RefreshCw size={12} /></button>
                  )}
                  {source.id !== TEST_SOURCE.id && (
                    <button
                      className="icon-button tiny danger-hover"
                      title="Remove source"
                      onClick={(event) => {
                        event.stopPropagation();
                        stopStream(source.id);
                        removeSource(source.id);
                      }}
                    ><Trash2 size={12} /></button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="rail-note">Select a source to assign it. Grouped players receive it together.</div>
      </section>

      <section className="rail-section players-section">
        <div className="section-heading">
          <span>PLAYERS</span>
          <button className="icon-button tiny" title="Add player" onClick={() => addPlayer(active?.sourceId)}><Plus size={14} /></button>
        </div>
        <div className="player-list scrollable">
          {players.map((player, index) => {
            const source = sources.find((candidate) => candidate.id === player.sourceId);
            const group = groups.find((candidate) => candidate.id === player.groupId);
            return (
              <div
                key={player.id}
                className={`player-row ${activeId === player.id ? 'is-active' : ''} ${selectedIds.includes(player.id) ? 'is-selected' : ''}`}
                onClick={(event) => selectPlayer(player.id, event.shiftKey)}
              >
                <span className="player-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="player-copy">
                  <strong>{player.name}</strong>
                  <small>{group ? `${group.name} / ` : ''}{source?.name ?? 'Missing source'}</small>
                </span>
                <button
                  className="icon-button tiny"
                  title={player.visible ? 'Hide player' : 'Show player'}
                  onClick={(event) => { event.stopPropagation(); updatePlayer(player.id, { visible: !player.visible }); }}
                >{player.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <button
                  className="icon-button tiny"
                  title={player.locked ? 'Unlock geometry' : 'Lock geometry'}
                  onClick={(event) => { event.stopPropagation(); updatePlayer(player.id, { locked: !player.locked }); }}
                >{player.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
              </div>
            );
          })}
        </div>
        <div className="player-actions">
          <button className="button subtle" onClick={() => addPlayer(active?.sourceId)}><Plus size={14} />Add player</button>
          <button
            className="button subtle"
            disabled={selectedIds.length < 2}
            title={selectedIds.length < 2 ? 'Shift-click at least two players' : 'Link selected players'}
            onClick={() => {
              const id = createGroup(selectedIds);
              if (id) pushToast({ title: 'Players linked', detail: 'Source and transport are synchronized.', tone: 'success' });
            }}
          ><Link2 size={14} />Link {selectedIds.length > 1 ? selectedIds.length : ''}</button>
        </div>
        <div className="rail-note"><Users size={11} /> Shift-click players to select a subset.</div>
      </section>

      {dialog === 'stream' && (
        <Dialog title="Add network media" eyebrow="DIRECT URL / HLS" onClose={() => setDialog(null)}>
          <form onSubmit={addStream} className="dialog-form">
            <label className="field-label">Display name<input value={streamName} onChange={(event) => setStreamName(event.target.value)} placeholder="Optional source name" /></label>
            <label className="field-label">Media URL<input autoFocus required type="url" value={streamUrl} onChange={(event) => setStreamUrl(event.target.value)} placeholder="https://example.com/video.m3u8" /></label>
            <label className="field-label">Playback surface<select value={streamType} onChange={(event) => setStreamType(event.target.value as typeof streamType)}><option value="video">Video</option><option value="audio">Audio with waveform surface</option></select></label>
            <p className="form-help">HLS (.m3u8) is supported where the stream permits cross-origin playback. DRM-protected services and unsupported codecs are not decoded by Freeform.</p>
            {dialogError && <p className="form-error">{dialogError}</p>}
            <div className="dialog-actions"><button type="button" className="button subtle" onClick={() => setDialog(null)}>Cancel</button><button className="button primary" type="submit">Add stream</button></div>
          </form>
        </Dialog>
      )}

      {dialog === 'desktop' && (
        <Dialog title="Capture a game, app, or display" eyebrow="EXTERNAL / NO INJECTION" onClose={() => setDialog(null)}>
          <p className="form-help">Choose a running window or an entire screen. Freeform captures it externally; it does not modify the game or application.</p>
          <label className="check-field"><input type="checkbox" checked={withAudio} onChange={(event) => setWithAudio(event.target.checked)} /> Request system audio when supported</label>
          {loading && <div className="dialog-loading"><LoaderCircle className="spin" size={20} />Enumerating windows and displays…</div>}
          {dialogError && <p className="form-error">{dialogError}</p>}
          {!loading && !runtime.isDesktop && (
            <button className="system-picker" onClick={() => chooseDesktop('system-picker', 'System display / window')}><Monitor size={28} /><strong>Open the system source picker</strong><span>The browser will ask which screen, window, or tab to share.</span></button>
          )}
          {!loading && runtime.isDesktop && (
            <div className="desktop-grid">
              {desktopSources.map((source) => (
                <button key={source.id} className="desktop-source" onClick={() => chooseDesktop(source.id, source.name, source.thumbnail)}>
                  <img src={source.thumbnail} alt="" />
                  <span>{source.name}</span>
                </button>
              ))}
            </div>
          )}
          {!loading && runtime.isDesktop && !desktopSources.length && !dialogError && <p className="form-help">No capturable windows or displays were found.</p>}
        </Dialog>
      )}

      {dialog === 'device' && (
        <Dialog title="Add a capture device" eyebrow="CAMERA / VIDEO INPUT" onClose={() => setDialog(null)}>
          <p className="form-help">Camera access is requested only after you open this panel. Audio is optional and can be changed when reconnecting.</p>
          <label className="check-field"><input type="checkbox" checked={withAudio} onChange={(event) => setWithAudio(event.target.checked)} /> Include device audio</label>
          {loading && <div className="dialog-loading"><LoaderCircle className="spin" size={20} />Requesting access and finding devices…</div>}
          {dialogError && <p className="form-error">{dialogError}</p>}
          <div className="device-list">
            {devices.map((device) => <button key={device.deviceId} onClick={() => chooseDevice(device)}><Camera size={17} /><span>{device.label || `Camera ${device.deviceId.slice(0, 8)}`}</span><Plus size={15} /></button>)}
          </div>
          {!loading && !devices.length && !dialogError && <p className="form-help">No video input devices were reported.</p>}
        </Dialog>
      )}
    </aside>
  );
}

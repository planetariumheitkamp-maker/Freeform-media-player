import Hls from 'hls.js';
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url';
import { Check, CircleAlert, Globe2, LoaderCircle, MonitorPlay, Play, Plus, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { suggestCustomProviderUrlTemplates } from '../lib/customProviderPlayback';
import { OPEN_PROVIDER_DASHBOARD_EVENT, saveCustomProvider } from '../lib/customProviders';
import { sourceFromCustomMedia, validateCustomSourceUrl } from '../lib/customSource';
import { runtime } from '../lib/runtime';
import { useWorkspace } from '../store/useWorkspace';
import type { CustomSourceVerification } from '../types';
import { Dialog } from './Dialog';

function CustomMediaPreview({ verification, onReady, onError }: {
  verification: CustomSourceVerification;
  onReady: () => void;
  onError: (detail: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  const isHls = /mpegurl|\.m3u8(?:$|[?#])/i.test(`${verification.contentType} ${verification.finalUrl}`);
  useEffect(() => {
    const video = ref.current;
    if (!video || !isHls || !Hls.isSupported()) return;
    const hls = new Hls({ enableWorker: true, workerPath: hlsWorkerUrl, backBufferLength: 30 });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) errorRef.current(`HLS preview failed: ${data.details}. Check CORS, the manifest, and codec support.`);
    });
    hls.loadSource(verification.finalUrl);
    hls.attachMedia(video);
    return () => hls.destroy();
  }, [isHls, verification.finalUrl]);

  return (
    <video
      ref={ref}
      src={isHls ? undefined : verification.finalUrl}
      crossOrigin="anonymous"
      controls
      playsInline
      preload="auto"
      aria-label="Custom media verification preview"
      onLoadedData={onReady}
      onCanPlay={onReady}
      onError={() => onError('The media preview failed. Check CORS, the direct media URL, and whether Chromium supports this codec.')}
    />
  );
}

export function CustomSourceDialog({ onClose }: { onClose: () => void }) {
  const registerSources = useWorkspace((state) => state.registerSources);
  const addPlayer = useWorkspace((state) => state.addPlayer);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [kind, setKind] = useState<'media' | 'web-player'>('media');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [verification, setVerification] = useState<CustomSourceVerification | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [movieUrlTemplate, setMovieUrlTemplate] = useState('');
  const [episodeUrlTemplate, setEpisodeUrlTemplate] = useState('');
  const [busy, setBusy] = useState<'verify' | 'add' | null>(null);
  const [error, setError] = useState('');
  const operationSequence = useRef(0);

  const resetVerification = () => {
    operationSequence.current += 1;
    setVerification(null);
    setPreviewReady(false);
    setConfirmed(false);
    setMovieUrlTemplate('');
    setEpisodeUrlTemplate('');
    setBusy(null);
    setError('');
  };

  const verify = async () => {
    resetVerification();
    const sequence = ++operationSequence.current;
    setBusy('verify');
    try {
      validateCustomSourceUrl(url);
      const result = await runtime.verifyCustomSource({ kind, url: url.trim() });
      if (sequence !== operationSequence.current) return;
      setVerification(result);
      if (result.kind === 'web-player') {
        const suggestions = suggestCustomProviderUrlTemplates(result.finalUrl);
        setMovieUrlTemplate(suggestions.movieUrlTemplate);
        setEpisodeUrlTemplate(suggestions.episodeUrlTemplate);
      }
      setPreviewKey((value) => value + 1);
    } catch (cause) {
      if (sequence === operationSequence.current) {
        setError(cause instanceof Error ? cause.message : 'The custom source could not be verified.');
      }
    } finally {
      if (sequence === operationSequence.current) setBusy(null);
    }
  };

  const previewError = useCallback((detail: string) => {
    setPreviewReady(false);
    setConfirmed(false);
    setError(detail);
  }, []);

  const closeDialog = () => {
    operationSequence.current += 1;
    onClose();
  };

  const addMedia = () => {
    if (!verification || !previewReady || !confirmed) return;
    setBusy('add');
    setError('');
    try {
      const source = sourceFromCustomMedia(verification, label, verification.mediaType === 'audio' ? 'audio' : 'video');
      registerSources([source]);
      addPlayer(source.id);
      pushToast({ title: 'Verified custom media added', detail: `${source.name} · Native mesh playback`, tone: 'success' });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The custom media could not be added.');
    } finally {
      setBusy(null);
    }
  };

  const addProvider = () => {
    if (!verification || !previewReady || !confirmed) return;
    setBusy('add');
    setError('');
    try {
      const { provider, created } = saveCustomProvider(label, verification, undefined, {
        movieUrlTemplate,
        episodeUrlTemplate,
      });
      pushToast({
        title: created ? 'Embedded player added to Providers' : 'Embedded player updated',
        detail: `${provider.name} · Use the shared preview, capture, mesh, and recording controls.`,
        tone: 'success',
      });
      onClose();
      window.dispatchEvent(new CustomEvent(OPEN_PROVIDER_DASHBOARD_EVENT, { detail: { providerId: provider.id } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The embedded player could not be added to Providers.');
      setBusy(null);
    }
  };

  const ready = Boolean(verification && previewReady && confirmed);
  return (
    <Dialog title="Verify a custom source" eyebrow="HTTPS / TECHNICAL + MANUAL CHECK" onClose={closeDialog}>
      <div className="custom-source-dialog">
        <div className="custom-source-kind" role="group" aria-label="Custom source type">
          <button type="button" className={kind === 'media' ? 'active' : ''} aria-pressed={kind === 'media'} onClick={() => { setKind('media'); resetVerification(); }}><Play size={14} />Direct media / HLS</button>
          <button type="button" className={kind === 'web-player' ? 'active' : ''} aria-pressed={kind === 'web-player'} onClick={() => { setKind('web-player'); resetVerification(); }}><Globe2 size={14} />External web player</button>
        </div>
        <label className="field-label">Display name<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Optional provider or player name" /></label>
        <label className="field-label">{kind === 'media' ? 'Direct video, audio, or HLS URL' : 'External player page URL'}
          <input type="url" required value={url} onChange={(event) => { setUrl(event.target.value); resetVerification(); }} placeholder={kind === 'media' ? 'https://media.example.com/video.m3u8' : 'https://player.example.com/embed'} />
        </label>
        <p className="form-help">Public HTTPS only. Credentials, custom ports, localhost, and private-network addresses are blocked. Verification performs a small ranged request rather than downloading the media.</p>
        <button type="button" className="button primary custom-verify-button" disabled={!url.trim() || busy !== null} onClick={() => void verify()}>{busy === 'verify' ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}{busy === 'verify' ? 'Checking source…' : 'Verify connection'}</button>

        {error && <div className="provider-form-error" role="alert"><CircleAlert size={15} /><span>{error}</span></div>}
        {verification && (
          <section className="custom-verification-result" aria-label="Technical verification result">
            <div className="custom-verification-title"><Check size={15} /><strong>Technical check passed</strong><span>HTTP {verification.status}</span></div>
            <dl><div><dt>Content type</dt><dd>{verification.contentType}</dd></div><div><dt>Final origin</dt><dd>{verification.finalOrigin}</dd></div><div><dt>CORS header</dt><dd>{verification.cors || 'Not reported — preview required'}</dd></div></dl>
            {verification.warnings.map((warning) => <p key={warning} className="custom-verification-warning">{warning}</p>)}
          </section>
        )}

        {verification && (
          <section className="custom-preview-section" aria-label="Manual source preview">
            <div className="custom-preview-heading"><span>MANUAL PREVIEW</span><strong>{previewReady ? 'Preview loaded — inspect it before continuing' : 'Loading preview…'}</strong></div>
            <div className="custom-preview-frame">
              {verification.kind === 'media' ? (
                <CustomMediaPreview key={previewKey} verification={verification} onReady={() => { setPreviewReady(true); setError(''); }} onError={previewError} />
              ) : (
                <iframe
                  key={previewKey}
                  src={verification.finalUrl}
                  title="Custom web-player verification preview"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  onLoad={() => { setPreviewReady(true); setError(''); }}
                />
              )}
            </div>
            <label className="provider-authorization custom-confirmation">
              <input type="checkbox" checked={confirmed} disabled={!previewReady} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>I inspected the preview, confirmed it is the expected {kind === 'media' ? 'media' : 'player'}, and am authorized to use it.</span>
            </label>
          </section>
        )}

        {verification?.kind === 'media' && (
          <button type="button" className="button primary custom-add-button" disabled={!ready || busy !== null} onClick={addMedia}><Plus size={14} />Add verified media to a new mesh player</button>
        )}

        {verification?.kind === 'web-player' && (
          <section className="provider-capture-prototype custom-capture-section" aria-label="Save embedded player to Providers">
            <div className="provider-capture-heading"><MonitorPlay size={15} /><strong>Provider dashboard</strong><span>VERIFIED CUSTOM PLAYER</span></div>
            <p>Save this entry in the Catalog provider dropdown. It will use the same dedicated-window playback, capture, mesh, and source-audio recording workflow as the other providers. No mesh source is created yet.</p>
            <label className="field-label">Movie URL pattern
              <input type="text" required value={movieUrlTemplate} onChange={(event) => setMovieUrlTemplate(event.target.value)} placeholder="https://player.example.com/embed/movie/{tmdb}" spellCheck={false} />
            </label>
            <label className="field-label">Episode URL pattern <span>(optional — enables Series)</span>
              <input type="text" value={episodeUrlTemplate} onChange={(event) => setEpisodeUrlTemplate(event.target.value)} placeholder="https://player.example.com/embed/tv/{tmdb}/{season}/{episode}" spellCheck={false} />
            </label>
            <p className="form-help">Review the suggested routes against your provider’s documentation. Movie patterns require <code>{'{tmdb}'}</code>. Episode patterns require <code>{'{tmdb}'}</code>, <code>{'{season}'}</code>, and <code>{'{episode}'}</code>; leave this field blank if the provider supports movies only. Patterns must use the verified player origin. Only the sample page was verified—generated movie and episode pages are not individually verified.</p>
            <button type="button" className="button primary custom-add-button" disabled={!ready || !movieUrlTemplate.trim() || busy !== null} onClick={addProvider}><Plus size={14} />{busy === 'add' ? 'Adding to Providers…' : 'Add to provider dashboard'}</button>
          </section>
        )}
        <div className="provider-rights-note"><ShieldCheck size={16} /><p>A successful check confirms reachability and technical compatibility only. It does not verify content rights, safety of every script on the page, DRM support, or future availability.</p></div>
      </div>
    </Dialog>
  );
}

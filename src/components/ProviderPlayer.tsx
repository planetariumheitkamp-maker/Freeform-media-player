import { Check, CircleAlert, ExternalLink, Film, MonitorPlay, Plus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { buildCustomProviderPlaybackUrl } from '../lib/customProviderPlayback';
import { validateCustomSourceUrl } from '../lib/customSource';
import { buildProviderPlaybackUrl } from '../lib/providerPlayback';
import { loadProviderAdBlockSettings, saveProviderAdBlockSettings } from '../lib/providerAdBlockSettings';
import { runtime } from '../lib/runtime';
import type { ProviderCaptureSourceInput } from '../lib/sourceActions';
import type { CatalogMediaKind, ProviderAdBlockSettings, ProviderCaptureWindowInfo, ProviderDefinition } from '../types';
import { ProviderAdBlockControl } from './ProviderAdBlockControl';
import { SandboxRecorder } from './SandboxRecorder';

interface LoadedEmbed {
  key: number;
  url: string;
  label: string;
}

interface ProviderPlayerProps {
  provider: ProviderDefinition;
  onAddCapture: (input: ProviderCaptureSourceInput & { withAudio: boolean }) => Promise<void>;
}

export function ProviderPlayer({ provider, onAddCapture }: ProviderPlayerProps) {
  const [mediaKind, setMediaKind] = useState<CatalogMediaKind>('movie');
  const [tmdbId, setTmdbId] = useState('');
  const [seasonNumber, setSeasonNumber] = useState('1');
  const [episodeNumber, setEpisodeNumber] = useState('1');
  const [playerVariant, setPlayerVariant] = useState('default');
  const [authorized, setAuthorized] = useState(false);
  const [loaded, setLoaded] = useState<LoadedEmbed | null>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [error, setError] = useState('');
  const [captureWindow, setCaptureWindow] = useState<ProviderCaptureWindowInfo | null>(null);
  const [captureBusy, setCaptureBusy] = useState<'open' | 'add' | null>(null);
  const [captureError, setCaptureError] = useState('');
  const [captureAudio, setCaptureAudio] = useState(false);
  const [adBlockSettings, setAdBlockSettings] = useState<ProviderAdBlockSettings>(() => loadProviderAdBlockSettings());
  const loadSequence = useRef(0);
  const isCustom = Boolean(provider.customUrl);
  const hasCustomTemplates = isCustom && Boolean(provider.customMovieUrlTemplate);

  const saveAdBlock = async (settings: ProviderAdBlockSettings) => {
    const applied = runtime.isDesktop ? await runtime.setProviderAdBlockSettings(settings) : settings;
    setAdBlockSettings(saveProviderAdBlockSettings(applied));
  };

  useEffect(() => runtime.onProviderCaptureState((state) => {
    if (captureWindow?.id !== state.id) return;
    if (state.status === 'ready') {
      setCaptureError('');
      setFrameLoaded(true);
    }
    if (state.status === 'closed') {
      setCaptureWindow(null);
      setFrameLoaded(false);
    }
    if (state.status === 'error') setCaptureError(state.detail ?? 'The provider window reported an error.');
  }), [captureWindow]);

  const clearPlayback = () => {
    if (captureWindow) void runtime.closeProviderCapture(captureWindow.id).catch(() => undefined);
    setCaptureWindow(null);
    setCaptureError('');
    setLoaded(null);
    setFrameLoaded(false);
    setError('');
  };

  useEffect(() => {
    clearPlayback();
    setMediaKind('movie');
    setTmdbId('');
    setSeasonNumber('1');
    setEpisodeNumber('1');
    setPlayerVariant('default');
    setAuthorized(false);
    setCaptureAudio(false);
    setCaptureBusy(null);
    // Reset only when the dropdown selects another provider, not when its definition is normalized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  const openPlayback = async (value: LoadedEmbed) => {
    setCaptureBusy('open');
    setCaptureError('');
    try {
      if (runtime.isDesktop) {
        const info = await runtime.openProviderCapture({
          kind: isCustom ? 'custom' : 'builtin',
          providerId: provider.id,
          providerName: provider.name,
          verifiedUrl: provider.customUrl,
          url: value.url,
          label: value.label,
          adBlock: adBlockSettings,
        });
        setCaptureWindow(info);
        setFrameLoaded(false);
      } else {
        window.open(value.url, '_blank', 'popup=yes,width=1280,height=800,noopener,noreferrer');
        setFrameLoaded(true);
      }
      setError('');
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'The player window could not be opened.';
      setError(detail);
      setCaptureError(detail);
    } finally {
      setCaptureBusy(null);
    }
  };

  const closeCaptureWindow = () => {
    if (!captureWindow) return;
    setCaptureWindow(null);
    setFrameLoaded(false);
    void runtime.closeProviderCapture(captureWindow.id).catch((cause) => {
      setCaptureError(cause instanceof Error ? cause.message : 'The provider window could not be closed.');
    });
  };

  const addCaptureToMesh = async () => {
    if (!captureWindow || !loaded) return;
    setCaptureBusy('add');
    setCaptureError('');
    try {
      await onAddCapture({
        captureId: captureWindow.id,
        url: loaded.url,
        label: loaded.label,
        withAudio: captureAudio,
        providerKind: isCustom ? 'custom' : 'builtin',
        providerName: isCustom ? 'Custom player' : provider.name,
      });
    } catch (cause) {
      setCaptureError(cause instanceof Error ? cause.message : 'The provider window could not be added to a mesh.');
    } finally {
      setCaptureBusy(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authorized) {
      setError('Confirm that you are authorized before loading this provider.');
      return;
    }
    try {
      const url = provider.customMovieUrlTemplate
        ? buildCustomProviderPlaybackUrl(provider, { mediaKind, tmdbId, seasonNumber, episodeNumber })
        : provider.customUrl
          ? validateCustomSourceUrl(provider.customUrl).toString()
          : buildProviderPlaybackUrl({
            providerId: provider.id,
            mediaKind,
            tmdbId,
            seasonNumber,
            episodeNumber,
            playerVariant,
          });
      const label = provider.customMovieUrlTemplate || !provider.customUrl
        ? mediaKind === 'movie'
          ? `TMDB movie ${tmdbId.trim()}`
          : `TMDB series ${tmdbId.trim()} · S${seasonNumber} E${episodeNumber}`
        : provider.name;
      const value = { key: ++loadSequence.current, url, label };
      setLoaded(value);
      setFrameLoaded(false);
      setError('');
      await openPlayback(value);
    } catch (cause) {
      setLoaded(null);
      setFrameLoaded(false);
      setError(cause instanceof Error ? cause.message : 'The provider URL could not be created.');
    }
  };

  return (
    <main className="provider-player" aria-label={`${provider.name} provider player`}>
      <div className="provider-player-layout">
        <aside className="provider-setup scrollable" aria-label={`${provider.name} media settings`}>
          <div className="provider-setup-intro">
            <strong>{hasCustomTemplates || !isCustom ? 'Choose media by TMDB ID' : 'Open your saved embedded player'}</strong>
            <p>{hasCustomTemplates || !isCustom ? 'Use the numeric ID from a TMDB movie or series URL. Playback opens in a separate window; no provider request is made until you submit this form.' : 'This public HTTPS player was technically verified and manually confirmed when added. Remote content can change; no request is made until you open it.'}</p>
          </div>

          <form onSubmit={(event) => void submit(event)} onChange={clearPlayback}>
            {(!isCustom || hasCustomTemplates) && (
              <>
                <fieldset className="provider-kind-picker">
                  <legend>Media type</legend>
                  <div>
                    <button type="button" className={mediaKind === 'movie' ? 'active' : ''} aria-pressed={mediaKind === 'movie'} onClick={() => { setMediaKind('movie'); clearPlayback(); }}><Film size={14} />Movie</button>
                    <button type="button" className={mediaKind === 'series' ? 'active' : ''} aria-pressed={mediaKind === 'series'} disabled={isCustom && !provider.customEpisodeUrlTemplate} title={isCustom && !provider.customEpisodeUrlTemplate ? 'Add an episode URL pattern when saving this provider to enable Series.' : undefined} onClick={() => { setMediaKind('series'); clearPlayback(); }}><MonitorPlay size={14} />Series</button>
                  </div>
                </fieldset>

                <label className="provider-field" htmlFor="provider-tmdb-id">TMDB ID
                  <input
                    id="provider-tmdb-id"
                    value={tmdbId}
                    onChange={(event) => setTmdbId(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={mediaKind === 'movie' ? 'Example: 603' : 'Example: 1399'}
                    aria-describedby="provider-tmdb-hint"
                    required
                  />
                </label>
                <p id="provider-tmdb-hint" className="provider-field-hint">Numbers only. Do not paste a TMDB or provider URL.</p>

                {mediaKind === 'series' && (
                  <div className="provider-episode-fields">
                    <label className="provider-field" htmlFor="provider-season">Season
                      <input id="provider-season" value={seasonNumber} onChange={(event) => setSeasonNumber(event.target.value)} inputMode="numeric" autoComplete="off" required />
                    </label>
                    <label className="provider-field" htmlFor="provider-episode">Episode
                      <input id="provider-episode" value={episodeNumber} onChange={(event) => setEpisodeNumber(event.target.value)} inputMode="numeric" autoComplete="off" required />
                    </label>
                  </div>
                )}

                {provider.playerVariants && (
                  <label className="provider-field" htmlFor="provider-variant">Player variant
                    <select id="provider-variant" value={playerVariant} onChange={(event) => setPlayerVariant(event.target.value)}>
                      {provider.playerVariants.map((variant) => <option key={variant.value} value={variant.value}>{variant.label}</option>)}
                    </select>
                  </label>
                )}
              </>
            )}

            {isCustom && <div className="provider-documentation"><ShieldCheck size={13} /><span>Verified sample page</span><code>{provider.customUrl}</code></div>}

            <label className="provider-authorization">
              <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
              <span>I confirm I am authorized to access this media through {provider.name}{isCustom ? ', and understand its remote content may have changed since verification.' : '.'}</span>
            </label>

            {error && <div className="provider-form-error" role="alert"><CircleAlert size={15} /><span>{error}</span></div>}

            <button type="submit" className="button primary provider-load-button" disabled={!authorized || captureBusy !== null}><ExternalLink size={15} />{captureBusy === 'open' ? 'Opening player window…' : 'Open player window'}</button>
          </form>

          <ProviderAdBlockControl settings={adBlockSettings} onSave={saveAdBlock} />

          <div className="provider-rights-note"><ShieldCheck size={16} /><p>{isCustom ? 'The earlier technical check did not verify content rights, every remote script’s safety, DRM behavior, or future availability. Confirm the loaded player is still the expected source before capturing or recording it.' : 'Embed documentation was reviewed, but provider content rights were not independently verified. You are responsible for your authorization and the provider’s terms.'}</p></div>
          {!isCustom && <div className="provider-documentation"><ExternalLink size={13} /><span>Official embed documentation</span><code>{provider.documentationUrl}</code></div>}

          {loaded && (
            <section className="provider-capture-prototype" aria-label={`${provider.name} player window controls`}>
              <div className="provider-capture-heading"><MonitorPlay size={15} /><strong>Player window & capture</strong><span>{runtime.isDesktop ? 'DESKTOP' : 'BROWSER POPUP'}</span></div>
              <p>{runtime.isDesktop ? 'Playback uses a dedicated window without an iframe sandbox. Node integration and Freeform bridge access stay disabled. Keep the window visible for capture and recording.' : 'The player opens in a browser popup without an iframe sandbox. Allow popups for Freeform if the browser blocks it.'}</p>
              {!runtime.isDesktop && <small className="provider-capture-unavailable">Mesh capture and recording are available only in the Freeform desktop app.</small>}
              <label className="provider-capture-audio">
                <input type="checkbox" checked={captureAudio} disabled={!runtime.isDesktop || captureBusy !== null} onChange={(event) => setCaptureAudio(event.target.checked)} />
                <span>Include player audio in mesh capture (not system audio)</span>
              </label>
              {captureError && <div className="provider-form-error" role="alert"><CircleAlert size={14} /><span>{captureError}</span></div>}
              {captureWindow ? (
                <div className="provider-capture-connected">
                  <span className="provider-capture-status" aria-live="polite"><Check size={12} />{frameLoaded ? 'PLAYER WINDOW READY' : 'PLAYER WINDOW OPENING'}</span>
                  <button type="button" className="button primary" disabled={!frameLoaded || captureBusy !== null} onClick={() => void addCaptureToMesh()}><Plus size={14} />{captureBusy === 'add' ? 'Adding to mesh…' : 'Add captured window to mesh'}</button>
                  <SandboxRecorder captureId={captureWindow.id} label={loaded.label} disabled={captureBusy !== null} />
                  <button type="button" className="button subtle" disabled={captureBusy !== null} onClick={closeCaptureWindow}><X size={13} />Close player window</button>
                </div>
              ) : (
                <button type="button" className="button subtle provider-capture-open" disabled={captureBusy !== null} onClick={() => void openPlayback(loaded)}><ExternalLink size={14} />{captureBusy === 'open' ? 'Opening window…' : runtime.isDesktop ? 'Reopen player window' : 'Open popup again'}</button>
              )}
            </section>
          )}
        </aside>

        <section className="provider-output" aria-label="External provider output">
          {loaded ? (
            <>
              <div className="provider-output-topline">
                <span className={frameLoaded ? 'loaded' : ''}>{frameLoaded ? <Check size={13} /> : <span className="provider-loading-dot" />}{runtime.isDesktop ? frameLoaded ? 'PLAYER WINDOW READY' : 'OPENING PLAYER WINDOW' : 'POPUP REQUESTED'}</span>
                <strong>{loaded.label}</strong>
              </div>
              <div className="provider-output-empty provider-window-launch">
                <ExternalLink size={36} />
                <strong>{runtime.isDesktop ? captureWindow ? 'Player is running in its own window' : 'Player window is not connected' : 'Player requested in a new browser window'}</strong>
                <p>{runtime.isDesktop ? 'Use the side controls to capture this window into a mesh, record it with source-player audio, or close it.' : 'If no window appeared, allow popups for Freeform and choose Open popup again. Browser playback is preview-only.'}</p>
              </div>
              <div className="provider-url"><span>{hasCustomTemplates ? 'GENERATED URL' : isCustom ? 'VERIFIED SAMPLE URL' : 'OFFICIAL URL'}</span><code>{loaded.url}</code></div>
            </>
          ) : (
            <div className="provider-output-empty">
              <MonitorPlay size={34} />
              <strong>No player window open</strong>
              <p>{hasCustomTemplates || !isCustom ? 'Enter a TMDB ID, choose Movie or Series when configured, confirm authorization, then open the dedicated player window.' : 'Confirm authorization, then open the saved player in a dedicated window.'}</p>
            </div>
          )}
          <div className="provider-mesh-limit"><CircleAlert size={16} /><p><strong>Separate playback window.</strong> Remote pages are not embedded in Catalog. Desktop capture sends the actual window into a mesh for warping and visual adjustments; browser popups remain preview-only.</p></div>
        </section>
      </div>
    </main>
  );
}

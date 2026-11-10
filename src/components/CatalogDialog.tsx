import { Server, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PROVIDERS } from '../data/providers';
import { loadCustomProviders, removeCustomProvider } from '../lib/customProviders';
import { connectLiveSource, sourceFromProviderCapture, type ProviderCaptureSourceInput } from '../lib/sourceActions';
import { useWorkspace } from '../store/useWorkspace';
import type { ProviderDefinition } from '../types';
import { useMedia } from './MediaContext';
import { ProviderPlayer } from './ProviderPlayer';

const isPlayable = (provider: ProviderDefinition) => provider.enabled && provider.playbackMode === 'embed';

export function CatalogDialog({ onClose, initialProviderId = null }: { onClose: () => void; initialProviderId?: string | null }) {
  const registerSources = useWorkspace((state) => state.registerSources);
  const addPlayer = useWorkspace((state) => state.addPlayer);
  const removeSource = useWorkspace((state) => state.removeSource);
  const removePlayers = useWorkspace((state) => state.removePlayers);
  const pushToast = useWorkspace((state) => state.pushToast);
  const { setStream } = useMedia();
  const updateSource = useWorkspace((state) => state.updateSource);
  const [customProviders, setCustomProviders] = useState<ProviderDefinition[]>(() => loadCustomProviders());
  const builtInProviders = useMemo(() => PROVIDERS.filter(isPlayable), []);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    initialProviderId ?? builtInProviders[0]?.id ?? '',
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const providerSelectRef = useRef<HTMLSelectElement>(null);
  const allProviders = useMemo(() => [...builtInProviders, ...customProviders.filter(isPlayable)], [builtInProviders, customProviders]);
  const selectedProvider = allProviders.find((provider) => provider.id === selectedProviderId) ?? allProviders[0];

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    providerSelectRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const removeProvider = () => {
    if (!selectedProvider?.customUrl || !window.confirm(`Remove ${selectedProvider.name} from Providers? Existing workspace players and recordings are not deleted.`)) return;
    try {
      const remaining = removeCustomProvider(selectedProvider.id);
      setCustomProviders(remaining);
      setSelectedProviderId(remaining.find(isPlayable)?.id ?? builtInProviders[0]?.id ?? '');
      pushToast({ title: 'Custom provider removed', detail: `${selectedProvider.name} was removed from this profile.`, tone: 'info' });
    } catch (error) {
      pushToast({ title: 'Provider could not be removed', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };

  const assignProviderCapture = async (input: ProviderCaptureSourceInput & { withAudio: boolean }) => {
    const source = sourceFromProviderCapture(input);
    let playerId: string | null = null;
    try {
      registerSources([source]);
      playerId = addPlayer(source.id);
      await connectLiveSource(source, input.withAudio, { setStream, updateSource });
      pushToast({
        title: `${source.name} connected`,
        detail: 'The provider window is now a live mesh source. Geometry, visual adjustments, and dome warp are available.',
        tone: 'success',
      });
      onClose();
    } catch (error) {
      if (playerId) removePlayers([playerId]);
      removeSource(source.id);
      throw error;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="catalog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className="catalog-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="catalog-header">
          <div className="catalog-header-mark"><Server size={23} /></div>
          <div>
            <span className="eyebrow">FREEFORM / PROVIDER PLAYBACK</span>
            <h2 id="catalog-title">Providers</h2>
            <p>Choose a provider and media, then open the player in a dedicated window.</p>
          </div>
          <button type="button" className="icon-button catalog-close" aria-label="Close Catalog" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="catalog-navigation provider-navigation">
          <label className="provider-selector" htmlFor="catalog-provider">Provider
            <select
              ref={providerSelectRef}
              id="catalog-provider"
              value={selectedProvider?.id ?? ''}
              onChange={(event) => setSelectedProviderId(event.target.value)}
            >
              {allProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}{provider.customUrl ? ' (custom)' : ''}</option>)}
            </select>
          </label>
          {selectedProvider?.customUrl && (
            <button type="button" className="button subtle provider-remove" aria-label={`Remove ${selectedProvider.name} provider`} onClick={removeProvider}><Trash2 size={13} />Remove custom provider</button>
          )}
          <span className="provider-navigation-note"><ShieldCheck size={14} />Separate window · no iframe sandbox</span>
        </div>

        {selectedProvider && <ProviderPlayer provider={selectedProvider} onAddCapture={assignProviderCapture} />}
      </div>
    </div>
  );
}

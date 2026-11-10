import { RotateCcw, Shield, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_PROVIDER_AD_BLOCK_RULES, parseProviderAdBlockRules } from '../../electron/providerAdBlock.js';
import { runtime } from '../lib/runtime';
import type { ProviderAdBlockSettings } from '../types';

interface ProviderAdBlockControlProps {
  settings: ProviderAdBlockSettings;
  onSave: (settings: ProviderAdBlockSettings) => Promise<void>;
}

export function ProviderAdBlockControl({ settings, onSave }: ProviderAdBlockControlProps) {
  const [draft, setDraft] = useState(() => settings.rules.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDraft(settings.rules.join('\n'));
  }, [settings.rules]);

  const save = async (enabled: boolean, rules: string[]) => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await onSave({ enabled, rules });
      setStatus(runtime.isDesktop ? 'Saved. Filtering changes apply to new requests immediately.' : 'Saved in this browser profile.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The filtering settings could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const applyRules = () => {
    try {
      void save(settings.enabled, parseProviderAdBlockRules(draft));
    } catch (cause) {
      setStatus('');
      setError(cause instanceof Error ? cause.message : 'Check the blocked-domain rules.');
    }
  };

  return (
    <section className="provider-ad-block" aria-label="Desktop ad blocking">
      <div className="provider-ad-block-heading">
        {settings.enabled && runtime.isDesktop ? <ShieldCheck size={16} /> : <Shield size={16} />}
        <strong>Ad & tracker request blocking</strong>
        <span>DESKTOP ONLY</span>
      </div>
      <p>Built-in filtering for dedicated player windows. This is not AdGuard Home and does not remove ad spaces from the page.</p>
      {!runtime.isDesktop && <small className="provider-ad-block-browser">Browser popups are isolated and cannot be filtered by Freeform. Use the desktop app for request blocking.</small>}
      <label className="provider-ad-block-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={!runtime.isDesktop || busy}
          onChange={(event) => void save(event.target.checked, settings.rules)}
        />
        <span>Block matching ad and tracker requests</span>
      </label>
      <details className="provider-ad-block-rules">
        <summary>Edit blocked domains <span>{settings.rules.length} saved</span></summary>
        <label htmlFor="provider-ad-block-domain-list">Blocked domains</label>
        <textarea
          id="provider-ad-block-domain-list"
          aria-label="Blocked domains"
          value={draft}
          disabled={!runtime.isDesktop || busy}
          onChange={(event) => { setDraft(event.target.value); setError(''); setStatus(''); }}
          rows={6}
          spellCheck={false}
          autoComplete="off"
        />
        <small>One hostname per line. A rule also covers its subdomains. Do not add provider or media CDN domains unless you intend to break their playback.</small>
        <div className="provider-ad-block-actions">
          <button type="button" className="button subtle" disabled={!runtime.isDesktop || busy} onClick={applyRules}>Apply rules</button>
          <button type="button" className="button subtle" disabled={!runtime.isDesktop || busy} onClick={() => void save(settings.enabled, [...DEFAULT_PROVIDER_AD_BLOCK_RULES])}><RotateCcw size={12} />Restore defaults</button>
        </div>
      </details>
      {error && <div className="provider-ad-block-message error" role="alert">{error}</div>}
      {status && <div className="provider-ad-block-message" role="status">{status}</div>}
    </section>
  );
}

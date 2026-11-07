import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useGuideTarget } from '../lib/guideActions';
import {
  DEFAULT_TRACE_SETTINGS,
  MAX_INTERIOR_NODE_SPACING,
  MAX_TRACE_SMOOTHING,
  MIN_INTERIOR_NODE_SPACING,
  MIN_TRACE_SMOOTHING,
} from '../lib/traceSettings';
import { useWorkspace } from '../store/useWorkspace';
import type { TraceSourceMapping } from '../types';
import { Dialog } from './Dialog';

export function TraceSettingsControl() {
  const traceSettings = useWorkspace((state) => state.traceSettings);
  const setTraceSettings = useWorkspace((state) => state.setTraceSettings);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{
    smoothing: string;
    interiorSpacing: string;
    sourceMapping: TraceSourceMapping;
  }>({ smoothing: '', interiorSpacing: '', sourceMapping: DEFAULT_TRACE_SETTINGS.sourceMapping });
  const [error, setError] = useState('');
  const modified = traceSettings.smoothing !== DEFAULT_TRACE_SETTINGS.smoothing
    || traceSettings.interiorSpacing !== DEFAULT_TRACE_SETTINGS.interiorSpacing
    || traceSettings.sourceMapping !== DEFAULT_TRACE_SETTINGS.sourceMapping;

  const openDialog = () => {
    setDraft({
      smoothing: String(traceSettings.smoothing),
      interiorSpacing: String(traceSettings.interiorSpacing),
      sourceMapping: traceSettings.sourceMapping,
    });
    setError('');
    setOpen(true);
  };

  useGuideTarget('trace-settings', openDialog);

  const resetDraft = () => {
    setDraft({
      smoothing: String(DEFAULT_TRACE_SETTINGS.smoothing),
      interiorSpacing: String(DEFAULT_TRACE_SETTINGS.interiorSpacing),
      sourceMapping: DEFAULT_TRACE_SETTINGS.sourceMapping,
    });
    setError('');
  };

  const applySettings = () => {
    if (!draft.smoothing.trim() || !draft.interiorSpacing.trim()) {
      setError('Enter both trace settings before applying them.');
      return;
    }
    const smoothing = Number(draft.smoothing);
    const interiorSpacing = Number(draft.interiorSpacing);
    if (!Number.isFinite(smoothing) || !Number.isFinite(interiorSpacing)) {
      setError('Enter valid numeric trace settings.');
      return;
    }
    setTraceSettings({ smoothing, interiorSpacing, sourceMapping: draft.sourceMapping });
    setOpen(false);
  };

  return (
    <>
      <button
        className={`trace-settings-tool ${modified ? 'active' : ''}`}
        title="Adjust trace source mapping, smoothing, and interior-node spacing"
        onClick={openDialog}
      >
        <SlidersHorizontal size={14} /><span>Trace settings</span>
      </button>
      {open && (
        <Dialog title="Trace settings" eyebrow="MESH CREATION / STROKE SAMPLING" onClose={() => setOpen(false)}>
          <div className="dialog-form" data-guide-target="trace-settings">
            <p className="form-help">Choose how the source fills new traced players, then tune their mesh geometry. Existing players and nodes are not changed.</p>
            <div className="trace-source-mapping">
              <span className="inspector-heading">SOURCE MAPPING</span>
              <div className="output-size-presets trace-source-presets" role="group" aria-label="Source mapping">
                <button
                  type="button"
                  aria-pressed={draft.sourceMapping === 'crop'}
                  className={draft.sourceMapping === 'crop' ? 'active' : ''}
                  onClick={() => setDraft((current) => ({ ...current, sourceMapping: 'crop' }))}
                >
                  <strong>Crop to shape</strong><span>Current behavior; concave outlines can trim source regions.</span>
                </button>
                <button
                  type="button"
                  aria-pressed={draft.sourceMapping === 'whole'}
                  className={draft.sourceMapping === 'whole' ? 'active' : ''}
                  onClick={() => setDraft((current) => ({ ...current, sourceMapping: 'whole' }))}
                >
                  <strong>Whole source in shape</strong><span>Wrap the complete source around the outline without cropping.</span>
                </button>
              </div>
            </div>
            <div className="number-grid">
              <label className="number-field">
                <span>Border smoothing</span>
                <div><input
                  type="number"
                  aria-label="Border smoothing"
                  value={draft.smoothing}
                  min={MIN_TRACE_SMOOTHING}
                  max={MAX_TRACE_SMOOTHING}
                  step={0.5}
                  onChange={(event) => setDraft((current) => ({ ...current, smoothing: event.target.value }))}
                /><em>u</em></div>
              </label>
              <label className="number-field">
                <span>Interior node spacing</span>
                <div><input
                  type="number"
                  aria-label="Interior node spacing"
                  value={draft.interiorSpacing}
                  min={MIN_INTERIOR_NODE_SPACING}
                  max={MAX_INTERIOR_NODE_SPACING}
                  step={1}
                  onChange={(event) => setDraft((current) => ({ ...current, interiorSpacing: event.target.value }))}
                /><em>u</em></div>
              </label>
            </div>
            <p className="section-help">Smoothing can be {MIN_TRACE_SMOOTHING}–{MAX_TRACE_SMOOTHING} workspace units in 0.5-unit steps. Interior spacing can be {MIN_INTERIOR_NODE_SPACING}–{MAX_INTERIOR_NODE_SPACING} whole workspace units. Out-of-range values are clamped.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button subtle" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="button subtle" onClick={resetDraft}><RotateCcw size={13} />Reset defaults</button>
              <button type="button" className="button primary" onClick={applySettings}>Apply settings</button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

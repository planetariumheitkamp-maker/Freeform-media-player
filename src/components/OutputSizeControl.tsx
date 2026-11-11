import { Maximize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGuideTarget } from '../lib/guideActions';
import {
  DEFAULT_OUTPUT_SIZE,
  MAX_OUTPUT_DIMENSION,
  MIN_OUTPUT_DIMENSION,
} from '../lib/output';
import { getRenderQualityPreset, RENDER_QUALITY_PRESETS } from '../lib/quality';
import { useWorkspace } from '../store/useWorkspace';
import type { RenderQuality } from '../types';
import { Dialog } from './Dialog';

const presets = [
  { name: 'Default', width: 1600, height: 900 },
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: 'Square', width: 2048, height: 2048 },
  { name: '4K UHD', width: 3840, height: 2160 },
];

interface LiveRenderStats {
  width: number;
  height: number;
  pixelRatio: number;
  fps: number;
  frameTime: number;
}

function readLiveRenderStats(): LiveRenderStats | null {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas.warp-canvas');
  if (!canvas) return null;
  return {
    width: canvas.width,
    height: canvas.height,
    pixelRatio: Number(canvas.dataset.pixelRatio ?? 0),
    fps: Number(canvas.dataset.renderFps ?? 0),
    frameTime: Number(canvas.dataset.renderFrameTime ?? 0),
  };
}

export function OutputSizeControl() {
  const outputSize = useWorkspace((state) => state.outputSize);
  const outputOpacity = useWorkspace((state) => state.outputOpacity);
  const renderQuality = useWorkspace((state) => state.renderQuality);
  const setOutputSize = useWorkspace((state) => state.setOutputSize);
  const setOutputOpacity = useWorkspace((state) => state.setOutputOpacity);
  const setRenderQuality = useWorkspace((state) => state.setRenderQuality);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ width: '', height: '' });
  const [error, setError] = useState('');
  const [liveStats, setLiveStats] = useState<LiveRenderStats | null>(null);
  const modified = outputSize.width !== DEFAULT_OUTPUT_SIZE.width
    || outputSize.height !== DEFAULT_OUTPUT_SIZE.height
    || outputOpacity !== 1
    || renderQuality !== 'standard';
  const qualityPreset = getRenderQualityPreset(renderQuality);

  useEffect(() => {
    if (!open) return;
    const update = () => setLiveStats(readLiveRenderStats());
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [open]);

  const openDialog = () => {
    setDraft({ width: String(outputSize.width), height: String(outputSize.height) });
    setError('');
    setOpen(true);
  };

  useGuideTarget('output', openDialog);

  const choosePreset = (width: number, height: number) => {
    setDraft({ width: String(width), height: String(height) });
    setError('');
  };

  const applySize = () => {
    const width = Number(draft.width);
    const height = Number(draft.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      setError('Enter a valid positive width and height.');
      return;
    }
    setOutputSize({ width, height });
    setOpen(false);
  };

  return (
    <>
      <button aria-label="Output" className={modified ? 'active' : ''} title="Change output size" onClick={openDialog}>
        <Maximize2 size={14} /><span>Output</span>
      </button>
      {open && (
        <Dialog title="Output size" eyebrow="WORKSPACE / DIMENSIONS" onClose={() => setOpen(false)}>
          <div className="dialog-form" data-guide-target="output">
            <p className="form-help">Choose a preset or enter custom dimensions. Players keep their positions and shapes, and an imported grid is refitted without distortion.</p>
            <div className="output-size-presets" aria-label="Output size presets">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.name}
                  className={draft.width === String(preset.width) && draft.height === String(preset.height) ? 'active' : ''}
                  onClick={() => choosePreset(preset.width, preset.height)}
                >
                  <strong>{preset.name}</strong><span>{preset.width} × {preset.height}</span>
                </button>
              ))}
            </div>
            <div className="number-grid">
              <label className="number-field">
                <span>Width</span>
                <div><input
                  type="number"
                  aria-label="Output width"
                  value={draft.width}
                  min={MIN_OUTPUT_DIMENSION}
                  max={MAX_OUTPUT_DIMENSION}
                  step={1}
                  onChange={(event) => setDraft((current) => ({ ...current, width: event.target.value }))}
                /><em>px</em></div>
              </label>
              <label className="number-field">
                <span>Height</span>
                <div><input
                  type="number"
                  aria-label="Output height"
                  value={draft.height}
                  min={MIN_OUTPUT_DIMENSION}
                  max={MAX_OUTPUT_DIMENSION}
                  step={1}
                  onChange={(event) => setDraft((current) => ({ ...current, height: event.target.value }))}
                /><em>px</em></div>
              </label>
            </div>
            <p className="section-help">Each dimension can be {MIN_OUTPUT_DIMENSION}–{MAX_OUTPUT_DIMENSION} pixels. Values are rounded to whole pixels.</p>
            <section className="grid-geometry-section output-appearance-section" aria-label="Projection quality settings">
              <span className="inspector-heading">PROJECTION QUALITY</span>
              <label className="field-label">Projection quality
                <select aria-label="Projection quality" value={renderQuality} onChange={(event) => setRenderQuality(event.target.value as RenderQuality)}>
                  {Object.values(RENDER_QUALITY_PRESETS).map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name} · {preset.scale}× render scale</option>
                  ))}
                </select>
              </label>
              <p className="section-help">{qualityPreset.description}</p>
              <p className="section-help">Higher quality uses more GPU memory and processing time. Resolution is capped by GPU limits and a 67 MP safety budget. Use high-resolution sources and match the output dimensions to the projector; upscaling cannot restore missing source detail.</p>
            </section>
            <section className="grid-geometry-section output-appearance-section" aria-label="Live render performance">
              <div className="grid-geometry-heading">
                <span className="inspector-heading">LIVE RENDER</span>
                <span className="render-live-indicator">1-SECOND SAMPLES</span>
              </div>
              <div className="render-stats-grid">
                <div className="render-stat">
                  <span>Resolution</span>
                  <output aria-label="Render resolution">{liveStats ? `${liveStats.width} × ${liveStats.height} px` : 'Waiting for canvas'}</output>
                </div>
                <div className="render-stat">
                  <span>Pixel ratio</span>
                  <output aria-label="Render pixel ratio">{liveStats?.pixelRatio ? `${liveStats.pixelRatio.toFixed(2)}×` : 'Measuring…'}</output>
                </div>
                <div className="render-stat">
                  <span>Frame rate</span>
                  <output aria-label="Render frame rate">{liveStats?.fps ? `${liveStats.fps.toFixed(1)} fps` : 'Measuring…'}</output>
                </div>
                <div className="render-stat">
                  <span>Frame time</span>
                  <output aria-label="Render frame time">{liveStats?.frameTime ? `${liveStats.frameTime.toFixed(1)} ms` : 'Measuring…'}</output>
                </div>
              </div>
              <p className="section-help">Measured from the active workspace canvas on this device. Frame rate reflects the current workload, not the source video’s encoded frame rate.</p>
            </section>
            <section className="grid-geometry-section output-appearance-section" aria-label="Output background">
              <div className="grid-geometry-heading">
                <span className="inspector-heading">OUTPUT BACKGROUND</span>
                <button type="button" className="text-button" onClick={() => setOutputOpacity(outputOpacity > 0 ? 0 : 1)}>{outputOpacity > 0 ? 'Hide output background' : 'Show output background'}</button>
              </div>
              <label className="range-field"><span>Opacity <output>{Math.round(outputOpacity * 100)}%</output></span><input aria-label="Output background opacity" type="range" min="0" max="1" step="0.05" value={outputOpacity} onChange={(event) => setOutputOpacity(Number(event.target.value))} /></label>
              <p className="section-help">Adjust or hide only the editor’s output backdrop. Media players and alignment guides remain visible.</p>
            </section>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button subtle" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="button subtle" onClick={() => choosePreset(DEFAULT_OUTPUT_SIZE.width, DEFAULT_OUTPUT_SIZE.height)}>Reset size</button>
              <button type="button" className="button primary" onClick={applySize}>Apply size</button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

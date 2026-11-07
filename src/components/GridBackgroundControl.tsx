import { Grid2X2, ImagePlus, LoaderCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_BACKGROUND_COLOR } from '../lib/appearance';
import { DEFAULT_GRID_GEOMETRY } from '../lib/grid';
import { useGuideTarget } from '../lib/guideActions';
import { runtime } from '../lib/runtime';
import { useWorkspace } from '../store/useWorkspace';
import { Dialog } from './Dialog';

function GridNumberField({ label, ariaLabel, value, onChange, min, max, step, suffix }: {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input
        type="number"
        aria-label={ariaLabel}
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />{suffix && <em>{suffix}</em>}</div>
    </label>
  );
}

export function GridBackgroundControl() {
  const background = useWorkspace((state) => state.background);
  const backgroundColor = useWorkspace((state) => state.backgroundColor);
  const gridGeometry = useWorkspace((state) => state.gridGeometry);
  const gridSnapping = useWorkspace((state) => state.gridSnapping);
  const outputSize = useWorkspace((state) => state.outputSize);
  const setBackground = useWorkspace((state) => state.setBackground);
  const setBackgroundColor = useWorkspace((state) => state.setBackgroundColor);
  const setGridGeometry = useWorkspace((state) => state.setGridGeometry);
  const setGridSnapping = useWorkspace((state) => state.setGridSnapping);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const geometryModified = gridGeometry.kind !== DEFAULT_GRID_GEOMETRY.kind
    || gridGeometry.spacing !== DEFAULT_GRID_GEOMETRY.spacing
    || gridGeometry.rotation !== DEFAULT_GRID_GEOMETRY.rotation
    || gridGeometry.skewX !== DEFAULT_GRID_GEOMETRY.skewX
    || gridGeometry.skewY !== DEFAULT_GRID_GEOMETRY.skewY
    || gridGeometry.rings !== DEFAULT_GRID_GEOMETRY.rings
    || gridGeometry.spokes !== DEFAULT_GRID_GEOMETRY.spokes
    || gridGeometry.radius !== DEFAULT_GRID_GEOMETRY.radius;

  const importImage = async () => {
    setImporting(true);
    setError('');
    try {
      const image = await runtime.openBackgroundImage();
      if (!image) return;
      if (image.mediaType !== 'image' || !image.url) throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
      setBackground({
        name: image.name,
        uri: image.url,
        path: image.path,
        mime: image.mime,
      });
      setOpen(false);
      pushToast({ title: 'Custom grid applied', detail: image.name, tone: 'success' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The image could not be imported.');
    } finally {
      setImporting(false);
    }
  };

  const useDefaultGrid = () => {
    setBackground(null);
    setOpen(false);
    pushToast({ title: 'Built-in grid restored', tone: 'info' });
  };

  useGuideTarget('grid', () => { setError(''); setOpen(true); });

  return (
    <>
      <button className={background || backgroundColor !== DEFAULT_BACKGROUND_COLOR || geometryModified ? 'active' : ''} title="Customize workspace background and grid" onClick={() => { setError(''); setOpen(true); }}>
        <Grid2X2 size={14} /><span>Grid</span>
      </button>
      {open && (
        <Dialog title="Workspace background" eyebrow="COLOR / GEOMETRY + IMAGE" onClose={() => setOpen(false)}>
          <div className="dialog-form" data-guide-target="grid">
            <section className="background-color-section" aria-label="Workspace color settings">
              <div className="grid-geometry-heading"><span className="inspector-heading">WORKSPACE COLOR</span><button type="button" className="text-button" onClick={() => setBackgroundColor(DEFAULT_BACKGROUND_COLOR)}><RotateCcw size={12} />Reset color</button></div>
              <div className="background-color-controls">
                <label className="background-color-picker"><input type="color" aria-label="Background color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /><output aria-label="Background color value">{backgroundColor.toUpperCase()}</output></label>
                <div className="background-color-swatches" role="group" aria-label="Background color presets">
                  {[DEFAULT_BACKGROUND_COLOR, '#141615', '#000000', '#f4f1e8', '#1e3448', '#402b4b'].map((color) => <button key={color} type="button" className={backgroundColor === color ? 'active' : ''} aria-label={`Use background color ${color}`} aria-pressed={backgroundColor === color} title={`Use ${color}`} style={{ backgroundColor: color }} onClick={() => setBackgroundColor(color)} />)}
                </div>
              </div>
              <p className="section-help">This color fills the workspace behind your players in editing and Present mode. Grid lines and imported guide images remain editing-only.</p>
            </section>
            <p className="form-help">Import an image to use as a custom alignment grid. It is fitted inside the {outputSize.width} × {outputSize.height} output without cropping or distorting, and appears behind your players only while editing—not in Present mode.</p>
            <div className="grid-background-preview">
              {background?.uri ? (
                <img src={background.uri} alt={`${background.name} grid preview`} />
              ) : (
                <><Grid2X2 size={32} /><span>{background ? 'Image unavailable' : 'Built-in workspace grid'}</span></>
              )}
            </div>
            <div className="grid-background-meta"><span>CURRENT GUIDE</span><strong>{background?.name ?? 'Built-in grid'}</strong></div>
            <p className="form-help">For precise alignment, use a {outputSize.width} × {outputSize.height} image. Projects save the image’s file reference, not its contents.</p>
            {background && !background.uri && <p className="form-error" role="alert">The saved image is unavailable at its referenced location. Import it again to restore the custom guide.</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <section className="grid-geometry-section" aria-label="Built-in grid geometry">
              <div className="grid-geometry-heading">
                <span className="inspector-heading">BUILT-IN GRID GEOMETRY</span>
                <button type="button" className="text-button" onClick={() => setGridGeometry(DEFAULT_GRID_GEOMETRY)}><RotateCcw size={12} />Reset geometry</button>
              </div>
              <div className="segmented grid-kind-selector" role="group" aria-label="Built-in grid type">
                <button type="button" className={gridGeometry.kind === 'cartesian' ? 'active' : ''} aria-pressed={gridGeometry.kind === 'cartesian'} onClick={() => setGridGeometry({ kind: 'cartesian' })}>Cartesian grid</button>
                <button type="button" className={gridGeometry.kind === 'circular' ? 'active' : ''} aria-pressed={gridGeometry.kind === 'circular'} onClick={() => setGridGeometry({ kind: 'circular' })}>Circular grid</button>
              </div>
              {gridGeometry.kind === 'circular' ? (
                <>
                  <div className="number-grid">
                    <GridNumberField label="Rings" ariaLabel="Circular grid rings" value={gridGeometry.rings} min={1} max={32} step={1} onChange={(rings) => setGridGeometry({ rings })} />
                    <GridNumberField label="Spokes" ariaLabel="Circular grid spokes" value={gridGeometry.spokes} min={4} max={72} step={1} onChange={(spokes) => setGridGeometry({ spokes })} />
                    <GridNumberField label="Radius" ariaLabel="Circular grid radius" value={gridGeometry.radius} min={10} max={100} step={5} suffix="%" onChange={(radius) => setGridGeometry({ radius })} />
                    <GridNumberField label="Rotation" ariaLabel="Circular grid rotation" value={gridGeometry.rotation} min={-180} max={180} step={5} suffix="°" onChange={(rotation) => setGridGeometry({ rotation })} />
                  </div>
                  <label className="check-field grid-snap-toggle"><input type="checkbox" checked={gridSnapping} onChange={(event) => setGridSnapping(event.target.checked)} />Snap to circular grid</label>
                  <p className="section-help">Concentric elevation rings, azimuth spokes, outer ticks, and degree labels are centered on the output. Radius is relative to the output’s shorter side.</p>
                  <p className="section-help">Snapping aligns dragged quick corners and advanced nodes, plus newly placed interior nodes, to nearby ring/spoke intersections. It pauses while a custom image background is visible.</p>
                </>
              ) : (
                <>
                  <div className="number-grid">
                    <GridNumberField label="Cell size" ariaLabel="Grid cell size" value={gridGeometry.spacing} min={20} max={400} step={5} onChange={(spacing) => setGridGeometry({ spacing })} />
                    <GridNumberField label="Rotation" ariaLabel="Grid rotation" value={gridGeometry.rotation} min={-180} max={180} step={5} suffix="°" onChange={(rotation) => setGridGeometry({ rotation })} />
                    <GridNumberField label="Skew X" ariaLabel="Grid skew X" value={gridGeometry.skewX} min={-45} max={45} step={1} suffix="°" onChange={(skewX) => setGridGeometry({ skewX })} />
                    <GridNumberField label="Skew Y" ariaLabel="Grid skew Y" value={gridGeometry.skewY} min={-45} max={45} step={1} suffix="°" onChange={(skewY) => setGridGeometry({ skewY })} />
                  </div>
                  <p className="section-help">Cell size uses workspace units. Rotation and skew reshape the built-in grid; an imported image keeps its own proportions.</p>
                </>
              )}
            </section>
            <div className="dialog-actions">
              <button type="button" className="button subtle" onClick={() => setOpen(false)}>Cancel</button>
              {background && <button type="button" className="button subtle" onClick={useDefaultGrid}><RotateCcw size={14} />Use default grid</button>}
              <button type="button" className="button primary" disabled={importing} onClick={() => void importImage()}>
                {importing ? <LoaderCircle className="spin" size={14} /> : <ImagePlus size={14} />}{background ? 'Replace image' : 'Import image'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

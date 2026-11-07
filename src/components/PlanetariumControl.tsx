import { Crosshair, Orbit, Plus, RotateCcw, Trash2, WandSparkles } from 'lucide-react';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TEST_SOURCE } from '../data/defaults';
import {
  DEFAULT_PLANETARIUM_SETTINGS,
  domeAzimuthElevation,
  domeDirectionToScreen,
} from '../lib/dome';
import { solveDomeCalibration, type DomeCalibrationResult } from '../lib/domeCalibration';
import { DOME_PRESETS, DOME_PROJECTION_MODELS } from '../lib/domePresets';
import { useGuideTarget } from '../lib/guideActions';
import { useWorkspace } from '../store/useWorkspace';
import type {
  DomeCalibrationPoint,
  DomeProjectionModel,
  TestPatternKind,
  Vec2,
  WorkspacePlanetariumSettings,
} from '../types';
import { Dialog } from './Dialog';

function PlanetariumNumberField({ label, value, onChange, min, max, step, disabled = false, unit = '°' }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  unit?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input
        type="number"
        aria-label={label}
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      /><em>{unit}</em></div>
    </label>
  );
}

function CalibrationPlot({ settings, onChange }: {
  settings: WorkspacePlanetariumSettings;
  onChange: (points: DomeCalibrationPoint[]) => void;
}) {
  const outputSize = useWorkspace((state) => state.outputSize);
  const gridGeometry = useWorkspace((state) => state.gridGeometry);
  const [dragId, setDragId] = useState<string | null>(null);
  const eventPoint = (event: ReactPointerEvent<SVGSVGElement>): Vec2 => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * outputSize.width - outputSize.width / 2,
      y: outputSize.height / 2 - (event.clientY - bounds.top) / bounds.height * outputSize.height,
    };
  };
  return (
    <svg
      className="calibration-plot"
      viewBox={`${-outputSize.width / 2} ${-outputSize.height / 2} ${outputSize.width} ${outputSize.height}`}
      aria-label="Calibration point canvas"
      onPointerMove={(event) => {
        if (!dragId) return;
        const observed = eventPoint(event);
        onChange(settings.calibrationPoints.map((point) => point.id === dragId ? { ...point, observed } : point));
      }}
      onPointerUp={(event) => {
        setDragId(null);
        useWorkspace.getState().endHistory();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { setDragId(null); useWorkspace.getState().endHistory(); }}
    >
      <rect x={-outputSize.width / 2} y={-outputSize.height / 2} width={outputSize.width} height={outputSize.height} className="calibration-output" />
      {settings.calibrationPoints.map((point) => {
        const predicted = domeDirectionToScreen(
          domeAzimuthElevation(point.azimuth, point.elevation), outputSize, gridGeometry, settings,
        );
        return (
          <g key={point.id}>
            <line x1={predicted.x} y1={-predicted.y} x2={point.observed.x} y2={-point.observed.y} className="calibration-residual" />
            <circle cx={predicted.x} cy={-predicted.y} r={outputSize.width * 0.005} className="calibration-predicted" />
            <circle
              cx={point.observed.x}
              cy={-point.observed.y}
              r={outputSize.width * 0.007}
              className="calibration-observed"
              onPointerDown={(event) => {
                event.preventDefault();
                setDragId(point.id);
                useWorkspace.getState().beginHistory('Move calibration point');
                event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
              }}
            />
            <text x={point.observed.x + outputSize.width * 0.011} y={-point.observed.y} className="calibration-point-label">{point.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

type PlanetariumTab = 'setup' | 'calibration' | 'installation' | 'preview';

export function PlanetariumControl() {
  const settings = useWorkspace((state) => state.planetariumSettings);
  const gridGeometry = useWorkspace((state) => state.gridGeometry);
  const outputSize = useWorkspace((state) => state.outputSize);
  const players = useWorkspace((state) => state.players);
  const sources = useWorkspace((state) => state.sources);
  const setPlanetariumSettings = useWorkspace((state) => state.setPlanetariumSettings);
  const setGridGeometry = useWorkspace((state) => state.setGridGeometry);
  const updateSource = useWorkspace((state) => state.updateSource);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PlanetariumTab>('setup');
  const [azimuth, setAzimuth] = useState(0);
  const [elevation, setElevation] = useState(45);
  const [fit, setFit] = useState<DomeCalibrationResult | null>(null);
  const [calibrationError, setCalibrationError] = useState('');
  const warpedPlayers = players.filter((player) => player.domeWarp && !player.domePrewarped).length;
  const model = DOME_PROJECTION_MODELS.find((candidate) => candidate.id === settings.model) ?? DOME_PROJECTION_MODELS[0];
  const testPattern = sources.find((source) => source.id === TEST_SOURCE.id)?.testPattern ?? 'orientation';

  const setCalibrationPoints = (calibrationPoints: DomeCalibrationPoint[]) => {
    setFit(null);
    setCalibrationError('');
    setPlanetariumSettings({ calibrationPoints });
  };
  const updateCalibrationPoint = (id: string, patch: Partial<DomeCalibrationPoint>) => {
    setCalibrationPoints(settings.calibrationPoints.map((point) => point.id === id ? { ...point, ...patch } : point));
  };
  const addPoint = () => {
    const direction = domeAzimuthElevation(azimuth, elevation);
    const observed = domeDirectionToScreen(direction, outputSize, gridGeometry, settings);
    setCalibrationPoints([...settings.calibrationPoints, {
      id: crypto.randomUUID(), name: `Point ${settings.calibrationPoints.length + 1}`, azimuth, elevation, observed,
    }]);
  };
  const solve = () => {
    try {
      const result = solveDomeCalibration(settings, outputSize, gridGeometry);
      setPlanetariumSettings(result.settings);
      setGridGeometry({ rotation: result.gridRotation });
      setFit(result);
      setCalibrationError('');
      pushToast({
        title: 'Dome calibration solved',
        detail: `${result.rms.toFixed(2)} px RMS across ${settings.calibrationPoints.length} points.`,
        tone: 'success',
      });
    } catch (error) {
      setFit(null);
      setCalibrationError(error instanceof Error ? error.message : 'Calibration failed.');
    }
  };
  const updateInstallation = (patch: Partial<WorkspacePlanetariumSettings['installation']>) => {
    setPlanetariumSettings({ installation: { ...settings.installation, ...patch } });
  };

  useGuideTarget(['planetarium-setup', 'planetarium-calibration', 'planetarium-installation', 'planetarium-preview'], (target) => {
    setTab(target.replace('planetarium-', '') as PlanetariumTab);
    setOpen(true);
  });

  return (
    <>
      <button className={settings.enabled ? 'active' : ''} title="Configure single-projector dome warping" onClick={() => setOpen(true)}>
        <Orbit size={14} /><span>Planetarium</span>
      </button>
      {open && (
        <Dialog title="Planetarium mode" eyebrow="DOME / SINGLE FISHEYE PROJECTOR" onClose={() => setOpen(false)}>
          <div className="planetarium-tabs" role="tablist" aria-label="Planetarium settings">
            {(['setup', 'calibration', 'installation', 'preview'] as const).map((name) => (
              <button key={name} data-guide-target={`planetarium-${name}`} role="tab" aria-selected={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name[0].toUpperCase() + name.slice(1)}</button>
            ))}
          </div>
          <div className="planetarium-panel">
            {tab === 'setup' && (
              <>
                <p className="form-help">Map ordinary rectangular media onto a single-projector fisheye output. The circular grid controls radius and azimuth orientation.</p>
                <label className="check-field grid-snap-toggle">
                  <input type="checkbox" checked={settings.enabled} onChange={(event) => setPlanetariumSettings({ enabled: event.target.checked })} />
                  Enable planetarium mode
                </label>
                <div className="dome-preset-list">
                  {DOME_PRESETS.map((preset) => (
                    <button key={preset.id} disabled={!settings.enabled} onClick={() => {
                      setPlanetariumSettings(preset.settings);
                      setGridGeometry(preset.grid);
                    }}><strong>{preset.name}</strong><span>{preset.description}</span></button>
                  ))}
                </div>
                <label className="field-label dome-model-select">Projection model
                  <select aria-label="Projection model" disabled={!settings.enabled} value={settings.model} onChange={(event) => setPlanetariumSettings({ model: event.target.value as DomeProjectionModel })}>
                    {DOME_PROJECTION_MODELS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                </label>
                <p className="section-help">{model.description}</p>
                <div className="number-grid">
                  <PlanetariumNumberField label="Dome field of view" value={settings.fov} min={90} max={180} step={1} disabled={!settings.enabled} onChange={(fov) => setPlanetariumSettings({ fov })} />
                  <PlanetariumNumberField label="Dome tilt" value={settings.tilt} min={-45} max={45} step={1} disabled={!settings.enabled} onChange={(tilt) => setPlanetariumSettings({ tilt })} />
                  <PlanetariumNumberField label="Projection center X" value={settings.offsetX} min={-50} max={50} step={1} disabled={!settings.enabled} unit="%" onChange={(offsetX) => setPlanetariumSettings({ offsetX })} />
                  <PlanetariumNumberField label="Projection center Y" value={settings.offsetY} min={-50} max={50} step={1} disabled={!settings.enabled} unit="%" onChange={(offsetY) => setPlanetariumSettings({ offsetY })} />
                  <PlanetariumNumberField label="Dome truncation" value={settings.truncation} min={50} max={100} step={1} disabled={!settings.enabled} unit="%" onChange={(truncation) => setPlanetariumSettings({ truncation })} />
                  <PlanetariumNumberField label="Grid azimuth rotation" value={gridGeometry.rotation} min={-180} max={180} step={1} disabled={!settings.enabled} onChange={(rotation) => setGridGeometry({ rotation })} />
                </div>
                <p className="section-help">Truncation is the angular cap mapped to the fisheye rim: 100% uses the full field of view; 75% at 180° FOV produces a 135° cap. Offsets are percentages of output dimensions.</p>
                <div className="property-inline"><span>Active dome-warped players</span><strong>{warpedPlayers} of {players.length}</strong></div>
                <p className="section-help">Enable <strong>Dome warp</strong> per player in the Inspector. <strong>Already prewarped</strong> bypasses this second warp while retaining the player’s ordinary mesh.</p>
              </>
            )}
            {tab === 'calibration' && (
              <>
                <p className="form-help">Enter known sky directions, then drag the yellow observed points to their measured output pixels. Hollow green points show the current prediction; lines show residuals.</p>
                <CalibrationPlot settings={settings} onChange={setCalibrationPoints} />
                <div className="calibration-add-row">
                  <PlanetariumNumberField label="Reference azimuth" value={azimuth} min={-180} max={180} step={1} onChange={setAzimuth} />
                  <PlanetariumNumberField label="Reference elevation" value={elevation} min={0} max={90} step={1} onChange={setElevation} />
                  <button className="button subtle" onClick={addPoint}><Plus size={14} />Add reference</button>
                </div>
                <div className="calibration-points">
                  {settings.calibrationPoints.map((point) => (
                    <div className="calibration-point-row" key={point.id}>
                      <input aria-label={`${point.name} name`} value={point.name} onChange={(event) => updateCalibrationPoint(point.id, { name: event.target.value })} />
                      <span>{point.azimuth.toFixed(1)}° / {point.elevation.toFixed(1)}°</span>
                      <label>X <input type="number" aria-label={`${point.name} observed X`} value={Math.round(point.observed.x)} onChange={(event) => updateCalibrationPoint(point.id, { observed: { ...point.observed, x: Number(event.target.value) } })} /></label>
                      <label>Y <input type="number" aria-label={`${point.name} observed Y`} value={Math.round(point.observed.y)} onChange={(event) => updateCalibrationPoint(point.id, { observed: { ...point.observed, y: Number(event.target.value) } })} /></label>
                      <button className="icon-button" aria-label={`Remove ${point.name}`} onClick={() => setCalibrationPoints(settings.calibrationPoints.filter((candidate) => candidate.id !== point.id))}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {!settings.calibrationPoints.length && <div className="history-empty">No reference points yet. Add at least four distinct directions for the four-parameter fit.</div>}
                </div>
                {calibrationError && <p className="form-error">{calibrationError}</p>}
                {fit && <div className="calibration-result"><Crosshair size={17} /><div><strong>{fit.rms.toFixed(3)} px RMS · {fit.maxResidual.toFixed(3)} px maximum</strong><span>{fit.iterations} solver iterations. Tilt {fit.settings.tilt.toFixed(3)}°, center ({fit.settings.offsetX.toFixed(3)}%, {fit.settings.offsetY.toFixed(3)}%), azimuth {fit.gridRotation.toFixed(3)}°.</span></div></div>}
                <div className="calibration-actions">
                  <button className="button primary" disabled={settings.calibrationPoints.length < 4} onClick={solve}><WandSparkles size={14} />Solve center, tilt & azimuth</button>
                  <button className="button subtle" disabled={!settings.calibrationPoints.length} onClick={() => setCalibrationPoints([])}>Clear points</button>
                </div>
              </>
            )}
            {tab === 'installation' && (
              <>
                <p className="form-help">Installation notes are saved with the project for reproducibility. They do not alter the optical model or claim a measured lens profile.</p>
                <div className="number-grid">
                  <PlanetariumNumberField label="Dome diameter" value={settings.installation.domeDiameter} min={0.1} max={1000} step={0.1} unit="m" onChange={(domeDiameter) => updateInstallation({ domeDiameter })} />
                  <PlanetariumNumberField label="Spring line" value={settings.installation.springLine} min={-100} max={100} step={0.1} unit="m" onChange={(springLine) => updateInstallation({ springLine })} />
                  <PlanetariumNumberField label="Projector height" value={settings.installation.projectorHeight} min={-100} max={100} step={0.1} unit="m" onChange={(projectorHeight) => updateInstallation({ projectorHeight })} />
                  <PlanetariumNumberField label="Lens throw ratio" value={settings.installation.lensThrow} min={0.01} max={100} step={0.01} unit=":1" onChange={(lensThrow) => updateInstallation({ lensThrow })} />
                </div>
                <label className="field-label installation-notes">Venue, projector and lens notes
                  <textarea value={settings.installation.notes} maxLength={8000} placeholder="Projector, lens, mount, measured references…" onChange={(event) => updateInstallation({ notes: event.target.value })} />
                </label>
              </>
            )}
            {tab === 'preview' && (
              <>
                <p className="form-help">Preview tools use the production mesh and the same projection equations. Audience view is a geometric dome visualization, not a measured perceptual or photometric simulation.</p>
                <div className="dome-preview-options">
                  <button className={settings.preview === 'projector' ? 'active' : ''} onClick={() => setPlanetariumSettings({ preview: 'projector', comparison: false })}><strong>Projector output</strong><span>Show the final warped output canvas.</span></button>
                  <button className={settings.preview === 'unwarped' ? 'active' : ''} onClick={() => setPlanetariumSettings({ preview: 'unwarped', comparison: false })}><strong>Unwarped source</strong><span>Temporarily bypass dome warp in the editor.</span></button>
                  <button className={settings.preview === 'audience' ? 'active' : ''} onClick={() => setPlanetariumSettings({ preview: 'audience', comparison: false })}><strong>Audience geometry</strong><span>Inspect the output on a virtual hemisphere.</span></button>
                </div>
                <label className="check-field">
                  <input type="checkbox" checked={settings.comparison} disabled={!settings.enabled || settings.preview !== 'projector'} onChange={(event) => setPlanetariumSettings({ comparison: event.target.checked })} />
                  Split before / after comparison
                </label>
                <label className="field-label">Built-in test pattern
                  <select aria-label="Built-in test pattern" value={testPattern} onChange={(event) => updateSource(TEST_SOURCE.id, { testPattern: event.target.value as TestPatternKind })}>
                    <option value="orientation">Orientation & safe frame</option>
                    <option value="crosshatch">Crosshatch</option>
                    <option value="starfield">Starfield</option>
                    <option value="convergence">Convergence targets</option>
                    <option value="latitude">Latitude & longitude</option>
                  </select>
                </label>
                <p className="section-help">The selected pattern replaces the built-in calibration card on every player assigned to it. Presentation always uses the final projector output.</p>
              </>
            )}
          </div>
          <div className="dialog-actions">
            <button type="button" className="button subtle" onClick={() => { setPlanetariumSettings(DEFAULT_PLANETARIUM_SETTINGS); setFit(null); }}><RotateCcw size={14} />Reset dome</button>
            <button type="button" className="button primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

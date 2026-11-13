import {
  ChevronsRight,
  Copy,
  Grid3X3,
  Link2,
  Lock,
  RotateCcw,
  Spline,
  Trash2,
  Unlink,
  Unlock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { DEFAULT_PLAYER_VISUAL, normalizePlayerVisual } from '../lib/appearance';
import { selectionBounds } from '../lib/workflow';
import { useWorkspace } from '../store/useWorkspace';
import type { DomeOrientationMode, PlayerVisualSettings } from '../types';

function VisualRangeField({ label, field, value, min, max, step, display, onChange }: {
  label: string;
  field: keyof PlayerVisualSettings;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (field: keyof PlayerVisualSettings, value: number) => void;
}) {
  return (
    <label className="range-field visual-range-field">
      <span>{label}<output>{display}</output></span>
      <input aria-label={label} data-visual-field={field} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(field, Number(event.target.value))} />
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, min, max, suffix }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input
        type="number"
        aria-label={label}
        value={Number(value.toFixed(3))}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />{suffix && <em>{suffix}</em>}</div>
    </label>
  );
}

export function Inspector({ onMinimize }: { onMinimize: () => void }) {
  const players = useWorkspace((state) => state.players);
  const sources = useWorkspace((state) => state.sources);
  const groups = useWorkspace((state) => state.groups);
  const activeId = useWorkspace((state) => state.activeId);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const selectedNodes = useWorkspace((state) => state.selectedNodes);
  const tool = useWorkspace((state) => state.tool);
  const planetariumSettings = useWorkspace((state) => state.planetariumSettings);
  const updatePlayer = useWorkspace((state) => state.updatePlayer);
  const updatePlayers = useWorkspace((state) => state.updatePlayers);
  const movePlayers = useWorkspace((state) => state.movePlayers);
  const moveNode = useWorkspace((state) => state.moveNode);
  const alignSelected = useWorkspace((state) => state.alignSelected);
  const distributeSelected = useWorkspace((state) => state.distributeSelected);
  const resizeSelected = useWorkspace((state) => state.resizeSelected);
  const duplicatePlayer = useWorkspace((state) => state.duplicatePlayer);
  const removePlayers = useWorkspace((state) => state.removePlayers);
  const setMode = useWorkspace((state) => state.setMode);
  const setTool = useWorkspace((state) => state.setTool);
  const resetShape = useWorkspace((state) => state.resetShape);
  const assignSource = useWorkspace((state) => state.assignSource);
  const setPlayerGroup = useWorkspace((state) => state.setPlayerGroup);
  const updateGroup = useWorkspace((state) => state.updateGroup);
  const removeGroup = useWorkspace((state) => state.removeGroup);
  const createGroup = useWorkspace((state) => state.createGroup);
  const active = players.find((player) => player.id === activeId);

  if (!active) {
    return (
      <aside className="inspector">
        <button className="icon-button inspector-empty-minimize" title="Minimize inspector panel" aria-label="Minimize inspector panel" onClick={onMinimize}><ChevronsRight size={15} /></button>
        <div className="inspector-empty"><Spline size={28} /><strong>No active player</strong><p>Select a surface in the workspace or add a new player.</p></div>
      </aside>
    );
  }

  const group = groups.find((candidate) => candidate.id === active.groupId);
  const members = group ? players.filter((player) => player.groupId === group.id) : [];
  const source = sources.find((candidate) => candidate.id === active.sourceId);
  const hasTimeline = source && !source.live && (source.mediaType === 'video' || source.mediaType === 'audio');
  const selectedPlayers = players.filter((player) => selectedIds.includes(player.id));
  const selectedBounds = selectionBounds(selectedPlayers);
  const selectedNodeId = selectedNodes[active.id]?.length === 1 ? selectedNodes[active.id][0] : null;
  const selectedNode = active.nodes.find((node) => node.id === selectedNodeId);
  const visual = normalizePlayerVisual(active.visual);
  const edit = (patch: Parameters<typeof updatePlayer>[1]) => {
    if (selectedIds.length > 1) updatePlayers(selectedIds, patch);
    else updatePlayer(active.id, patch);
  };
  const editVisual = (field: keyof PlayerVisualSettings, value: number) => {
    edit({ visual: { ...visual, [field]: value } });
  };
  const moveAxis = (axis: 'x' | 'y', value: number) => {
    const delta = value - active.position[axis];
    if (selectedIds.length > 1) movePlayers(selectedIds, axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta });
    else updatePlayer(active.id, { position: { ...active.position, [axis]: value } });
  };
  const updateRate = (rate: number) => {
    const targets = group?.mode === 'transport' ? members : [active];
    targets.forEach((player) => updatePlayer(player.id, { rate }));
  };
  const chooseTool = (nextTool: 'add-border' | 'add-interior') => {
    if (active.mode !== 'advanced') setMode(active.id, 'advanced');
    setTool(tool === nextTool ? 'select' : nextTool);
  };

  return (
    <aside className="inspector scrollable">
      <div className="inspector-title">
        <div><span className="eyebrow">ACTIVE SURFACE</span><input className="player-name-input" value={active.name} onChange={(event) => updatePlayer(active.id, { name: event.target.value })} /></div>
        <span className={`mode-badge ${active.mode}`}>{active.mode === 'quick' ? 'QUICK' : 'NODES'}</span>
        <button className="icon-button tiny" title="Minimize inspector panel" aria-label="Minimize inspector panel" onClick={onMinimize}><ChevronsRight size={14} /></button>
      </div>

      {selectedIds.length > 1 && (
        <>
          <div className="selection-notice"><span>{selectedIds.length} players selected</span><button onClick={() => createGroup(selectedIds)}><Link2 size={12} />Link subset</button></div>
          <section className="inspector-section">
            <div className="inspector-heading">ALIGN / DISTRIBUTE</div>
            <div className="alignment-grid">
              <button onClick={() => alignSelected('left')}>Left</button>
              <button onClick={() => alignSelected('center')}>Center X</button>
              <button onClick={() => alignSelected('right')}>Right</button>
              <button onClick={() => alignSelected(undefined, 'top')}>Top</button>
              <button onClick={() => alignSelected(undefined, 'middle')}>Center Y</button>
              <button onClick={() => alignSelected(undefined, 'bottom')}>Bottom</button>
            </div>
            <div className="toggle-row distribution-actions">
              <button disabled={selectedIds.length < 3} onClick={() => distributeSelected('horizontal')}>Distribute X</button>
              <button disabled={selectedIds.length < 3} onClick={() => distributeSelected('vertical')}>Distribute Y</button>
            </div>
            <div className="number-grid">
              <NumberField label="Selection width" value={selectedBounds.width} min={1} onChange={(width) => resizeSelected(width)} suffix="px" />
              <NumberField label="Selection height" value={selectedBounds.height} min={1} onChange={(height) => resizeSelected(undefined, height)} suffix="px" />
            </div>
          </section>
        </>
      )}

      <section className="inspector-section">
        <div className="inspector-heading">MEDIA SOURCE{selectedIds.length > 1 ? ' / BATCH' : ''}</div>
        <select className="full-select" value={active.sourceId} onChange={(event) => selectedIds.length > 1 ? edit({ sourceId: event.target.value }) : assignSource(active.id, event.target.value)}>
          {sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="property-inline"><span>State</span><strong className={source?.connected ? 'text-mint' : 'text-warning'}>{source?.connected ? source.live ? 'LIVE INPUT' : 'CONNECTED' : 'RECONNECT REQUIRED'}</strong></div>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">LINK GROUP</div>
        <select className="full-select" value={active.groupId ?? ''} onChange={(event) => setPlayerGroup(active.id, event.target.value || undefined)}>
          <option value="">Independent player</option>
          {groups.map((item) => <option key={item.id} value={item.id}>{item.name} · {players.filter((player) => player.groupId === item.id).length} players</option>)}
        </select>
        {group ? (
          <div className="group-controls">
            <div className="segmented vertical-labels">
              <button className={group.mode === 'source' ? 'active' : ''} onClick={() => updateGroup(group.id, { mode: 'source' })}>Source only</button>
              <button className={group.mode === 'transport' ? 'active' : ''} onClick={() => updateGroup(group.id, { mode: 'transport' })}>Source + transport</button>
            </div>
            <p>{group.mode === 'source' ? 'Media is shared. Play, pause, seek, and rate remain independent.' : 'Media, play/pause, seek, and playback rate move together.'}</p>
            <div className="group-members">{members.map((player) => <span key={player.id}>{player.name}</span>)}</div>
            <button className="text-button" onClick={() => removeGroup(group.id)}><Unlink size={12} />Dissolve {group.name}</button>
          </div>
        ) : <p className="section-help">Join an existing group or shift-select players and link a new subset.</p>}
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">MESH EDITOR</div>
        <div className="segmented">
          <button className={active.mode === 'quick' ? 'active' : ''} onClick={() => { setMode(active.id, 'quick'); setTool('select'); }}><Grid3X3 size={13} />4-corner</button>
          <button className={active.mode === 'advanced' ? 'active' : ''} onClick={() => setMode(active.id, 'advanced')}><Spline size={13} />Advanced</button>
        </div>
        <p className="section-help">{active.mode === 'quick' ? 'Projective perspective warp. Drag any corner; the media continuously follows the quad.' : 'Editable constrained mesh. Drag border or interior nodes; media UVs follow every triangle.'}</p>
        {active.mode === 'advanced' && (
          <>
            <div className="node-tools">
              <button className={tool === 'add-border' ? 'active' : ''} onClick={() => chooseTool('add-border')}>+ Border node</button>
              <button className={tool === 'add-interior' ? 'active' : ''} onClick={() => chooseTool('add-interior')}>+ Interior node</button>
            </div>
            <div className="property-inline"><span>Mesh nodes</span><strong>{active.nodes.length} total / {active.border.length} border</strong></div>
            {selectedNode && (
              <div className="number-grid node-coordinate-fields">
                <NumberField label="Node X" value={selectedNode.x} onChange={(x) => moveNode(active.id, selectedNode.id, { x, y: selectedNode.y })} />
                <NumberField label="Node Y" value={selectedNode.y} onChange={(y) => moveNode(active.id, selectedNode.id, { x: selectedNode.x, y })} />
              </div>
            )}
            <p className="section-help">Shift-drag inside the mesh to select nodes. Drag selected nodes together, or double-click one to delete it.</p>
          </>
        )}
        <button className="button subtle full-width" onClick={() => resetShape(active.id)}><RotateCcw size={13} />Reset shape and transform</button>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">TRANSFORM{selectedIds.length > 1 ? ' / BATCH' : ''}</div>
        <div className="number-grid">
          <NumberField label="X" value={active.position.x} onChange={(x) => moveAxis('x', x)} />
          <NumberField label="Y" value={active.position.y} onChange={(y) => moveAxis('y', y)} />
          <NumberField label="Scale" value={active.scale} min={0.05} max={20} step={0.05} onChange={(scale) => edit({ scale: Math.max(0.05, Math.min(20, scale)) })} suffix="×" />
          <NumberField label={active.domeOrientation === 'manual' ? 'Rotation' : 'Rotation offset'} value={active.rotation * 180 / Math.PI} step={1} onChange={(degrees) => edit({ rotation: degrees * Math.PI / 180 })} suffix="°" />
        </div>
        <label className="field-label">Grid-relative orientation
          <select
            className="full-select"
            aria-label="Grid-relative orientation"
            value={active.domeOrientation}
            disabled={!planetariumSettings.enabled || !active.domeWarp || active.domePrewarped}
            onChange={(event) => edit({ domeOrientation: event.target.value as DomeOrientationMode })}
          >
            <option value="manual">Manual</option>
            <option value="top-toward">Top toward point</option>
            <option value="top-away">Top away from point</option>
            <option value="right-toward">Right side toward point</option>
            <option value="right-away">Right side away from point</option>
          </select>
        </label>
        <label className="field-label">Orientation reference point
          <select
            className="full-select"
            aria-label="Orientation reference point"
            value={active.domeOrientationReference}
            disabled={!planetariumSettings.enabled || !active.domeWarp || active.domePrewarped || active.domeOrientation === 'manual'}
            onChange={(event) => edit({ domeOrientationReference: event.target.value })}
          >
            <option value="center">Grid center</option>
            {active.domeOrientationReference !== 'center'
              && !planetariumSettings.calibrationPoints.some((point) => point.id === active.domeOrientationReference)
              && <option value={active.domeOrientationReference}>Missing reference (uses grid center)</option>}
            {planetariumSettings.calibrationPoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
          </select>
        </label>
        <p className="section-help">{active.domeOrientation === 'manual'
          ? 'Manual uses Rotation alone. Choose a facing mode to orient this player relative to a point on the circular grid.'
          : 'Facing follows the selected grid reference. Rotation offset fine-tunes the result. Create named references in Planetarium → Calibration; a missing reference falls back to the grid center.'}</p>
        <label className="range-field"><span>Opacity <output>{Math.round(active.opacity * 100)}%</output></span><input type="range" min="0" max="1" step="0.01" value={active.opacity} onChange={(event) => edit({ opacity: Number(event.target.value) })} /></label>
        <div className="toggle-row">
          <button className={!active.visible ? 'active' : ''} onClick={() => edit({ visible: !active.visible })}>{active.visible ? <Eye size={13} /> : <EyeOff size={13} />}{active.visible ? 'Visible' : 'Hidden'}</button>
          <button className={active.locked ? 'active' : ''} onClick={() => edit({ locked: !active.locked })}>{active.locked ? <Lock size={13} /> : <Unlock size={13} />}{active.locked ? 'Locked' : 'Unlocked'}</button>
        </div>
        <label className="check-field grid-snap-toggle">
          <input
            type="checkbox"
            aria-label="Dome warp"
            checked={active.domeWarp}
            disabled={!planetariumSettings.enabled || active.domePrewarped}
            onChange={(event) => edit({ domeWarp: event.target.checked })}
          />
          Dome warp
        </label>
        <label className="check-field grid-snap-toggle">
          <input
            type="checkbox"
            aria-label="Media is prewarped"
            checked={active.domePrewarped}
            onChange={(event) => edit({ domePrewarped: event.target.checked })}
          />
          Media is already prewarped
        </label>
        <p className="section-help">{active.domePrewarped
          ? 'Projection bypass is active. This media renders without a second dome warp.'
          : planetariumSettings.enabled
            ? 'Project this player’s media onto the dome using the circular grid and fisheye settings.'
            : 'Enable Planetarium mode to make per-player dome warping available.'}</p>
      </section>

      <section className="inspector-section" data-guide-target="media-appearance">
        <div className="inspector-heading">MEDIA APPEARANCE{selectedIds.length > 1 ? ' / BATCH' : ''}</div>
        <div className="number-grid">
          <NumberField
            label="Media rotation"
            value={active.mediaRotation * 180 / Math.PI}
            step={1}
            onChange={(degrees) => edit({ mediaRotation: degrees * Math.PI / 180 })}
            suffix="°"
          />
          <NumberField
            label="Media scale"
            value={active.mediaScale}
            min={0.1}
            max={10}
            step={0.05}
            onChange={(mediaScale) => edit({ mediaScale: Math.max(0.1, Math.min(10, mediaScale)) })}
            suffix="×"
          />
        </div>
        <p className="section-help">Rotate or resize only the media. The player shape, mesh nodes, position, and transform stay unchanged.</p>
        <button className="button subtle full-width" onClick={() => edit({ mediaRotation: 0, mediaScale: 1 })}><RotateCcw size={13} />Reset media transform</button>
      </section>

      <section className="inspector-section" data-guide-target="color-light">
        <div className="inspector-heading">COLOR & LIGHT{selectedIds.length > 1 ? ' / BATCH' : ''}</div>
        <VisualRangeField label="Brightness" field="brightness" value={visual.brightness} min={0} max={2} step={0.01} display={`${Math.round(visual.brightness * 100)}%`} onChange={editVisual} />
        <VisualRangeField label="Contrast" field="contrast" value={visual.contrast} min={0} max={2} step={0.01} display={`${Math.round(visual.contrast * 100)}%`} onChange={editVisual} />
        <VisualRangeField label="Saturation" field="saturation" value={visual.saturation} min={0} max={2} step={0.01} display={`${Math.round(visual.saturation * 100)}%`} onChange={editVisual} />
        <VisualRangeField label="Gamma" field="gamma" value={visual.gamma} min={0.2} max={3} step={0.01} display={visual.gamma.toFixed(2)} onChange={editVisual} />
        <VisualRangeField label="Hue" field="hue" value={visual.hue} min={-180} max={180} step={1} display={`${Math.round(visual.hue)}°`} onChange={editVisual} />
        <VisualRangeField label="Temperature" field="temperature" value={visual.temperature} min={-100} max={100} step={1} display={`${visual.temperature > 0 ? '+' : ''}${Math.round(visual.temperature)}`} onChange={editVisual} />
        <p className="section-help">Adjust this player’s rendered colors without changing its media or shape. Changes also appear in Present mode.</p>
        <button className="button subtle full-width" onClick={() => edit({ visual: { ...DEFAULT_PLAYER_VISUAL } })}><RotateCcw size={13} />Reset visual settings</button>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">PLAYBACK / AUDIO</div>
        <label className="range-field"><span>Volume <output>{Math.round(active.volume * 100)}%</output></span><input type="range" min="0" max="1" step="0.01" value={active.volume} onChange={(event) => updatePlayer(active.id, { volume: Number(event.target.value) })} /></label>
        <div className="toggle-row">
          <button className={active.muted ? 'active' : ''} onClick={() => updatePlayer(active.id, { muted: !active.muted })}>{active.muted ? 'Muted' : 'Audible'}</button>
          <button disabled={!hasTimeline} className={active.loop ? 'active' : ''} onClick={() => updatePlayer(active.id, { loop: !active.loop })}>Loop {active.loop ? 'on' : 'off'}</button>
        </div>
        <label className="select-field"><span>Playback rate</span><select disabled={!hasTimeline} value={active.rate} onChange={(event) => updateRate(Number(event.target.value))}>{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
      </section>

      <section className="inspector-section inspector-footer-actions">
        <button className="button subtle" onClick={() => duplicatePlayer(active.id)}><Copy size={13} />Duplicate</button>
        <button className="button danger" onClick={() => removePlayers(selectedIds.length ? selectedIds : [active.id])}><Trash2 size={13} />Delete{selectedIds.length > 1 ? ` ${selectedIds.length}` : ''}</button>
      </section>
    </aside>
  );
}

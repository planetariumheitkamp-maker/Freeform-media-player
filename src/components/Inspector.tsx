import {
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
import { useWorkspace } from '../store/useWorkspace';

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

export function Inspector() {
  const players = useWorkspace((state) => state.players);
  const sources = useWorkspace((state) => state.sources);
  const groups = useWorkspace((state) => state.groups);
  const activeId = useWorkspace((state) => state.activeId);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const tool = useWorkspace((state) => state.tool);
  const updatePlayer = useWorkspace((state) => state.updatePlayer);
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
    return <aside className="inspector"><div className="inspector-empty"><Spline size={28} /><strong>No active player</strong><p>Select a surface in the workspace or add a new player.</p></div></aside>;
  }

  const group = groups.find((candidate) => candidate.id === active.groupId);
  const members = group ? players.filter((player) => player.groupId === group.id) : [];
  const source = sources.find((candidate) => candidate.id === active.sourceId);
  const hasTimeline = source && !source.live && (source.mediaType === 'video' || source.mediaType === 'audio');
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
      </div>

      {selectedIds.length > 1 && (
        <div className="selection-notice"><span>{selectedIds.length} players selected</span><button onClick={() => createGroup(selectedIds)}><Link2 size={12} />Link subset</button></div>
      )}

      <section className="inspector-section">
        <div className="inspector-heading">MEDIA SOURCE</div>
        <select className="full-select" value={active.sourceId} onChange={(event) => assignSource(active.id, event.target.value)}>
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
            <p className="section-help">Double-click a node to delete it. Invalid folds and self-intersections are rejected.</p>
          </>
        )}
        <button className="button subtle full-width" onClick={() => resetShape(active.id)}><RotateCcw size={13} />Reset shape and transform</button>
      </section>

      <section className="inspector-section">
        <div className="inspector-heading">TRANSFORM</div>
        <div className="number-grid">
          <NumberField label="X" value={active.position.x} onChange={(x) => updatePlayer(active.id, { position: { ...active.position, x } })} />
          <NumberField label="Y" value={active.position.y} onChange={(y) => updatePlayer(active.id, { position: { ...active.position, y } })} />
          <NumberField label="Scale" value={active.scale} min={0.05} max={20} step={0.05} onChange={(scale) => updatePlayer(active.id, { scale: Math.max(0.05, Math.min(20, scale)) })} suffix="×" />
          <NumberField label="Rotation" value={active.rotation * 180 / Math.PI} step={1} onChange={(degrees) => updatePlayer(active.id, { rotation: degrees * Math.PI / 180 })} suffix="°" />
        </div>
        <label className="range-field"><span>Opacity <output>{Math.round(active.opacity * 100)}%</output></span><input type="range" min="0" max="1" step="0.01" value={active.opacity} onChange={(event) => updatePlayer(active.id, { opacity: Number(event.target.value) })} /></label>
        <div className="toggle-row">
          <button className={!active.visible ? 'active' : ''} onClick={() => updatePlayer(active.id, { visible: !active.visible })}>{active.visible ? <Eye size={13} /> : <EyeOff size={13} />}{active.visible ? 'Visible' : 'Hidden'}</button>
          <button className={active.locked ? 'active' : ''} onClick={() => updatePlayer(active.id, { locked: !active.locked })}>{active.locked ? <Lock size={13} /> : <Unlock size={13} />}{active.locked ? 'Locked' : 'Unlocked'}</button>
        </div>
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
        <button className="button danger" onClick={() => removePlayers([active.id])}><Trash2 size={13} />Delete</button>
      </section>
    </aside>
  );
}

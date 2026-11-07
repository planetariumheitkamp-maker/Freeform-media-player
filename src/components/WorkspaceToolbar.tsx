import { CircleDot, Grid3X3, MousePointer2, PenLine, PenTool, Spline } from 'lucide-react';
import { useGuideTarget } from '../lib/guideActions';
import { useWorkspace } from '../store/useWorkspace';
import { GridBackgroundControl } from './GridBackgroundControl';
import { OutputSizeControl } from './OutputSizeControl';
import { PlanetariumControl } from './PlanetariumControl';
import { TraceSettingsControl } from './TraceSettingsControl';

export function WorkspaceToolbar() {
  const tool = useWorkspace((state) => state.tool);
  const setTool = useWorkspace((state) => state.setTool);
  const showMesh = useWorkspace((state) => state.showMesh);
  const setShowMesh = useWorkspace((state) => state.setShowMesh);
  const activeId = useWorkspace((state) => state.activeId);
  const players = useWorkspace((state) => state.players);
  const setMode = useWorkspace((state) => state.setMode);
  const active = players.find((player) => player.id === activeId);

  const chooseTool = (next: 'add-border' | 'add-interior') => {
    if (!active) return;
    if (active.mode !== 'advanced') setMode(active.id, 'advanced');
    setTool(tool === next ? 'select' : next);
  };

  const chooseInteriorTrace = () => {
    if (!active) return;
    if (active.mode !== 'advanced') setMode(active.id, 'advanced');
    setTool(tool === 'trace-interior' ? 'select' : 'trace-interior');
  };

  useGuideTarget('quick-geometry', () => {
    if (active && active.mode !== 'quick' && !active.locked) setMode(active.id, 'quick');
    setTool('select');
  });
  useGuideTarget('advanced-mesh', () => {
    if (active && active.mode !== 'advanced' && !active.locked) setMode(active.id, 'advanced');
    setTool('select');
  });
  useGuideTarget('trace-border', () => setTool('trace-border'));
  useGuideTarget('trace-interior', chooseInteriorTrace);

  return (
    <div className="workspace-toolbar">
      <div className="tool-cluster">
        <button data-guide-target="quick-geometry" className={tool === 'select' ? 'active' : ''} title="Select and move (V)" onClick={() => setTool('select')}><MousePointer2 size={14} /><span>Select</span></button>
        <span className="tool-divider" />
        <button data-guide-target="trace-border" className={`trace-tool ${tool === 'trace-border' ? 'active' : ''}`} title="Draw a freehand border to create a new advanced player" onClick={() => setTool(tool === 'trace-border' ? 'select' : 'trace-border')}><PenTool size={14} /><span>Trace</span></button>
        <button data-guide-target="trace-interior" disabled={!active || active.locked} className={`trace-tool ${tool === 'trace-interior' ? 'active' : ''}`} title="Draw paths of interior nodes inside the active advanced mesh" onClick={chooseInteriorTrace}><PenLine size={14} /><span>Interior trace</span></button>
        <TraceSettingsControl />
        <span className="tool-divider" />
        <button data-guide-target="advanced-mesh" disabled={!active || active.locked} className={tool === 'add-border' ? 'active' : ''} title="Add a node to the nearest border edge" onClick={() => chooseTool('add-border')}><Spline size={14} /><span>Border node</span></button>
        <button disabled={!active || active.locked} className={tool === 'add-interior' ? 'active' : ''} title="Add a node inside the media mesh" onClick={() => chooseTool('add-interior')}><CircleDot size={14} /><span>Interior node</span></button>
        <span className="tool-divider" />
        <button className={showMesh ? 'active' : ''} title="Show or hide mesh overlays (M)" onClick={() => setShowMesh(!showMesh)}><Grid3X3 size={14} /><span>Mesh</span></button>
      </div>
      <div className="tool-cluster workspace-options">
        <OutputSizeControl />
        <GridBackgroundControl />
        <PlanetariumControl />
        <div className="render-status"><span className="status-pulse" />GPU SURFACES<span className="render-separator">/</span>UV WARP ACTIVE</div>
      </div>
    </div>
  );
}

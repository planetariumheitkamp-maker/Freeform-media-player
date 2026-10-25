import { CircleDot, Grid3X3, MousePointer2, Spline } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

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

  return (
    <div className="workspace-toolbar">
      <div className="tool-cluster">
        <button className={tool === 'select' ? 'active' : ''} title="Select and move (V)" onClick={() => setTool('select')}><MousePointer2 size={14} /><span>Select</span></button>
        <span className="tool-divider" />
        <button disabled={!active || active.locked} className={tool === 'add-border' ? 'active' : ''} title="Add a node to the nearest border edge" onClick={() => chooseTool('add-border')}><Spline size={14} /><span>Border node</span></button>
        <button disabled={!active || active.locked} className={tool === 'add-interior' ? 'active' : ''} title="Add a node inside the media mesh" onClick={() => chooseTool('add-interior')}><CircleDot size={14} /><span>Interior node</span></button>
        <span className="tool-divider" />
        <button className={showMesh ? 'active' : ''} title="Show or hide mesh overlays (M)" onClick={() => setShowMesh(!showMesh)}><Grid3X3 size={14} /><span>Mesh</span></button>
      </div>
      <div className="render-status"><span className="status-pulse" />GPU SURFACES<span className="render-separator">/</span>UV WARP ACTIVE</div>
    </div>
  );
}

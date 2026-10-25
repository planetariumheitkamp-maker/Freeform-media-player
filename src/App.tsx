import { Minimize2 } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Inspector } from './components/Inspector';
import { MediaLayer } from './components/MediaLayer';
import { SourceRail } from './components/SourceRail';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { TransportBar } from './components/TransportBar';
import { WarpWorkspace } from './components/WarpWorkspace';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { parseProject, reauthorizeProjectFiles, serializeProject } from './lib/project';
import { runtime } from './lib/runtime';
import { useWorkspace } from './store/useWorkspace';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';

export default function App() {
  const presentation = useWorkspace((state) => state.presentation);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const removePlayers = useWorkspace((state) => state.removePlayers);
  const setPresentation = useWorkspace((state) => state.setPresentation);
  const setTool = useWorkspace((state) => state.setTool);
  const showMesh = useWorkspace((state) => state.showMesh);
  const setShowMesh = useWorkspace((state) => state.setShowMesh);
  const loadProject = useWorkspace((state) => state.loadProject);
  const updateSource = useWorkspace((state) => state.updateSource);
  const pushToast = useWorkspace((state) => state.pushToast);

  useEffect(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return;
    try {
      const project = parseProject(saved);
      loadProject(project);
      void reauthorizeProjectFiles(project.sources, (paths) => runtime.authorizeMedia(paths)).then((updates) => {
        updates.forEach((patch, id) => updateSource(id, patch));
      });
    } catch {
      localStorage.removeItem(AUTOSAVE_KEY);
      pushToast({ title: 'Autosave could not be restored', detail: 'A fresh workspace was opened instead.', tone: 'warning' });
    }
  }, [loadProject, pushToast, updateSource]);

  useEffect(() => {
    let timer = 0;
    const unsubscribe = useWorkspace.subscribe((state, previous) => {
      if (state.players === previous.players && state.sources === previous.sources
        && state.groups === previous.groups && state.projectName === previous.projectName) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, serializeProject(useWorkspace.getState()));
        } catch {
          // Explicit project export remains available when browser storage is unavailable or full.
        }
      }, 700);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const exitPresentation = useCallback(() => {
    setPresentation(false);
    void runtime.setFullscreen(false).catch(() => undefined);
  }, [setPresentation]);

  useEffect(() => {
    if (runtime.isDesktop) return;
    const handleFullscreen = () => {
      if (!document.fullscreenElement && useWorkspace.getState().presentation) setPresentation(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, [setPresentation]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') {
        setTool('select');
        if (useWorkspace.getState().presentation) exitPresentation();
        return;
      }
      if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
        event.preventDefault();
        removePlayers(selectedIds);
      } else if (event.key.toLowerCase() === 'm') {
        setShowMesh(!showMesh);
      } else if (event.key.toLowerCase() === 'v') {
        setTool('select');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [exitPresentation, removePlayers, selectedIds, setShowMesh, setTool, showMesh]);

  return (
    <div className={`app-shell ${presentation ? 'is-presenting' : ''}`}>
      <MediaLayer />
      {!presentation && <TopBar />}
      <div className="app-body">
        {!presentation && <SourceRail />}
        <main className="workspace-column">
          {!presentation && <WorkspaceToolbar />}
          <WarpWorkspace />
          {!presentation && <TransportBar />}
        </main>
        {!presentation && <Inspector />}
      </div>
      {presentation && <button className="exit-presentation" onClick={exitPresentation}><Minimize2 size={15} />Exit presentation <kbd>ESC</kbd></button>}
      <Toasts />
    </div>
  );
}

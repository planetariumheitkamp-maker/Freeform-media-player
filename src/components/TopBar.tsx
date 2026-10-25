import { FolderOpen, Play, Save } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { parseProject, reauthorizeProjectFiles, serializeProject } from '../lib/project';
import { runtime } from '../lib/runtime';
import { useWorkspace } from '../store/useWorkspace';
import { useMedia } from './MediaContext';

export function TopBar() {
  const projectName = useWorkspace((state) => state.projectName);
  const setProjectName = useWorkspace((state) => state.setProjectName);
  const loadProject = useWorkspace((state) => state.loadProject);
  const updateSource = useWorkspace((state) => state.updateSource);
  const setPresentation = useWorkspace((state) => state.setPresentation);
  const pushToast = useWorkspace((state) => state.pushToast);
  const { stopStream } = useMedia();

  const exportProject = useCallback(async () => {
    try {
      const state = useWorkspace.getState();
      const result = await runtime.saveProject(state.projectName, serializeProject(state));
      if (!result.canceled) pushToast({ title: 'Workspace exported', detail: result.path, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Export failed', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  }, [pushToast]);

  const importProject = useCallback(async () => {
    try {
      const result = await runtime.openProject();
      if (result.canceled || !result.content) return;
      const project = parseProject(result.content);
      useWorkspace.getState().sources.filter((source) => source.live).forEach((source) => stopStream(source.id));
      loadProject(project);
      const reconnections = await reauthorizeProjectFiles(project.sources, (paths) => runtime.authorizeMedia(paths));
      reconnections.forEach((patch, id) => updateSource(id, patch));
      pushToast({
        title: 'Workspace imported',
        detail: 'Live inputs stay stopped until you reconnect them. Media files are never embedded in the project.',
        tone: 'success',
      });
    } catch (error) {
      pushToast({ title: 'Import failed', detail: error instanceof Error ? error.message : 'The workspace could not be read.', tone: 'error' });
    }
  }, [loadProject, pushToast, stopStream, updateSource]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void exportProject();
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void importProject();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [exportProject, importProject]);

  const present = async () => {
    setPresentation(true);
    try {
      await runtime.setFullscreen(true);
    } catch {
      pushToast({ title: 'Presentation is windowed', detail: 'The operating system did not grant fullscreen.', tone: 'info' });
    }
  };

  return (
    <header className="top-bar">
      <div className="brand">
        <svg viewBox="0 0 34 34" aria-hidden="true"><path d="M3 7 28 3 31 27 7 31Z" /><path d="m3 7 14 10L28 3M17 17l14 10M17 17 7 31" /></svg>
        <div><strong>FREEFORM</strong><span>MEDIA COMPOSITOR</span></div>
      </div>
      <div className="project-title">
        <span className="save-indicator" />
        <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        <span>LOCAL AUTOSAVE</span>
      </div>
      <div className="top-actions">
        <button className="button subtle" onClick={() => void importProject()}><FolderOpen size={14} />Import</button>
        <button className="button subtle" onClick={() => void exportProject()}><Save size={14} />Export</button>
        <button className="button primary" onClick={() => void present()}><Play size={14} />Present</button>
      </div>
    </header>
  );
}

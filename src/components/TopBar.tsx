import { BookOpen, FolderOpen, History, Library, Package, PanelTopClose, Play, Redo2, Save, ShieldCheck, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useGuideTarget } from '../lib/guideActions';
import { createPortableProject, parseProject, reauthorizeProjectBackground, reauthorizeProjectFiles, serializeProject } from '../lib/project';
import { runtime } from '../lib/runtime';
import { useWorkspace } from '../store/useWorkspace';
import type { ProjectFile } from '../types';
import { FeatureGuideDialog } from './FeatureGuideDialog';
import { useMedia } from './MediaContext';
import { HistoryDialog } from './HistoryDialog';
import { RecoveryDialog } from './RecoveryDialog';
import { SavedWorkspacesDialog } from './SavedWorkspacesDialog';

export function TopBar({ onMinimizeAll, onPresent }: { onMinimizeAll: () => void; onPresent: () => void }) {
  const projectName = useWorkspace((state) => state.projectName);
  const setProjectName = useWorkspace((state) => state.setProjectName);
  const loadProject = useWorkspace((state) => state.loadProject);
  const updateSource = useWorkspace((state) => state.updateSource);
  const setBackground = useWorkspace((state) => state.setBackground);
  const canUndo = useWorkspace((state) => state.canUndo);
  const canRedo = useWorkspace((state) => state.canRedo);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [savedWorkspacesOpen, setSavedWorkspacesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { stopStream } = useMedia();

  const restoreProject = useCallback(async (project: ProjectFile, title: string) => {
    useWorkspace.getState().sources.filter((source) => source.live).forEach((source) => stopStream(source.id));
    loadProject(project);
    const [fileResult, backgroundResult] = await Promise.allSettled([
      reauthorizeProjectFiles(project.sources, (paths) => runtime.authorizeMedia(paths)),
      reauthorizeProjectBackground(project.background, (paths) => runtime.authorizeMedia(paths)),
    ]);

    let unavailableFiles = project.sources.filter((source) => source.kind === 'file').length;
    if (fileResult.status === 'fulfilled') {
      fileResult.value.forEach((patch, id) => updateSource(id, patch));
      unavailableFiles = [...fileResult.value.values()].filter((patch) => !patch.connected).length;
    }
    const background = backgroundResult.status === 'fulfilled'
      ? backgroundResult.value
      : project.background ? { ...project.background, uri: undefined } : null;
    setBackground(background, false);

    const notices: string[] = [];
    if (unavailableFiles > 0) notices.push(`${unavailableFiles} local media ${unavailableFiles === 1 ? 'file needs' : 'files need'} to be re-added.`);
    if (project.background && !background?.uri) notices.push('The custom grid image needs to be re-added.');
    if (project.sources.some((source) => source.live)) notices.push('Live inputs stay stopped until reconnected.');
    pushToast({
      title,
      detail: notices.join(' ') || 'Workspace layout and settings restored.',
      tone: notices.length ? 'warning' : 'success',
    });
  }, [loadProject, pushToast, setBackground, stopStream, updateSource]);

  const saveToFile = useCallback(async () => {
    try {
      const state = useWorkspace.getState();
      const result = await runtime.saveProject(state.projectName, serializeProject(state));
      if (!result.canceled) pushToast({ title: 'Workspace saved to file', detail: result.path, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Save failed', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  }, [pushToast]);

  const savePortable = useCallback(async () => {
    try {
      const state = useWorkspace.getState();
      pushToast({ title: 'Preparing portable workspace', detail: 'Embedding connected local media and the custom grid…', tone: 'info' });
      const content = await createPortableProject(state);
      const result = await runtime.saveProject(`${state.projectName} portable`, content);
      if (!result.canceled) pushToast({ title: 'Portable workspace saved', detail: result.path, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Portable export failed', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  }, [pushToast]);

  const openFromFile = useCallback(async () => {
    try {
      const result = await runtime.openProject();
      if (result.canceled || !result.content) return;
      await restoreProject(parseProject(result.content), 'Workspace opened');
    } catch (error) {
      pushToast({ title: 'Open failed', detail: error instanceof Error ? error.message : 'The workspace could not be read.', tone: 'error' });
    }
  }, [pushToast, restoreProject]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveToFile();
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openFromFile();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openFromFile, saveToFile]);

  useGuideTarget('present', onPresent);
  useGuideTarget('saves', () => setSavedWorkspacesOpen(true));
  useGuideTarget('history', () => setHistoryOpen(true));
  useGuideTarget('recovery', () => setRecoveryOpen(true));

  return (
    <>
      <header className="top-bar">
        <div className="brand">
          <svg viewBox="0 0 34 34" aria-hidden="true"><path d="M3 7 28 3 31 27 7 31Z" /><path d="m3 7 14 10L28 3M17 17l14 10M17 17 7 31" /></svg>
          <div><strong>FREEFORM</strong><span>MEDIA WITHOUT STRAIGHT EDGES</span></div>
        </div>
        <div className="project-title">
          <span className="save-indicator" />
          <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <span>LOCAL AUTOSAVE</span>
        </div>
        <div className="top-actions">
          <button className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useWorkspace.getState().undo()}><Undo2 size={15} /></button>
          <button className="icon-button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => useWorkspace.getState().redo()}><Redo2 size={15} /></button>
          <button data-guide-target="history" className="icon-button" aria-label="Edit history" title="Edit history" onClick={() => setHistoryOpen(true)}><History size={15} /></button>
          <button data-guide-target="recovery" className="icon-button" aria-label="Recovery and diagnostics" title="Recovery & diagnostics" onClick={() => setRecoveryOpen(true)}><ShieldCheck size={15} /></button>
          <button data-guide-target="saves" className="button subtle" onClick={() => setSavedWorkspacesOpen(true)}><Library size={14} />Saves</button>
          <button className="button subtle" onClick={() => void openFromFile()}><FolderOpen size={14} />Open</button>
          <button className="button subtle" onClick={() => void saveToFile()}><Save size={14} />Save file</button>
          <button className="button subtle" title="Export a workspace with connected local media embedded" onClick={() => void savePortable()}><Package size={14} />Portable</button>
          <button className="button subtle" title="Open the interactive feature guide" onClick={() => setGuideOpen(true)}><BookOpen size={14} />Guide</button>
          <button className="icon-button" aria-label="Hide all control panels" title="Hide all control panels (Shift+F)" onClick={onMinimizeAll}><PanelTopClose size={15} /></button>
          <button data-guide-target="present" className="button primary" onClick={onPresent}><Play size={14} />Present</button>
        </div>
      </header>
      {guideOpen && <FeatureGuideDialog onClose={() => setGuideOpen(false)} />}
      {historyOpen && <HistoryDialog onClose={() => setHistoryOpen(false)} />}
      {recoveryOpen && <RecoveryDialog onClose={() => setRecoveryOpen(false)} onRestore={restoreProject} />}
      {savedWorkspacesOpen && (
        <SavedWorkspacesDialog
          onClose={() => setSavedWorkspacesOpen(false)}
          onRestore={(project) => restoreProject(project, 'Workspace restored')}
        />
      )}
    </>
  );
}

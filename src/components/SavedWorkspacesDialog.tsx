import { FolderOpen, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { parseProject, serializeProject } from '../lib/project';
import {
  MAX_WORKSPACE_SAVES,
  putWorkspaceSave,
  readWorkspaceSaves,
  removeWorkspaceSave,
  serializeWorkspaceSaves,
  WORKSPACE_SAVES_KEY,
  type WorkspaceSave,
} from '../lib/workspaceSaves';
import { useWorkspace } from '../store/useWorkspace';
import type { ProjectFile } from '../types';
import { Dialog } from './Dialog';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function summarize(save: WorkspaceSave): string {
  try {
    const project = parseProject(save.content);
    const players = `${project.players.length} ${project.players.length === 1 ? 'player' : 'players'}`;
    const sources = `${project.sources.length} ${project.sources.length === 1 ? 'source' : 'sources'}`;
    const output = project.output ?? { width: 1600, height: 900 };
    return `${players} · ${sources} · ${output.width} × ${output.height}`;
  } catch {
    return 'Workspace data is invalid';
  }
}

export function SavedWorkspacesDialog({ onClose, onRestore }: {
  onClose: () => void;
  onRestore: (project: ProjectFile) => Promise<void>;
}) {
  const setProjectName = useWorkspace((state) => state.setProjectName);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [name, setName] = useState(() => useWorkspace.getState().projectName);
  const [saves, setSaves] = useState<WorkspaceSave[]>(() => {
    try {
      return readWorkspaceSaves(localStorage.getItem(WORKSPACE_SAVES_KEY));
    } catch {
      return [];
    }
  });
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const persist = (next: WorkspaceSave[]) => {
    localStorage.setItem(WORKSPACE_SAVES_KEY, serializeWorkspaceSaves(next));
    setSaves(next);
  };

  const saveCurrent = (existingId?: string) => {
    try {
      const state = useWorkspace.getState();
      const saveName = (existingId ? state.projectName : name).trim();
      const content = serializeProject({ ...state, projectName: saveName });
      const latest = readWorkspaceSaves(localStorage.getItem(WORKSPACE_SAVES_KEY));
      const next = putWorkspaceSave(latest, { id: existingId, name: saveName, content });
      persist(next);
      setProjectName(saveName);
      setName(saveName);
      setDeleteId(null);
      setError('');
      pushToast({
        title: existingId ? 'Internal save updated' : 'Workspace saved internally',
        detail: `${saveName} · ${next.length} of ${MAX_WORKSPACE_SAVES} slots used`,
        tone: 'success',
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The workspace could not be saved internally.');
    }
  };

  const restore = async (save: WorkspaceSave) => {
    setLoadingId(save.id);
    setError('');
    try {
      await onRestore(parseProject(save.content));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The saved workspace could not be restored.');
    } finally {
      setLoadingId(null);
    }
  };

  const remove = (id: string) => {
    try {
      const latest = readWorkspaceSaves(localStorage.getItem(WORKSPACE_SAVES_KEY));
      persist(removeWorkspaceSave(latest, id));
      setDeleteId(null);
      setError('');
      pushToast({ title: 'Internal save deleted', tone: 'info' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The internal save could not be deleted.');
    }
  };

  return (
    <Dialog title="Saved workspaces" eyebrow="INTERNAL LIBRARY / 10 SLOTS" onClose={onClose}>
      <div className="dialog-form saved-workspaces-dialog">
        <p className="form-help">Keep up to 10 complete workspace snapshots in this application profile. These named saves are separate from the rolling autosave. Media content is not copied; local file references are restored from their saved paths.</p>
        <form className="save-current-form" onSubmit={(event) => {
          event.preventDefault();
          saveCurrent();
        }}>
          <label className="field-label">
            <span>New save name</span>
            <input aria-label="New save name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace name" />
          </label>
          <button type="submit" className="button primary" disabled={!name.trim() || saves.length >= MAX_WORKSPACE_SAVES}>
            <Plus size={14} />Save current
          </button>
        </form>
        <div className="saved-slots-heading">
          <span className="inspector-heading">INTERNAL SAVES</span>
          <span>{saves.length} / {MAX_WORKSPACE_SAVES} slots used</span>
        </div>
        {saves.length >= MAX_WORKSPACE_SAVES && <p className="section-help">All slots are used. Overwrite an existing slot with the current workspace, or delete a slot to create a new save.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="saved-slots" aria-label="Internal workspace saves">
          {saves.length === 0 ? (
            <div className="saved-slots-empty">
              <Save size={24} />
              <strong>No named saves yet</strong>
              <span>Use Save current to create the first internal snapshot.</span>
            </div>
          ) : saves.map((save, index) => (
            <article className="saved-slot" key={save.id}>
              <div className="saved-slot-copy">
                <span className="saved-slot-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{save.name}</strong>
                  <span>{summarize(save)}</span>
                  <small>{dateFormatter.format(new Date(save.savedAt))}</small>
                </div>
              </div>
              <div className="saved-slot-actions">
                <button type="button" className="button subtle" disabled={loadingId !== null} onClick={() => void restore(save)}>
                  <FolderOpen size={13} />{loadingId === save.id ? 'Loading…' : 'Load'}
                </button>
                <button type="button" className="button subtle" disabled={loadingId !== null} onClick={() => saveCurrent(save.id)}>
                  <Save size={13} />Overwrite
                </button>
                {deleteId === save.id ? (
                  <>
                    <button type="button" className="button danger" onClick={() => remove(save.id)}>Confirm delete</button>
                    <button type="button" className="button subtle" onClick={() => setDeleteId(null)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className="icon-button danger-hover" aria-label={`Delete ${save.name}`} title="Delete internal save" onClick={() => setDeleteId(save.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <p className="section-help">Loading a save replaces the current workspace. Live captures remain stopped until reconnected.</p>
        <div className="dialog-actions">
          <button type="button" className="button subtle" onClick={onClose}>Close</button>
        </div>
      </div>
    </Dialog>
  );
}

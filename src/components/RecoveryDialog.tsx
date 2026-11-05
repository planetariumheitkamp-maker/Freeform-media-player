import { Download, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { createDiagnosticsReport, readRecoveryGenerations } from '../lib/recovery';
import { parseProject } from '../lib/project';
import { runtime } from '../lib/runtime';
import { useWorkspace } from '../store/useWorkspace';
import type { ProjectFile } from '../types';
import { Dialog } from './Dialog';

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export function RecoveryDialog({ onClose, onRestore }: {
  onClose: () => void;
  onRestore: (project: ProjectFile, title: string) => Promise<void>;
}) {
  const pushToast = useWorkspace((state) => state.pushToast);
  const [generations, setGenerations] = useState(() => readRecoveryGenerations(localStorage));
  const [busy, setBusy] = useState<number | null>(null);
  const restore = async (generation: number, content: string) => {
    setBusy(generation);
    try {
      await onRestore(parseProject(content), `Recovery generation ${generation || 'legacy'} restored`);
      onClose();
    } catch (error) {
      pushToast({ title: 'Recovery snapshot is invalid', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
      setGenerations(readRecoveryGenerations(localStorage));
    } finally {
      setBusy(null);
    }
  };
  const downloadDiagnostics = async () => {
    try {
      const result = await runtime.saveProject('Freeform diagnostics', createDiagnosticsReport(useWorkspace.getState(), localStorage));
      if (!result.canceled) pushToast({ title: 'Diagnostics report saved', detail: result.path, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Diagnostics export failed', detail: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };
  return (
    <Dialog title="Recovery & diagnostics" eyebrow="LOCAL PROJECT PROTECTION" onClose={onClose}>
      <div className="recovery-intro"><ShieldCheck size={20} /><p>Five rotating snapshots are kept separately from your ten named saves. Startup automatically falls back to the newest valid generation.</p></div>
      <div className="recovery-list">
        {generations.map((generation) => (
          <div className="recovery-row" key={`${generation.generation}-${generation.savedAt}`}>
            <div><strong>Generation {generation.generation || 'legacy'}</strong><span>{generation.savedAt ? dateFormatter.format(new Date(generation.savedAt)) : 'Previous autosave format'} · {(generation.content.length / 1024).toFixed(1)} KB</span></div>
            <button className="button subtle" disabled={busy !== null} onClick={() => void restore(generation.generation, generation.content)}><RotateCcw size={13} />{busy === generation.generation ? 'Restoring…' : 'Restore'}</button>
          </div>
        ))}
        {!generations.length && <div className="history-empty">No recovery snapshots yet. They appear automatically after the first workspace edit.</div>}
      </div>
      <div className="diagnostics-footer">
        <p>Diagnostics include runtime details, source connection states, recovery metadata, and recent renderer errors. Saved media paths are not included.</p>
        <button className="button subtle" onClick={() => void downloadDiagnostics()}><Download size={14} />Export diagnostics</button>
      </div>
    </Dialog>
  );
}

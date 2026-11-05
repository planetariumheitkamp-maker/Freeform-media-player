import { Redo2, Undo2 } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { Dialog } from './Dialog';

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const past = useWorkspace((state) => state.historyPast);
  const future = useWorkspace((state) => state.historyFuture);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);
  return (
    <Dialog title="Edit history" eyebrow="WORKSPACE JOURNAL" onClose={onClose}>
      <div className="history-dialog">
        <div className="history-summary">
          <span>{past.length} undoable {past.length === 1 ? 'step' : 'steps'}</span>
          <span>Up to 100 grouped edits</span>
        </div>
        <div className="history-list">
          {[...future].reverse().map((label, index) => (
            <button key={`future-${index}`} className="history-entry future" onClick={redo}>
              <Redo2 size={13} /><span>{label}</span><small>Redo</small>
            </button>
          ))}
          <div className="history-entry current"><span className="history-current-dot" /><span>Current workspace</span><small>Now</small></div>
          {[...past].reverse().map((label, index) => (
            <button key={`past-${index}`} className="history-entry" onClick={undo}>
              <Undo2 size={13} /><span>{label}</span><small>Undo</small>
            </button>
          ))}
          {!past.length && !future.length && <div className="history-empty">Geometry and setting changes will appear here as one entry per completed edit.</div>}
        </div>
        <p className="section-help">Pointer drags are grouped into a single step. Playback and selection changes intentionally stay outside geometry history.</p>
      </div>
    </Dialog>
  );
}

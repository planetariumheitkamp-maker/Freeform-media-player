import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Toasts() {
  const toasts = useWorkspace((state) => state.toasts);
  const dismissToast = useWorkspace((state) => state.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">
            {toast.tone === 'success' ? <CheckCircle2 size={17} /> : toast.tone === 'error' ? <XCircle size={17} /> : toast.tone === 'warning' ? <AlertTriangle size={17} /> : <Info size={17} />}
          </span>
          <div><strong>{toast.title}</strong>{toast.detail && <p>{toast.detail}</p>}</div>
          <button className="icon-button tiny" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

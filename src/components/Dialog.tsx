import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Dialog({ title, eyebrow, children, onClose }: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button>
        </header>
        <div className="dialog-content">{children}</div>
      </section>
    </div>
  );
}

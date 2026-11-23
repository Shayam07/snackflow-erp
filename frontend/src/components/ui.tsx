import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox, X } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, title, subtitle, description, onClose, children, footer, wide = false }: {
  open: boolean;
  title: string;
  subtitle?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const sub = subtitle ?? description;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <p className="muted text-xs mt-0.5">{sub}</p>}
          </div>
          <button className="small-btn !p-1.5 hover:bg-canvas" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Inbox size={20} />}</div>
      <p className="text-sm font-bold text-navy">{title}</p>
      {description && <p className="muted text-xs max-w-sm text-center">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 py-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-3 bg-canvas/60 rounded border border-border/50 animate-pulse">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <span
              key={columnIndex}
              className="h-3.5 bg-slate-subtle rounded"
              style={{ width: `${Math.floor(60 + Math.random() * 35)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between pt-3 mt-2 border-t border-border text-xs">
      <span className="muted">
        Showing <strong>{total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)}</strong> of <strong>{total}</strong> entries
      </span>
      <div className="flex items-center gap-1.5">
        <button className="small-btn" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          <ChevronLeft size={13} /> Previous
        </button>
        <span className="text-xs text-charcoal font-semibold px-2 tabular-nums">Page {page} of {pages}</span>
        <button
          className="small-btn"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

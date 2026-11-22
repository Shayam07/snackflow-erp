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
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, title, subtitle, onClose, children, footer, wide = false }: {
  open: boolean;
  title: string;
  subtitle?: string;
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
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted text-xs">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
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
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {description && <p className="muted text-xs max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-row">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <span key={columnIndex} className="skeleton-bar" />
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
    <div className="pagination">
      <span className="muted text-xs">
        Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button className="small-btn" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          <ChevronLeft size={13} /> Prev
        </button>
        <span className="text-xs text-slate-400 tabular-nums">Page {page} / {pages}</span>
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
      {label}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

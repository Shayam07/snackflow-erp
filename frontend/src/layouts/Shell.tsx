import { useState, type ReactNode } from "react";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { api, clearSession } from "../services/api";
import { navForRole } from "../lib/nav";
import { Field, Modal } from "../components/ui";
import { useToast } from "../components/Toast";

type Props = {
  page: string;
  setPage: (page: string) => void;
  role: string;
  username: string;
  logout: () => void;
  children: ReactNode;
};

const roleBadgeColor: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  production: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  salesman: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  auditor: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  owner: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

export default function Shell({ page, setPage, role, username, logout, children }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });

  const items = navForRole(role);
  const active = items.find((item) => item.key === page);

  function navigate(next: string) {
    setPage(next);
    setOpen(false);
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (form.new_password !== form.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: form.current_password,
          new_password: form.new_password,
        }),
      });
      toast.success("Password updated");
      setPasswordOpen(false);
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (exception: any) {
      toast.error(exception.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="font-bold text-slate-100 tracking-tight">SnackFlow</div>
            <div className="muted text-xs">Manufacturing ERP</div>
          </div>
          <button className="icon-btn ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>

        <div className="mt-8 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">
          Workspace
        </div>

        <nav className="mt-2.5 space-y-1">
          {items.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${page === key ? "active" : ""}`}
              onClick={() => navigate(key)}
              aria-current={page === key ? "page" : undefined}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="avatar">{username.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-100">{username}</div>
              <span className={`mt-0.5 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeColor[role] || "border-slate-700 text-slate-300"}`}>
                {role}
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button className="small-btn" onClick={() => setPasswordOpen(true)}>
              <KeyRound size={12} /> Password
            </button>
            <button
              className="small-btn"
              onClick={() => {
                clearSession();
                logout();
              }}
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
              SnackFlow ERP
            </div>
            <div className="truncate text-sm font-semibold text-slate-100">
              {active?.label ?? "Overview"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[11px] text-slate-400 sm:flex">
              <span className="status-dot" /> Live ledger
            </span>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>

      <Modal open={passwordOpen} title="Change password"
        subtitle="Your session stays active after the change." onClose={() => setPasswordOpen(false)}>
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Current password">
            <input className="field" type="password" required value={form.current_password}
              onChange={(event) => setForm({ ...form, current_password: event.target.value })} />
          </Field>
          <Field label="New password" hint="Minimum 8 characters">
            <input className="field" type="password" required minLength={8} value={form.new_password}
              onChange={(event) => setForm({ ...form, new_password: event.target.value })} />
          </Field>
          <Field label="Confirm new password">
            <input className="field" type="password" required minLength={8} value={form.confirm}
              onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" className="secondary-btn" onClick={() => setPasswordOpen(false)}>Cancel</button>
            <button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { useState, useEffect, type ReactNode } from "react";
import {
  Bell, ChevronLeft, ChevronRight, KeyRound, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, Shield, User as UserIcon, X,
} from "lucide-react";
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

const roleBadge: Record<string, { label: string; bg: string; text: string; border: string }> = {
  admin: { label: "Factory Admin", bg: "bg-navy-subtle", text: "text-navy", border: "border-navy/20" },
  production: { label: "Production Floor", bg: "bg-amber-subtle", text: "text-amber-dark", border: "border-amber/30" },
  salesman: { label: "Field Sales", bg: "bg-teal-subtle", text: "text-teal-dark", border: "border-teal/30" },
  auditor: { label: "Statutory Auditor", bg: "bg-slate-subtle", text: "text-charcoal", border: "border-slate/30" },
  owner: { label: "Business Owner", bg: "bg-amber-subtle", text: "text-amber-dark", border: "border-amber/40" },
};

export default function Shell({ page, setPage, role, username, logout, children }: Props) {
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("snackflow_sidebar_collapsed") === "true";
  });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });

  useEffect(() => {
    localStorage.setItem("snackflow_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  const items = navForRole(role);
  const active = items.find((item) => item.key === page);
  const roleInfo = roleBadge[role] || { label: role, bg: "bg-slate-subtle", text: "text-charcoal", border: "border-slate/30" };

  function navigate(next: string) {
    setPage(next);
    setMobileOpen(false);
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
      toast.success("Password updated successfully");
      setPasswordOpen(false);
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (exception: any) {
      toast.error(exception.message);
    } finally {
      setBusy(false);
    }
  }

  // Format today's date
  const todayFormatted = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* Sophisticated Dark Midnight Navy Sidebar (#142B3B) */}
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-open" : ""}`}>
        {/* Brand Header */}
        <div className="sidebar-head">
          <div className="brand">
            <div className="brand-mark" title="SnackFlow ERP">S</div>
            {!collapsed && (
              <div className="brand-text">
                <div className="brand-title">SnackFlow</div>
                <div className="brand-sub">Manufacturing ERP</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Collapse Toggle */}
            <button
              type="button"
              className="hidden lg:flex p-1.5 rounded text-slate-light hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label="Toggle sidebar width"
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            {/* Mobile Close Button */}
            <button
              type="button"
              className="flex lg:hidden p-1.5 rounded text-slate-light hover:text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Section */}
        {!collapsed && (
          <div className="nav-section-title">Operations & Ledger</div>
        )}

        <nav className="mt-1 space-y-0.5 overflow-y-auto flex-1 py-1">
          {items.map(({ key, label, icon: Icon }) => {
            const isActive = page === key;
            return (
              <button
                key={key}
                type="button"
                className={`nav-item ${isActive ? "active" : ""} ${collapsed ? "!justify-center !px-0" : ""}`}
                onClick={() => navigate(key)}
                title={collapsed ? label : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="nav-item-icon">
                  <Icon size={17} />
                </span>
                {!collapsed && <span>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with User Profile */}
        <div className="sidebar-foot">
          <div className={`user-card ${collapsed ? "justify-center" : ""}`}>
            <div className="avatar" title={username}>
              {username.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white leading-tight">{username}</div>
                <div className="truncate text-[10.5px] text-teal-light font-medium capitalize mt-0.5">
                  {roleInfo.label}
                </div>
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="mt-3 grid grid-cols-2 gap-1.5 pt-2 border-t border-white/10">
              <button
                type="button"
                className="small-btn !bg-navy-light/60 !text-slate-light hover:!text-white !border-white/10 !py-1 text-[11px]"
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound size={12} /> Key
              </button>
              <button
                type="button"
                className="small-btn !bg-navy-light/60 !text-slate-light hover:!text-crimson !border-white/10 !py-1 text-[11px]"
                onClick={() => {
                  clearSession();
                  logout();
                }}
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <div className={`main-col ${collapsed ? "main-col-collapsed" : ""}`}>
        {/* Topbar: Clean Surface (#FFFFFF) */}
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-1.5 rounded-md border border-border text-charcoal lg:hidden hover:bg-canvas"
              onClick={() => setMobileOpen(true)}
              aria-label="Open mobile menu"
            >
              <Menu size={18} />
            </button>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate">
                SnackFlow ERP / Operations
              </div>
              <div className="text-sm font-bold text-navy flex items-center gap-2">
                <span>{active?.label ?? "Dashboard"}</span>
              </div>
            </div>
          </div>

          {/* Right Topbar Elements */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Date Indicator */}
            <div className="hidden md:flex items-center text-xs font-medium text-slate">
              <span>{todayFormatted}</span>
            </div>

            {/* Live Ledger Status Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-subtle border border-emerald/20 text-[11px] font-semibold text-emerald-dark">
              <span className="status-dot" />
              <span>Live Ledger Connected</span>
            </div>

            {/* Role Pill */}
            <div className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${roleInfo.bg} ${roleInfo.text} ${roleInfo.border}`}>
              <Shield size={11} />
              <span>{roleInfo.label}</span>
            </div>

            {/* Quick Profile / Logout button on mobile */}
            <button
              type="button"
              onClick={() => {
                clearSession();
                logout();
              }}
              className="small-btn text-xs hover:text-crimson"
              title="Sign out"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">{children}</main>
      </div>

      {/* Change Password Modal */}
      <Modal
        open={passwordOpen}
        title="Change Security Password"
        subtitle="Your active credentials will be updated immediately in the database."
        onClose={() => setPasswordOpen(false)}
      >
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Current password">
            <input
              className="field"
              type="password"
              required
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            />
          </Field>
          <Field label="New password" hint="Minimum 8 characters">
            <input
              className="field"
              type="password"
              required
              minLength={8}
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="field"
              type="password"
              required
              minLength={8}
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className="secondary-btn" onClick={() => setPasswordOpen(false)}>
              Cancel
            </button>
            <button className="primary-btn" disabled={busy}>
              {busy ? "Saving…" : "Update Password"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

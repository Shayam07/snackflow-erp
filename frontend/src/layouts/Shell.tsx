import { Activity, Boxes, ClipboardList, Factory, FileText, LayoutDashboard, LogOut, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
type Props = { page: string; setPage: (p: string) => void; role: string; username: string; logout: () => void; children: ReactNode };
const nav = [
  ["Overview", "dashboard", LayoutDashboard], ["Orders", "orders", ShoppingCart],
  ["Inventory", "inventory", Boxes], ["Production", "production", Factory],
  ["Reports", "reports", FileText]
] as const;
export default function Shell({ page, setPage, role, username, logout, children }: Props) {
  const rolePages: Record<string, string[]> = {
    salesman: ["dashboard", "orders"],
    production: ["dashboard", "inventory", "production"],
    auditor: ["dashboard", "inventory", "reports"],
    owner: ["dashboard", "inventory", "production", "reports"],
    admin: nav.map(n => n[1])
  };
  const allowed = rolePages[role] || ["dashboard"];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><div className="font-semibold">SnackFlow</div><div className="muted text-xs">Manufacturing ERP</div></div></div>
      <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">Workspace</div>
      <nav className="mt-3 space-y-1">{nav.filter(n => allowed.includes(n[1])).map(([label,key,Icon]) => <button key={key} onClick={() => setPage(key)} className={`nav-link ${page===key?"active":""}`}><Icon size={17}/>{label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="user-pill"><div className="avatar">{username.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{username}</div><div className="muted text-xs capitalize">{role}</div></div><button onClick={logout} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div><div className="muted text-xs">WORKSPACE / {page.toUpperCase()}</div><div className="mt-1 text-lg font-semibold">{nav.find(n=>n[1]===page)?.[0] || "Workspace"}</div></div><div className="flex items-center gap-3"><span className="status-dot"></span><span className="muted text-xs">System operational</span></div></header><div className="content">{children}</div></main>
    <nav className="mobile-nav">{nav.filter(n => allowed.includes(n[1])).slice(0,4).map(([label,key,Icon]) => <button key={key} onClick={() => setPage(key)} className={page===key?"selected":""}><Icon size={19}/><span>{label}</span></button>)}</nav>
  </div>;
}

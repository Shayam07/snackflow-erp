import { useState, type FormEvent } from "react";
import { ArrowRight, Boxes, Check, Sparkles, UserCheck } from "lucide-react";
import { api } from "../services/api";

type Props = { onLogin: (data: any) => void };

const demoAccounts = [
  { role: "Factory Admin", username: "admin", pass: "admin123", desc: "Full control & approvals", color: "from-purple-500/20 to-indigo-500/10 text-purple-300 border-purple-500/30" },
  { role: "Production Floor", username: "production", pass: "prod123", desc: "BOM batches & run costs", color: "from-amber-500/20 to-orange-500/10 text-amber-300 border-amber-500/30" },
  { role: "Field Sales A", username: "salesman_a", pass: "sales123", desc: "Sales orders & retail sync", color: "from-emerald-500/20 to-teal-500/10 text-emerald-300 border-emerald-500/30" },
  { role: "Auditor", username: "auditor", pass: "audit123", desc: "Read-only ledger & GST", color: "from-blue-500/20 to-cyan-500/10 text-blue-300 border-blue-500/30" },
  { role: "Owner", username: "owner", pass: "owner123", desc: "Executive KPI dashboard", color: "from-rose-500/20 to-pink-500/10 text-rose-300 border-rose-500/30" },
];

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function performLogin(u = username, p = password) {
    setBusy(true);
    setError("");
    try {
      const data = await api<any>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: u, password: p }),
      });
      localStorage.setItem("snackflow_token", data.access_token);
      onLogin(data);
    } catch (err: any) {
      setError(err.message || "Login failed. Ensure backend is running and seeded.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void performLogin();
  }

  function quickLogin(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    void performLogin(u, p);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="flex items-center justify-between">
          <div className="brand">
            <div className="brand-mark">
              <Boxes size={22} />
            </div>
            <div>
              <div className="font-bold text-lg text-slate-100 tracking-tight">SnackFlow ERP</div>
              <div className="muted text-xs">Order-to-Audit Management</div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            <span className="status-dot" /> Online
          </span>
        </div>

        <div className="mt-8">
          <div className="eyebrow flex items-center gap-1.5">
            <Sparkles size={13} /> WELCOME BACK
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Sign in to your factory</h1>
          <p className="muted mt-1 text-xs">
            Enter credentials or select a one-click demo persona below.
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="field-label">
            Username
            <input
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              required
            />
          </label>
          <label className="field-label">
            Password
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn w-full" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800/80 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <UserCheck size={14} className="text-emerald-400" /> Quick Demo Logins
            </span>
            <span className="text-[10px] text-slate-500">1-click switch</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {demoAccounts.map((acc) => (
              <button
                key={acc.username}
                type="button"
                onClick={() => quickLogin(acc.username, acc.pass)}
                disabled={busy}
                className={`flex flex-col text-left p-2.5 rounded-xl border bg-gradient-to-br transition-all hover:scale-[1.02] active:scale-[0.98] ${acc.color}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-200">{acc.role}</span>
                  {username === acc.username && <Check size={12} className="text-emerald-400" />}
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5">{acc.username} · {acc.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

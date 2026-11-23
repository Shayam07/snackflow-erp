import { useState, type FormEvent } from "react";
import { ArrowRight, Boxes, Check, Factory, KeyRound, Lock, ShieldCheck, User } from "lucide-react";
import { api } from "../services/api";

type Props = { onLogin: (data: any) => void };

const demoAccounts = [
  {
    role: "Factory Admin",
    username: "admin",
    pass: "admin123",
    desc: "Complete operational control, master data & approvals",
    borderClass: "border-[#142B3B]/40 hover:border-[#142B3B] hover:bg-[#142B3B]/5",
    badge: "Full Access",
  },
  {
    role: "Production Floor",
    username: "production",
    pass: "prod123",
    desc: "Batch execution, BOM consumption, overhead costs",
    borderClass: "border-[#087F8C]/40 hover:border-[#087F8C] hover:bg-[#087F8C]/5",
    badge: "Manufacturing",
  },
  {
    role: "Field Sales Rep",
    username: "salesman_a",
    pass: "sales123",
    desc: "Wholesale retail orders & offline-first queue",
    borderClass: "border-[#21865B]/40 hover:border-[#21865B] hover:bg-[#21865B]/5",
    badge: "Distribution",
  },
  {
    role: "Statutory Auditor",
    username: "auditor",
    pass: "audit123",
    desc: "Read-only stock ledger, GST & traceability logs",
    borderClass: "border-[#657580]/40 hover:border-[#657580] hover:bg-[#657580]/5",
    badge: "Compliance",
  },
  {
    role: "Managing Director",
    username: "owner",
    pass: "owner123",
    desc: "Executive financial KPIs & cash collection trajectory",
    borderClass: "border-[#F2A541]/50 hover:border-[#F2A541] hover:bg-[#F2A541]/5",
    badge: "Executive",
  },
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
      setError(err.message || "Login failed. Ensure backend server is running and seeded.");
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
    <div className="min-h-screen bg-[#F5F6F2] flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* TOP BRAND CARD */}
        <div className="bg-white rounded-lg border border-[#DFE3E6] shadow-sm overflow-hidden">
          {/* Header banner */}
          <div className="bg-[#142B3B] p-6 text-white flex items-center justify-between border-b border-[#087F8C]/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-[#087F8C] flex items-center justify-center text-white font-bold">
                <Factory size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">SnackFlow ERP</h1>
                <p className="text-xs text-white/70">Industrial Manufacturing & Distribution Platform</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#21865B]/20 text-[#21865B] border border-[#21865B]/30 bg-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#21865B] animate-pulse" /> Factory Online
            </span>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-[#142B3B]">Authorized Operator Sign-In</h2>
              <p className="text-xs text-[#657580] mt-0.5">
                Enter your system credentials or select a pre-configured role below.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <label className="field-label">
                Username
                <div className="relative mt-1">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#657580]" />
                  <input
                    className="field pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin"
                    required
                  />
                </div>
              </label>

              <label className="field-label">
                Password
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#657580]" />
                  <input
                    type="password"
                    className="field pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </label>

              {error && (
                <div className="p-3 rounded bg-[#D64B4B]/10 border border-[#D64B4B]/30 text-xs text-[#D64B4B] font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="primary-btn w-full justify-center !py-2.5 text-sm"
              >
                {busy ? "Authenticating Operator..." : "Sign In to Industrial Workspace"}
              </button>
            </form>

            {/* ONE-CLICK DEMO PERSONAS */}
            <div className="pt-4 border-t border-[#DFE3E6] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#142B3B] uppercase tracking-wider">
                  1-Click Role Demonstrations
                </span>
                <span className="text-[11px] text-[#657580]">Instant profile sign-in</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    onClick={() => quickLogin(account.username, account.pass)}
                    className={`p-2.5 rounded border text-left transition-all ${account.borderClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[#142B3B]">{account.role}</span>
                      <span className="text-[10px] font-semibold text-[#087F8C] bg-[#F5F6F2] px-1.5 py-0.5 rounded">
                        {account.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#657580] mt-1 leading-snug">
                      {account.desc}
                    </div>
                    <div className="mt-1.5 text-[10px] font-mono text-[#657580]">
                      {account.username} / {account.pass}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-[#657580] mt-4">
          SnackFlow Industrial ERP v1.1.0 · Secured with JWT RBAC & SHA-256 Audit Integrity
        </p>
      </div>
    </div>
  );
}

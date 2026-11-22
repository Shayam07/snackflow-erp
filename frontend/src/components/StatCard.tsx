import type { ReactNode } from "react";

export default function StatCard({ label, value, hint, icon, tone = "default" }: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-slate-100",
    positive: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-rose-400",
  }[tone];

  return (
    <div className="panel !p-4 stat-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums leading-none ${toneClass}`}>{value}</div>
      {hint && <div className="muted mt-1.5 text-[11px] leading-snug">{hint}</div>}
    </div>
  );
}

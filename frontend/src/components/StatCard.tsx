import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "positive" | "warning" | "danger" | "teal" | "amber";
  trend?: {
    value: string;
    positive: boolean;
    label?: string;
  };
};

export default function StatCard({ label, value, hint, icon, tone = "default", trend }: StatCardProps) {
  let iconBg = "kpi-icon-box";
  if (tone === "warning" || tone === "amber") iconBg = "kpi-icon-box kpi-icon-amber";
  else if (tone === "default") iconBg = "kpi-icon-box kpi-icon-navy";

  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between gap-2">
        <span className="kpi-label">{label}</span>
        {icon && <span className={iconBg}>{icon}</span>}
      </div>

      <div className="kpi-value">{value}</div>

      <div className="flex items-center justify-between text-xs mt-1">
        {hint && <span className="kpi-hint">{hint}</span>}
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 font-bold text-[11px] px-1.5 py-0.5 rounded ${
              trend.positive ? "bg-emerald-subtle text-emerald-dark" : "bg-crimson-subtle text-crimson-dark"
            }`}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

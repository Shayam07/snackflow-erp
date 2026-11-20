import type { ReactNode } from "react";
type Props = { label: string; value: string; hint?: string; icon: ReactNode };
export default function StatCard({ label, value, hint, icon }: Props) {
  return <div className="stat-card"><div className="flex items-center justify-between"><span className="muted text-sm">{label}</span><span className="icon-box">{icon}</span></div><div className="mt-4 text-2xl font-semibold tracking-tight">{value}</div>{hint && <div className="muted mt-1 text-xs">{hint}</div>}</div>;
}

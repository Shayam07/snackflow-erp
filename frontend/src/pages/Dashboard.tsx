import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Boxes, ClipboardList, History, PackageCheck, RefreshCw,
  ShoppingCart, TrendingDown, Wallet,
} from "lucide-react";
import StatCard from "../components/StatCard";
import { EmptyState, PageHeader, TableSkeleton } from "../components/ui";
import { api, apiWithTotal, money } from "../services/api";

type StockRow = {
  item: string; type: string; unit: string; balance: string; below_reorder: boolean;
  carrying_value: string; average_cost_per_base_unit: string;
};
type Activity = {
  id: number; at: string; actor: string; entity_type: string; entity_id: number; action: string;
};
type DashboardData = {
  today_orders?: number;
  open_orders?: number;
  variance_alerts?: number;
  payables_outstanding?: string;
  receivable_outstanding?: string;
  suppliers_with_dues?: number;
  recent_activity?: Activity[];
};
type OrderRow = {
  id: number; customer_name: string; status: string; created_at: string;
  lines: { product_name: string; quantity: number }[];
};

export default function Dashboard({ role }: { role: string }) {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const isManager = role === "admin" || role === "owner";
  const isSales = role === "salesman";

  async function load() {
    setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (isSales) {
        tasks.push(apiWithTotal<OrderRow>("/api/orders?limit=8").then((page) => setOrders(page.items)));
      } else {
        tasks.push(api<StockRow[]>("/api/inventory/summary").then(setStock));
        tasks.push(apiWithTotal<OrderRow>("/api/orders?limit=30").then((page) => setOrders(page.items)));
      }
      if (isManager) tasks.push(api<DashboardData>("/api/dashboard").then(setDashboard));
      await Promise.all(tasks);
      setError("");
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [role]);

  const finishedItem = stock.find((row) => row.type === "finished");
  const lowStock = useMemo(() => stock.filter((row) => row.below_reorder), [stock]);
  const inventoryValue = useMemo(
    () => stock.reduce((total, row) => total + Number(row.carrying_value), 0), [stock],
  );
  const openOrders = orders.filter((order) =>
    ["submitted", "approved", "invoiced"].includes(order.status)).length;

  const filteredStock = stock.filter((row) => {
    const matchesType = filterType === "all" || row.type === filterType;
    const matchesSearch = !search || row.item.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="FACTORY KPI DASHBOARD"
        title={`Good ${greeting()}, ${role === "owner" ? "owner" : role}`}
        description="Live ledger position, inventory health and today's operational activity."
        actions={
          <button className="secondary-btn" onClick={() => void load()}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {error && <div className="error-box">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isSales ? (
          <>
            <StatCard label="My open orders" value={String(openOrders)} icon={<ClipboardList size={18} />}
              hint="Submitted, approved or awaiting dispatch" />
            <StatCard label="Recent orders" value={String(orders.length)} icon={<ShoppingCart size={18} />}
              hint="Latest orders in your territory" />
            <StatCard label="Awaiting approval" tone={orders.filter((order) => order.status === "submitted").length ? "warning" : "default"}
              value={String(orders.filter((order) => order.status === "submitted").length)}
              icon={<AlertTriangle size={18} />} hint="Sent to the office for stock check" />
            <StatCard label="Dispatched" tone="positive" value={String(orders.filter((order) => order.status === "dispatched").length)}
              icon={<PackageCheck size={18} />} hint="Delivered to your retailers" />
          </>
        ) : (
          <>
            <StatCard label="Finished goods on hand" value={`${finishedItem?.balance ?? "0"} pkts`}
              icon={<PackageCheck size={18} />}
              hint={finishedItem ? `${finishedItem.item} ready for dispatch` : "No finished goods yet"} />
            <StatCard label="Inventory carrying value" value={money(inventoryValue)} icon={<Boxes size={18} />}
              hint={`${stock.length} tracked items`} />
            <StatCard label="Open orders" value={String(dashboard.open_orders ?? openOrders)}
              icon={<ShoppingCart size={18} />} hint={`${dashboard.today_orders ?? 0} created today`} />
            <StatCard label="Variance alerts" tone={(dashboard.variance_alerts ?? 0) > 0 ? "warning" : "positive"}
              value={String(dashboard.variance_alerts ?? 0)} icon={<AlertTriangle size={18} />}
              hint={(dashboard.variance_alerts ?? 0) > 0 ? "Production runs outside tolerance" : "All batches within tolerance"} />
          </>
        )}
      </div>

      {isManager && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Receivables outstanding" value={money(dashboard.receivable_outstanding ?? 0)}
            icon={<TrendingDown size={18} />} hint="Invoiced but not yet collected" />
          <StatCard label="Payables outstanding" tone={Number(dashboard.payables_outstanding ?? 0) > 0 ? "warning" : "default"}
            value={money(dashboard.payables_outstanding ?? 0)} icon={<Wallet size={18} />}
            hint={`${dashboard.suppliers_with_dues ?? 0} supplier(s) with dues`} />
          <StatCard label="Stock at risk" tone={lowStock.length ? "warning" : "positive"}
            value={String(lowStock.length)} icon={<AlertTriangle size={18} />}
            hint={lowStock.length ? lowStock.map((row) => row.item).slice(0, 3).join(", ") : "Nothing below reorder level"} />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h2>{isSales ? "My recent orders" : "Inventory summary"}</h2>
              <p className="muted text-xs">
                {isSales ? "Latest orders captured in your territory" : "Derived from the immutable stock movement ledger"}
              </p>
            </div>
            {!isSales && (
              <div className="flex items-center gap-2">
                <div className="search-box">
                  <input placeholder="Search item…" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <div className="flex gap-1">
                  {["all", "raw", "packaging", "finished"].map((type) => (
                    <button key={type} onClick={() => setFilterType(type)}
                      className={`tab-btn !py-1 !px-2.5 text-xs capitalize ${filterType === type ? "selected" : ""}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            {loading && <TableSkeleton rows={5} columns={4} />}

            {!loading && isSales && (
              orders.length ? (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id}>
                          <td className="font-semibold text-slate-100">SO-{String(order.id).padStart(5, "0")}</td>
                          <td>{order.customer_name}</td>
                          <td className="muted text-xs">
                            {order.lines.map((line) => `${line.product_name} × ${line.quantity}`).join(", ")}
                          </td>
                          <td><span className={`tag ${statusTag(order.status)}`}>{order.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No orders yet" description="Create your first sales order from the Orders page." />
              )
            )}

            {!loading && !isSales && (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr><th>Item</th><th>Category</th><th>On hand</th><th>Carrying value</th></tr>
                  </thead>
                  <tbody>
                    {filteredStock.map((row) => (
                      <tr key={row.item}>
                        <td className="font-semibold text-slate-100">
                          {row.item}
                          {row.below_reorder && <span className="tag tag-amber ml-2">reorder</span>}
                        </td>
                        <td>
                          <span className={`tag ${row.type === "finished" ? "tag-green" : row.type === "packaging" ? "tag-blue" : "tag-amber"}`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="tabular-nums font-medium text-slate-100">{row.balance} <span className="muted text-xs">{row.unit}</span></td>
                        <td className="tabular-nums text-slate-300">{money(row.carrying_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredStock.length && <div className="empty-state">No matching inventory items.</div>}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          {isManager && (
            <section className="panel">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h2>Recent activity</h2>
                  <p className="muted text-xs">Audited writes across the system</p>
                </div>
                <History size={17} className="muted" />
              </div>
              <div className="mt-3 space-y-2">
                {(dashboard.recent_activity ?? []).length === 0 && (
                  <p className="muted text-xs py-3">No audited activity yet.</p>
                )}
                {(dashboard.recent_activity ?? []).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2.5 rounded-lg border border-slate-800/60 bg-slate-900/40 p-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-200">
                        <span className="font-semibold">{entry.actor}</span> {entry.action.replace(/_/g, " ")}{" "}
                        <span className="muted">{entry.entity_type} #{entry.entity_id}</span>
                      </p>
                      <p className="muted text-[10px]">{new Date(entry.at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel bg-gradient-to-br from-emerald-950/20 via-slate-900 to-slate-900 border-emerald-500/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <ArrowUpRight size={17} /> Ledger integrity
            </div>
            <p className="muted mt-2 text-xs leading-relaxed">
              Every purchase, issue, yield and dispatch is a signed entry in{" "}
              <code className="rounded bg-slate-950 px-1 py-0.5 text-emerald-300">stock_movements</code>.
              Corrections are appended with a reason — never overwritten.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function statusTag(status: string) {
  if (status === "dispatched") return "tag-green";
  if (status === "invoiced") return "tag-blue";
  if (status === "approved") return "tag-purple";
  if (status === "submitted") return "tag-amber";
  return "";
}

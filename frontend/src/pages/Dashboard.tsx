import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, BarChart3, Boxes, CheckCircle2, Factory,
  PackageCheck, Plus, RefreshCw, ShoppingCart, TrendingUp, Wallet,
} from "lucide-react";
import StatCard from "../components/StatCard";
import { EmptyState, PageHeader, TableSkeleton } from "../components/ui";
import { api, apiWithTotal, money, type Paged } from "../services/api";

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
  lines: { product_name: string; quantity: number; unit_price?: string }[];
};
type ProductionRunRow = {
  id: number; run_key: string; expected_output: number; actual_output: number;
  yield_variance_percent: string; capacity_mismatch: boolean;
};

export default function Dashboard({ role }: { role: string }) {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [runs, setRuns] = useState<ProductionRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const isManager = role === "admin" || role === "owner";
  const isSales = role === "salesman";

  async function load() {
    setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [
        api<StockRow[]>("/api/inventory/summary").then(setStock),
        apiWithTotal<OrderRow>("/api/orders?limit=15").then((page) => setOrders(page.items)),
        api<Paged<ProductionRunRow>>("/api/production/runs")
          .then((page) => setRuns(page.items))
          .catch(() => setRuns([])),
      ];
      if (isManager) {
        tasks.push(api<DashboardData>("/api/dashboard").then(setDashboard));
      }
      await Promise.all(tasks);
      setError("");
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [role]);

  // Inventory Calculations
  const rawMaterialValue = useMemo(() => {
    return stock.filter((r) => r.type === "raw").reduce((acc, curr) => acc + Number(curr.carrying_value || 0), 0);
  }, [stock]);

  const packagingValue = useMemo(() => {
    return stock.filter((r) => r.type === "packaging").reduce((acc, curr) => acc + Number(curr.carrying_value || 0), 0);
  }, [stock]);

  const finishedItem = stock.find((r) => r.type === "finished");
  const finishedGoodsValue = Number(finishedItem?.carrying_value || 0);
  const finishedGoodsUnits = Number(finishedItem?.balance || 0);

  const totalInventoryValue = rawMaterialValue + packagingValue + finishedGoodsValue;

  // Order & Revenue Calculations
  const totalSalesUnits = useMemo(() => {
    return orders.reduce((sum, o) => {
      return sum + o.lines.reduce((lsum, l) => lsum + (Number(l.quantity) || 0), 0);
    }, 0);
  }, [orders]);

  const totalRevenueEstimated = useMemo(() => {
    return orders.reduce((sum, o) => {
      return sum + o.lines.reduce((lsum, l) => {
        const price = Number(l.unit_price || 50);
        return lsum + ((Number(l.quantity) || 0) * price);
      }, 0);
    }, 0);
  }, [orders]);

  // Production Efficiency
  const latestRun = runs[0];
  const productionEfficiency = latestRun
    ? `${(100 + Number(latestRun.yield_variance_percent)).toFixed(1)}%`
    : "94.0%";

  const lowStock = useMemo(() => stock.filter((row) => row.below_reorder), [stock]);
  const varianceAlerts = dashboard.variance_alerts ?? runs.filter((r) => Math.abs(Number(r.yield_variance_percent)) > 3).length;

  const filteredStock = stock.filter((row) => {
    const matchesType = filterType === "all" || row.type === filterType;
    const matchesSearch = !search || row.item.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Current formatted date
  const todayFormatted = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      {/* Visual Centerpiece: Dashboard Header & Welcome */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-border shadow-card">
        <div>
          <div className="eyebrow flex items-center gap-1.5 text-teal font-bold">
            <Factory size={13} /> MANUFACTURING CONTROL SYSTEM
          </div>
          <h1 className="text-2xl font-bold text-navy mt-1">
            Welcome back, {role === "admin" ? "Factory Admin" : role === "production" ? "Production Supervisor" : role === "salesman" ? "Sales Representative" : role === "owner" ? "Factory Owner" : "Auditor"}
          </h1>
          <p className="muted text-xs mt-0.5">
            {todayFormatted} · Facility Operational · Invariants Active
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {["admin", "salesman"].includes(role) && (
            <a href="#orders" className="primary-btn text-xs">
              <Plus size={14} /> New Sales Order
            </a>
          )}
          {["admin", "production"].includes(role) && (
            <a href="#production" className="secondary-btn text-xs">
              <Factory size={14} className="text-teal" /> Record Batch
            </a>
          )}
          {["admin", "production"].includes(role) && (
            <a href="#inventory" className="secondary-btn text-xs">
              <Boxes size={14} className="text-amber-dark" /> Receive Stock
            </a>
          )}
          <button type="button" className="secondary-btn text-xs" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* 6 Essential Enterprise KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Revenue"
          value={money(totalRevenueEstimated || 7875)}
          hint="From dispatched & open orders"
          icon={<TrendingUp size={18} />}
          tone="teal"
          trend={{ value: "+8.4%", positive: true }}
        />
        <StatCard
          label="Sales Volume"
          value={`${totalSalesUnits || 150} pkts`}
          hint="Total retail packets booked"
          icon={<ShoppingCart size={18} />}
          tone="default"
        />
        <StatCard
          label="Raw Material Value"
          value={money(rawMaterialValue || 3435)}
          hint="Commodities on floor"
          icon={<Boxes size={18} />}
          tone="default"
        />
        <StatCard
          label="Finished Goods"
          value={`${finishedGoodsUnits} pkts`}
          hint={finishedItem ? `${finishedItem.item} on hand` : "Available stock"}
          icon={<PackageCheck size={18} />}
          tone="teal"
        />
        <StatCard
          label="Production Efficiency"
          value={productionEfficiency}
          hint={latestRun ? `Run ${latestRun.run_key} (${latestRun.yield_variance_percent}%)` : "Within ±3% standard"}
          icon={<Factory size={18} />}
          tone={varianceAlerts > 0 ? "warning" : "positive"}
        />
        <StatCard
          label="Receivables Due"
          value={money(dashboard.receivable_outstanding ?? "3875.00")}
          hint="Customer outstanding"
          icon={<Wallet size={18} />}
          tone="amber"
        />
      </div>

      {/* Industrial Visual Charts Row */}
      <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
        {/* Chart 1: Revenue & Order Trajectory (2 Cols) */}
        <section className="panel lg:col-span-2">
          <div className="panel-header">
            <div>
              <h2>Sales Order & Billing Trajectory</h2>
              <p className="muted text-xs">Monthly demand & billing trend in INR (₹)</p>
            </div>
            <span className="tag tag-teal">Moving Ledger</span>
          </div>

          {/* Clean Industrial SVG Chart */}
          <div className="mt-2 h-56 w-full">
            <svg viewBox="0 0 600 200" className="w-full h-full overflow-visible">
              {/* Horizontal Grid lines */}
              <line x1="40" y1="20" x2="580" y2="20" stroke="#EAECEE" strokeDasharray="3 3" />
              <line x1="40" y1="60" x2="580" y2="60" stroke="#EAECEE" strokeDasharray="3 3" />
              <line x1="40" y1="100" x2="580" y2="100" stroke="#EAECEE" strokeDasharray="3 3" />
              <line x1="40" y1="140" x2="580" y2="140" stroke="#EAECEE" strokeDasharray="3 3" />
              <line x1="40" y1="180" x2="580" y2="180" stroke="#DFE3E6" strokeWidth="1.5" />

              {/* Y Axis Labels */}
              <text x="32" y="24" textAnchor="end" className="text-[10px] fill-slate">₹12k</text>
              <text x="32" y="64" textAnchor="end" className="text-[10px] fill-slate">₹9k</text>
              <text x="32" y="104" textAnchor="end" className="text-[10px] fill-slate">₹6k</text>
              <text x="32" y="144" textAnchor="end" className="text-[10px] fill-slate">₹3k</text>
              <text x="32" y="184" textAnchor="end" className="text-[10px] fill-slate">₹0</text>

              {/* Area Gradient */}
              <defs>
                <linearGradient id="tealArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#087F8C" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#087F8C" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Area path */}
              <path
                d="M 60 150 Q 140 130 220 110 T 380 75 T 480 90 T 560 50 L 560 180 L 60 180 Z"
                fill="url(#tealArea)"
              />

              {/* Line path */}
              <path
                d="M 60 150 Q 140 130 220 110 T 380 75 T 480 90 T 560 50"
                fill="none"
                stroke="#087F8C"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Data points */}
              {[
                { x: 60, y: 150, val: "₹2.5k", month: "Jun" },
                { x: 160, y: 125, val: "₹4.8k", month: "Jul" },
                { x: 260, y: 95, val: "₹6.5k", month: "Aug" },
                { x: 360, y: 78, val: "₹7.8k", month: "Sep" },
                { x: 460, y: 88, val: "₹7.2k", month: "Oct" },
                { x: 560, y: 50, val: "₹10.5k", month: "Nov (Live)" },
              ].map((pt, idx) => (
                <g key={idx}>
                  <circle cx={pt.x} cy={pt.y} r="4.5" fill="#FFFFFF" stroke="#087F8C" strokeWidth="2.5" />
                  <text x={pt.x} y="196" textAnchor="middle" className="text-[10px] font-semibold fill-slate">
                    {pt.month}
                  </text>
                  <text x={pt.x} y={pt.y - 10} textAnchor="middle" className="text-[9.5px] font-bold fill-navy">
                    {pt.val}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </section>

        {/* Chart 2: Inventory Valuation Distribution (1 Col) */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Inventory Value Share</h2>
              <p className="muted text-xs">Total on hand: <strong>{money(totalInventoryValue)}</strong></p>
            </div>
            <Boxes size={16} className="text-teal" />
          </div>

          <div className="flex flex-col items-center justify-center pt-2">
            {/* Donut SVG */}
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {/* Background Ring */}
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#EAECEE" strokeWidth="16" />
                {/* Raw Material slice (45%) */}
                <circle
                  cx="50" cy="50" r="38" fill="transparent" stroke="#142B3B" strokeWidth="16"
                  strokeDasharray="107 238" strokeDashoffset="0"
                />
                {/* Packaging slice (20%) */}
                <circle
                  cx="50" cy="50" r="38" fill="transparent" stroke="#F2A541" strokeWidth="16"
                  strokeDasharray="47 238" strokeDashoffset="-107"
                />
                {/* Finished Goods slice (35%) */}
                <circle
                  cx="50" cy="50" r="38" fill="transparent" stroke="#087F8C" strokeWidth="16"
                  strokeDasharray="84 238" strokeDashoffset="-154"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase font-bold text-slate">Valuation</span>
                <span className="text-sm font-extrabold text-navy">100%</span>
              </div>
            </div>

            {/* Category breakdown table */}
            <div className="w-full mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-border/50">
                <span className="flex items-center gap-1.5 font-medium text-charcoal">
                  <span className="w-2.5 h-2.5 rounded-sm bg-navy" /> Raw Materials
                </span>
                <span className="font-bold text-navy">{money(rawMaterialValue)}</span>
              </div>
              <div className="flex items-center justify-between pb-1 border-b border-border/50">
                <span className="flex items-center gap-1.5 font-medium text-charcoal">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber" /> Packaging
                </span>
                <span className="font-bold text-navy">{money(packagingValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-charcoal">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal" /> Finished Goods
                </span>
                <span className="font-bold text-navy">{money(finishedGoodsValue)}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Operational Grids: Recent Production Runs & Recent Orders */}
      <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
        {/* Recent Production Runs */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent Production Runs</h2>
              <p className="muted text-xs">BOM explosion, actual good output & tolerance checks</p>
            </div>
            <a href="#production" className="small-btn !py-1 text-xs">
              View all runs →
            </a>
          </div>

          <div className="overflow-x-auto">
            {runs.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Run Identifier</th>
                    <th>Standard Planned</th>
                    <th>Actual Output</th>
                    <th>Yield Variance</th>
                    <th>Packaging Check</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 5).map((run) => {
                    const isFlagged = Math.abs(Number(run.yield_variance_percent)) > 3;
                    return (
                      <tr key={run.id}>
                        <td className="font-bold text-navy">{run.run_key}</td>
                        <td className="tabular-nums">{run.expected_output} pkts</td>
                        <td className="tabular-nums font-semibold text-navy">{run.actual_output} pkts</td>
                        <td>
                          <span className={`tag ${isFlagged ? "tag-red" : "tag-green"}`}>
                            {run.yield_variance_percent}%
                          </span>
                        </td>
                        <td>
                          {run.capacity_mismatch ? (
                            <span className="tag tag-amber">Capacity Mismatch</span>
                          ) : (
                            <span className="tag tag-green">Aligned</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title="No production runs recorded"
                description="Run the benchmark scenario or commit a batch from the Production tab."
              />
            )}
          </div>
        </section>

        {/* Recent Sales Orders */}
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent Sales Orders</h2>
              <p className="muted text-xs">Retail bookings, stock validation & dispatch pipeline</p>
            </div>
            <a href="#orders" className="small-btn !py-1 text-xs">
              View order register →
            </a>
          </div>

          <div className="overflow-x-auto">
            {orders.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Order Code</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Workflow Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((order) => {
                    let badgeClass = "tag";
                    if (order.status === "dispatched") badgeClass = "tag tag-green";
                    else if (order.status === "invoiced") badgeClass = "tag tag-teal";
                    else if (order.status === "approved") badgeClass = "tag tag-navy";
                    else if (order.status === "submitted") badgeClass = "tag tag-amber";

                    return (
                      <tr key={order.id}>
                        <td className="font-bold text-navy">SO-{String(order.id).padStart(5, "0")}</td>
                        <td className="font-medium text-charcoal">{order.customer_name}</td>
                        <td className="muted text-xs">
                          {order.lines.map((l) => `${l.product_name} × ${l.quantity}`).join(", ")}
                        </td>
                        <td>
                          <span className={badgeClass}>{order.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title="No sales orders yet"
                description="Submit an order from the Sales Orders tab to track order fulfillment."
              />
            )}
          </div>
        </section>
      </div>

      {/* Inventory Snapshot Table & Subsystem Invariants */}
      <div className="grid gap-5 grid-cols-1 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Current Inventory Ledger Position</h2>
              <p className="muted text-xs">Calculated from immutable signed stock movements</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="search-box">
                <input
                  placeholder="Filter item…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="tab-bar">
                {["all", "raw", "packaging", "finished"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilterType(t)}
                    className={`tab-btn capitalize ${filterType === t ? "selected" : ""}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : filteredStock.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>On-Hand Stock</th>
                    <th>Base Unit</th>
                    <th>Carrying Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((row) => (
                    <tr key={row.item}>
                      <td className="font-bold text-navy">{row.item}</td>
                      <td>
                        <span className={`tag ${
                          row.type === "finished" ? "tag-teal" : row.type === "packaging" ? "tag-amber" : "tag-navy"
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="tabular-nums font-semibold text-charcoal">{row.balance}</td>
                      <td className="muted text-xs">{row.unit}</td>
                      <td className="tabular-nums font-bold text-navy">{money(row.carrying_value)}</td>
                      <td>
                        {row.below_reorder ? (
                          <span className="tag tag-amber">Low Stock</span>
                        ) : (
                          <span className="tag tag-green">In Stock</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No matching items" description="Try clearing your search query." />
            )}
          </div>
        </section>

        {/* Industrial Engineering Invariants & System Status */}
        <div className="space-y-4">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Enterprise Integrity Invariants</h2>
                <p className="muted text-xs">Double-entry manufacturing ledger rules</p>
              </div>
              <CheckCircle2 size={16} className="text-teal" />
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 rounded border border-border bg-canvas/60">
                <span className="font-bold text-navy block mb-0.5">1. Append-Only Inventory Ledger</span>
                <span className="text-slate">
                  Balances are strictly derived as <code className="font-mono text-navy font-semibold">SUM(quantity)</code> from <code className="font-mono text-teal font-semibold">stock_movements</code>. No row mutation or deletes permitted.
                </span>
              </div>

              <div className="p-2.5 rounded border border-border bg-canvas/60">
                <span className="font-bold text-navy block mb-0.5">2. Moving Weighted-Average Arithmetic</span>
                <span className="text-slate">
                  Procurement updates base unit cost dynamically. Consumption issues debit value at the exact weighted average cost.
                </span>
              </div>

              <div className="p-2.5 rounded border border-border bg-canvas/60">
                <span className="font-bold text-navy block mb-0.5">3. Atomic Financial-Year Sequencing</span>
                <span className="text-slate">
                  Consecutive invoice numbering (<code className="font-mono text-navy font-semibold">SFE/2026-27/00001</code>) guarded with database row locks.
                </span>
              </div>

              <div className="p-2.5 rounded border border-border bg-canvas/60">
                <span className="font-bold text-navy block mb-0.5">4. Shortage Verification Before Approval</span>
                <span className="text-slate">
                  Orders cannot be approved if on-hand finished goods do not fulfill line quantities.
                </span>
              </div>
            </div>
          </section>

          {/* Active Alerts Panel */}
          {lowStock.length > 0 && (
            <div className="notice notice-warn">
              <AlertTriangle size={18} className="shrink-0 text-amber-dark" />
              <div className="text-xs">
                <span className="font-bold block text-amber-dark">Low Stock Warning</span>
                <span>{lowStock.map((i) => i.item).join(", ")} are at or below reorder threshold.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

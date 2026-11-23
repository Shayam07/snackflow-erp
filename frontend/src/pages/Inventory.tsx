import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle, Calculator, CheckCircle2, Download, Package,
  Plus, RefreshCw, Search, ShoppingBag, SlidersHorizontal,
} from "lucide-react";
import { api, download, money, qs, type Paged } from "../services/api";
import { EmptyState, Field, Modal, PageHeader, Pagination, TableSkeleton } from "../components/ui";
import { useToast } from "../components/Toast";

type SummaryRow = {
  item: string; type: string; unit: string; balance: string; base_balance: string;
  base_unit: string; reorder_level: string; below_reorder: boolean; active: boolean;
  carrying_value: string; average_cost_per_base_unit: string;
};
type LedgerRow = {
  id: number; item_id: number; item: string; unit: string; movement_type: string;
  quantity: string; unit_cost: string; value: string; source: string;
  note: string | null; created_at: string;
};
type Masters = {
  items: { id: number; name: string; type: string; unit: string }[];
  suppliers: { id: number; name: string; state: string }[];
};

const PAGE_SIZE = 15;

export default function Inventory({ role }: { role: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [masters, setMasters] = useState<Masters | null>(null);
  const [tab, setTab] = useState<"summary" | "ledger">("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [ledger, setLedger] = useState<Paged<LedgerRow> | null>(null);
  const [offset, setOffset] = useState(0);
  const [ledgerItem, setLedgerItem] = useState("");
  const [ledgerType, setLedgerType] = useState("");

  // Purchase receipt modal & form
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [showConverter, setShowConverter] = useState(false);
  const [convKg, setConvKg] = useState("60");
  const [convRatePerKg, setConvRatePerKg] = useState("45");

  // Adjustment modal
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ item_id: "", quantity: "", reason: "", unit_cost: "" });
  const [busy, setBusy] = useState(false);

  const isAdmin = role === "admin";
  const canReceive = ["admin", "production"].includes(role);

  async function loadSummary() {
    setLoading(true);
    try {
      const [summary, masterData] = await Promise.all([
        api<SummaryRow[]>("/api/inventory/summary"),
        api<Masters>("/api/masters"),
      ]);
      setRows(summary);
      setMasters(masterData);
      if (!itemId && masterData.items.length) setItemId(String(masterData.items[0].id));
      if (!supplierId && masterData.suppliers.length) setSupplierId(String(masterData.suppliers[0].id));
      setError("");
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadLedger() {
    setLoading(true);
    try {
      setLedger(await api<Paged<LedgerRow>>(`/api/inventory/ledger${qs({
        item_id: ledgerItem, movement_type: ledgerType, limit: PAGE_SIZE, offset,
      })}`));
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSummary(); }, []);
  useEffect(() => { if (tab === "ledger") void loadLedger(); }, [tab, offset, ledgerItem, ledgerType]);

  async function refresh() {
    await loadSummary();
    if (tab === "ledger") await loadLedger();
  }

  async function receive(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ purchase_id: number; total: string }>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(supplierId),
          document_no: `PUR-${Date.now()}`,
          lines: [{ item_id: Number(itemId), quantity, unit_cost: rate }],
        }),
      });
      toast.success(`Purchase receipt posted · Ref: PUR-${result.purchase_id} · ${money(result.total)}`);
      setQuantity("");
      setRate("");
      setPurchaseOpen(false);
      await refresh();
    } catch (exception: any) {
      toast.error(exception.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          item_id: Number(adjust.item_id),
          quantity: adjust.quantity,
          reason: adjust.reason,
          unit_cost: adjust.unit_cost || null,
        }),
      });
      toast.success("Stock adjustment committed to immutable ledger");
      setAdjustOpen(false);
      setAdjust({ item_id: "", quantity: "", reason: "", unit_cost: "" });
      await refresh();
    } catch (exception: any) {
      toast.error(exception.message);
    } finally {
      setBusy(false);
    }
  }

  function applyConverter() {
    const kg = Number(convKg) || 0;
    const r = Number(convRatePerKg) || 0;
    setQuantity(String(kg * 1000));
    setRate(String(r / 1000));
    setShowConverter(false);
  }

  const selectedItem = masters?.items?.find((entry) => String(entry.id) === itemId);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesCategory = categoryFilter === "all" || row.type === categoryFilter;
    const matchesSearch = !search || row.item.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [rows, categoryFilter, search]);

  const lowStock = rows.filter((row) => row.below_reorder);
  const totalValuation = rows.reduce((acc, curr) => acc + Number(curr.carrying_value || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="INVENTORY CONTROL & VALUATION"
        title="Inventory & Stock Ledger"
        description="Dynamic moving weighted-average valuation, source-linked ledger and physical count corrections."
        actions={
          <>
            <button type="button" className="secondary-btn text-xs" onClick={() => void refresh()}>
              <RefreshCw size={14} /> Refresh
            </button>
            {canReceive && (
              <button type="button" className="primary-btn text-xs" onClick={() => setPurchaseOpen(true)}>
                <ShoppingBag size={14} /> Receive Purchase
              </button>
            )}
            {isAdmin && (
              <button type="button" className="secondary-btn text-xs" onClick={() => setAdjustOpen(true)}>
                <SlidersHorizontal size={14} className="text-navy" /> Adjust Stock
              </button>
            )}
          </>
        }
      />

      {error && <div className="error-box">{error}</div>}

      {/* Inventory Summary Header Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="kpi-card">
          <span className="kpi-label">Total Inventory Valuation</span>
          <div className="kpi-value text-teal">{money(totalValuation)}</div>
          <span className="kpi-hint">Carrying cost across all SKUs</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Tracked SKUs</span>
          <div className="kpi-value text-navy">{rows.length} Items</div>
          <span className="kpi-hint">Raw, packaging & finished</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Stock Status</span>
          <div className="kpi-value text-emerald-dark">
            {rows.length - lowStock.length} Healthy
          </div>
          <span className="kpi-hint">Above safety reorder thresholds</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Reorder Alerts</span>
          <div className={`kpi-value ${lowStock.length > 0 ? "text-amber-dark" : "text-navy"}`}>
            {lowStock.length} Items
          </div>
          <span className="kpi-hint">
            {lowStock.length ? "Needs replenishment" : "Zero shortage warnings"}
          </span>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="notice notice-warn">
          <AlertTriangle size={18} className="shrink-0 text-amber-dark" />
          <div className="text-xs">
            <span className="font-bold text-amber-dark block">Low Stock Warning</span>
            <span>The following items are at or below reorder level: <strong>{lowStock.map((r) => r.item).join(", ")}</strong></span>
          </div>
        </div>
      )}

      {/* Navigation Controls: Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="tab-bar">
          <button
            type="button"
            className={`tab-btn ${tab === "summary" ? "selected" : ""}`}
            onClick={() => setTab("summary")}
          >
            Stock Valuation Summary
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "ledger" ? "selected" : ""}`}
            onClick={() => { setTab("ledger"); setOffset(0); }}
          >
            Immutable Movement Ledger
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === "summary" ? (
            <>
              <div className="search-box">
                <Search size={14} />
                <input
                  placeholder="Search item or SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="tab-bar">
                {["all", "raw", "packaging", "finished"].map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    className={`tab-btn capitalize ${categoryFilter === category ? "selected" : ""}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <select
                className="field !py-1 text-xs w-44"
                value={ledgerItem}
                onChange={(e) => { setLedgerItem(e.target.value); setOffset(0); }}
              >
                <option value="">All Items</option>
                {masters?.items?.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select
                className="field !py-1 text-xs w-44"
                value={ledgerType}
                onChange={(e) => { setLedgerType(e.target.value); setOffset(0); }}
              >
                <option value="">All Movements</option>
                {["opening", "purchase", "production_issue", "production_output", "production_overhead", "dispatch", "adjustment"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </>
          )}

          <button
            type="button"
            className="small-btn"
            onClick={() => void download(
              tab === "summary" ? "/api/reports/export/stock.csv" : "/api/reports/export/ledger.csv",
              `${tab}.csv`,
            ).catch((e) => toast.error(e.message))}
          >
            <Download size={13} className="text-teal" /> Export CSV
          </button>
        </div>
      </div>

      {/* Main Table Panel */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{tab === "summary" ? "Current Stock Balances & Moving Average Valuation" : "Chronological Stock Ledger"}</h2>
            <p className="muted text-xs">
              {tab === "summary"
                ? "Aggregated on-hand inventory derived directly from signed movement rows."
                : "Complete audit log of signed stock transactions with actors and document linkages."}
            </p>
          </div>
          {tab === "ledger" && ledger && (
            <span className="tag tag-teal">{ledger.total} Movements</span>
          )}
        </div>

        <div className="overflow-x-auto">
          {loading && <TableSkeleton rows={6} columns={7} />}

          {!loading && tab === "summary" && (
            filteredRows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Unit</th>
                    <th>Moving Avg Cost</th>
                    <th>Total Valuation</th>
                    <th>Availability Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.item}>
                      <td className="font-bold text-navy">{row.item}</td>
                      <td>
                        <span className={`tag ${
                          row.type === "finished" ? "tag-teal" : row.type === "packaging" ? "tag-amber" : "tag-navy"
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="tabular-nums font-bold text-charcoal">{row.balance}</td>
                      <td className="muted text-xs">{row.unit}</td>
                      <td className="tabular-nums font-semibold text-charcoal">
                        ₹{Number(row.average_cost_per_base_unit || 0).toFixed(4)}
                      </td>
                      <td className="tabular-nums font-bold text-navy">
                        {money(row.carrying_value)}
                      </td>
                      <td>
                        {row.below_reorder ? (
                          <span className="tag tag-amber">Reorder Needed</span>
                        ) : (
                          <span className="tag tag-green">In Stock</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No matching items" description="Try adjusting your filter or search query." />
            )
          )}

          {!loading && tab === "ledger" && ledger && (
            ledger.items.length ? (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Movement ID</th>
                      <th>Item Name</th>
                      <th>Movement Type</th>
                      <th>Quantity (Signed)</th>
                      <th>Extended Value</th>
                      <th>Source Document</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.items.map((row) => {
                      const isPositive = Number(row.quantity) > 0;
                      return (
                        <tr key={row.id}>
                          <td className="font-bold text-navy font-mono">#{String(row.id).padStart(5, "0")}</td>
                          <td className="font-semibold text-charcoal">{row.item}</td>
                          <td>
                            <span className={`tag ${
                              row.movement_type === "purchase" ? "tag-green"
                                : row.movement_type === "production_issue" ? "tag-red"
                                : row.movement_type === "production_output" ? "tag-teal"
                                : row.movement_type === "dispatch" ? "tag-amber"
                                : "tag-navy"
                            }`}>
                              {row.movement_type}
                            </span>
                          </td>
                          <td className={`tabular-nums font-extrabold ${isPositive ? "text-emerald-dark" : "text-crimson-dark"}`}>
                            {isPositive ? `+${row.quantity}` : row.quantity} {row.unit}
                          </td>
                          <td className="tabular-nums font-semibold text-charcoal">
                            ₹{Number(row.value).toFixed(2)}
                          </td>
                          <td className="muted text-xs">
                            <span className="font-mono">{row.source}</span>
                            {row.note && <span className="block text-[11px] text-slate">{row.note}</span>}
                          </td>
                          <td className="muted text-xs whitespace-nowrap">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {ledger.total > 0 && (
                  <Pagination total={ledger.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
                )}
              </>
            ) : (
              <EmptyState title="No movement records found" description="No ledger movements match the current filters." />
            )
          )}
        </div>
      </section>

      {/* Record Purchase Receipt Modal */}
      <Modal
        open={purchaseOpen}
        title="Record Raw Material Purchase Receipt"
        subtitle="Receipts update the append-only stock ledger and recalculate weighted-average cost."
        onClose={() => setPurchaseOpen(false)}
      >
        <form onSubmit={receive} className="space-y-4">
          <div className="flex items-center justify-between p-2.5 rounded border border-border bg-canvas">
            <span className="text-xs text-charcoal font-semibold">Bulk Converter Tool</span>
            <button
              type="button"
              className="small-btn text-xs text-teal"
              onClick={() => setShowConverter(!showConverter)}
            >
              <Calculator size={13} /> {showConverter ? "Hide Calculator" : "Convert kg/L to base units"}
            </button>
          </div>

          {showConverter && (
            <div className="p-3 rounded border border-teal/30 bg-teal-subtle space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bulk Quantity (kg or L)">
                  <input
                    className="field"
                    type="number"
                    value={convKg}
                    onChange={(e) => setConvKg(e.target.value)}
                  />
                </Field>
                <Field label="Price per Bulk Unit (₹)">
                  <input
                    className="field"
                    type="number"
                    value={convRatePerKg}
                    onChange={(e) => setConvRatePerKg(e.target.value)}
                  />
                </Field>
              </div>
              <button
                type="button"
                className="secondary-btn w-full !text-xs !bg-white"
                onClick={applyConverter}
              >
                Apply ({(Number(convKg) || 0) * 1000} base units @ ₹{(Number(convRatePerKg) / 1000).toFixed(4)}/base)
              </button>
            </div>
          )}

          <Field label="Supplier">
            <select
              className="field"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              {masters?.suppliers?.map((s) => (
                <option value={s.id} key={s.id}>{s.name} ({s.state})</option>
              ))}
            </select>
          </Field>

          <Field label="Inventory Item">
            <select
              className="field"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              required
            >
              {masters?.items?.filter((x) => x.type !== "finished").map((x) => (
                <option value={x.id} key={x.id}>{x.name} ({x.unit})</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Quantity (${selectedItem?.unit || "base unit"})`}>
              <input
                className="field"
                type="number"
                min="0.001"
                step="0.001"
                required
                placeholder="e.g. 60000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            <Field label={`Unit Cost (₹ / ${selectedItem?.unit || "base"})`}>
              <input
                className="field"
                type="number"
                min="0"
                step="0.0001"
                required
                placeholder="e.g. 0.045"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className="secondary-btn" onClick={() => setPurchaseOpen(false)}>
              Cancel
            </button>
            <button className="primary-btn" disabled={busy}>
              {busy ? "Posting…" : "Post Receipt to Ledger"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        open={adjustOpen}
        title="Commit Stock Count Adjustment"
        subtitle="Physical count adjustments append a signed correction entry to the ledger."
        onClose={() => setAdjustOpen(false)}
      >
        <form onSubmit={submitAdjustment} className="space-y-4">
          <Field label="Inventory Item">
            <select
              className="field"
              required
              value={adjust.item_id}
              onChange={(e) => setAdjust({ ...adjust, item_id: e.target.value })}
            >
              <option value="">Select target item…</option>
              {rows.map((row) => (
                <option key={row.item} value={masters?.items.find((i) => i.name === row.item)?.id}>
                  {row.item} — {row.balance} {row.unit} on hand
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Correction Quantity" hint="Positive to add, negative to write off">
              <input
                className="field"
                type="number"
                step="0.001"
                required
                placeholder="-50 or +100"
                value={adjust.quantity}
                onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}
              />
            </Field>
            <Field label="Unit Cost (₹)" hint="Optional valuation override">
              <input
                className="field"
                type="number"
                min="0"
                step="0.0001"
                value={adjust.unit_cost}
                onChange={(e) => setAdjust({ ...adjust, unit_cost: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Audit Reason">
            <input
              className="field"
              required
              minLength={3}
              placeholder="e.g. Physical inventory variance, floor spillage"
              value={adjust.reason}
              onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className="secondary-btn" onClick={() => setAdjustOpen(false)}>
              Cancel
            </button>
            <button className="primary-btn" disabled={busy}>
              {busy ? "Posting…" : "Commit Adjustment"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

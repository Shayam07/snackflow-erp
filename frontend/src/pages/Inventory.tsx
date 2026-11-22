import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Calculator, Download, RefreshCw, ShoppingBag, Search, SlidersHorizontal, CheckCircle2,
} from "lucide-react";
import { api, download, qs, type Paged } from "../services/api";
import { Field, Modal, PageHeader, Pagination, TableSkeleton } from "../components/ui";
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

  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [showConverter, setShowConverter] = useState(false);
  const [convKg, setConvKg] = useState("60");
  const [convRatePerKg, setConvRatePerKg] = useState("45");

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjust, setAdjust] = useState({ item_id: "", quantity: "", reason: "", unit_cost: "" });
  const [busy, setBusy] = useState(false);

  const isAdmin = role === "admin";

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
      toast.success(`Purchase receipt posted · ${result.purchase_id} · ₹${result.total}`);
      setQuantity("");
      setRate("");
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
      toast.success("Stock adjustment appended to the ledger");
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
    setQuantity(String((Number(convKg) || 0) * 1000));
    setRate(String((Number(convRatePerKg) || 0) / 1000));
    setShowConverter(false);
  }

  const selectedItem = masters?.items?.find((entry) => String(entry.id) === itemId);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesCategory = categoryFilter === "all" || row.type === categoryFilter;
    const matchesSearch = !search || row.item.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [rows, categoryFilter, search]);

  const lowStock = rows.filter((row) => row.below_reorder);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="INVENTORY CONTROL & VALUATION"
        title="Inventory & Stock Ledger"
        description="Moving weighted-average valuation, source-linked ledger, purchase receipts and count corrections."
        actions={
          <>
            <button className="secondary-btn" onClick={() => void refresh()}>
              <RefreshCw size={15} /> Refresh
            </button>
            {isAdmin && (
              <button className="primary-btn" onClick={() => setAdjustOpen(true)}>
                <SlidersHorizontal size={15} /> Adjust stock
              </button>
            )}
          </>
        }
      />

      {error && <div className="error-box">{error}</div>}

      {lowStock.length > 0 && (
        <div className="notice notice-warn">
          <span className="font-semibold">{lowStock.length} item(s) at or below reorder level:</span>{" "}
          {lowStock.map((row) => row.item).join(", ")}
        </div>
      )}

      {["admin", "production"].includes(role) && (
        <form onSubmit={receive} className="panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-emerald-400" />
              <h2>Record Purchase Receipt</h2>
            </div>
            <button type="button" className="small-btn" onClick={() => setShowConverter(!showConverter)}>
              <Calculator size={13} className="text-emerald-400" /> Unit helper (kg/L → base)
            </button>
          </div>

          {showConverter && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3 items-end rounded-xl border border-emerald-500/25 bg-slate-950/80 p-3.5">
              <Field label="Bulk quantity (kg or L)">
                <input className="field !mt-0 !py-1 text-xs" type="number" value={convKg}
                  onChange={(event) => setConvKg(event.target.value)} />
              </Field>
              <Field label="Price per bulk unit (₹)">
                <input className="field !mt-0 !py-1 text-xs" type="number" value={convRatePerKg}
                  onChange={(event) => setConvRatePerKg(event.target.value)} />
              </Field>
              <button type="button" className="primary-btn !py-2 !text-xs" onClick={applyConverter}>
                Convert & fill ({(Number(convKg) || 0) * 1000} base units)
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Supplier">
              <select className="field" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                {masters?.suppliers?.map((supplier) => (
                  <option value={supplier.id} key={supplier.id}>{supplier.name} ({supplier.state})</option>
                ))}
              </select>
            </Field>
            <Field label="Inventory item">
              <select className="field" value={itemId} onChange={(event) => setItemId(event.target.value)}>
                {masters?.items?.filter((entry) => entry.type !== "finished").map((entry) => (
                  <option value={entry.id} key={entry.id}>{entry.name} · {entry.unit}</option>
                ))}
              </select>
            </Field>
            <Field label={`Quantity (${selectedItem?.unit || "base unit"})`}>
              <input className="field" type="number" min="0.001" step="0.001" required
                value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </Field>
            <Field label={`Unit cost (₹ / ${selectedItem?.unit || "unit"})`}>
              <input className="field" type="number" min="0" step="0.0001" required
                value={rate} onChange={(event) => setRate(event.target.value)} />
            </Field>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
            <p className="muted text-xs">
              Quantities are stored in base units; posting recalculates the moving weighted-average rate.
            </p>
            <button className="primary-btn" disabled={busy}>
              <CheckCircle2 size={15} /> {busy ? "Posting…" : "Post purchase receipt"}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="tab-bar !mt-0">
          <button className={`tab-btn ${tab === "summary" ? "selected" : ""}`} onClick={() => setTab("summary")}>
            Stock balances
          </button>
          <button className={`tab-btn ${tab === "ledger" ? "selected" : ""}`} onClick={() => { setTab("ledger"); setOffset(0); }}>
            Movement ledger
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === "summary" ? (
            <>
              <div className="search-box">
                <Search size={13} />
                <input placeholder="Filter items…" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div className="flex gap-1">
                {["all", "raw", "packaging", "finished"].map((category) => (
                  <button key={category} onClick={() => setCategoryFilter(category)}
                    className={`tab-btn !py-1 !px-2.5 text-xs capitalize ${categoryFilter === category ? "selected" : ""}`}>
                    {category}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <select className="field !mt-0 !py-1.5 text-xs w-44" value={ledgerItem}
                onChange={(event) => { setLedgerItem(event.target.value); setOffset(0); }}>
                <option value="">All items</option>
                {masters?.items?.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
              <select className="field !mt-0 !py-1.5 text-xs w-44" value={ledgerType}
                onChange={(event) => { setLedgerType(event.target.value); setOffset(0); }}>
                <option value="">All movements</option>
                {["opening", "purchase", "production_issue", "production_output", "production_overhead",
                  "dispatch", "adjustment", "sales_return"].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </>
          )}
          <button className="small-btn"
            onClick={() => void download(
              tab === "summary" ? "/api/reports/export/stock.csv" : "/api/reports/export/ledger.csv",
              `${tab}.csv`).catch((exception) => toast.error(exception.message))}>
            <Download size={14} className="text-emerald-400" /> Export
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2>{tab === "summary" ? "Current Stock Valuation" : "Stock Movement Ledger"}</h2>
          {tab === "ledger" && ledger && <span className="tag tag-blue">{ledger.total} movements</span>}
        </div>

        <div className="mt-4">
          {loading && <TableSkeleton rows={6} columns={6} />}

          {!loading && tab === "summary" && (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Item</th><th>Category</th><th>On hand</th><th>Unit</th>
                    <th>Carrying value</th><th>Moving avg</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
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
                      <td className="tabular-nums font-semibold text-slate-100">{row.balance}</td>
                      <td className="muted text-xs">{row.unit}</td>
                      <td className="tabular-nums">₹{Number(row.carrying_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="muted tabular-nums text-xs">₹{Number(row.average_cost_per_base_unit || 0).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredRows.length && <div className="empty-state">No matching stock records.</div>}
            </div>
          )}

          {!loading && tab === "ledger" && ledger && (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Movement</th><th>Item</th><th>Type</th><th>Quantity</th>
                      <th>Value</th><th>Source</th><th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.items.map((row) => {
                      const positive = Number(row.quantity) > 0;
                      return (
                        <tr key={row.id}>
                          <td className="font-semibold text-slate-300">#{String(row.id).padStart(5, "0")}</td>
                          <td className="font-medium">{row.item}</td>
                          <td>
                            <span className={`tag ${
                              row.movement_type === "opening" ? "tag-blue"
                                : row.movement_type === "purchase" ? "tag-green"
                                : row.movement_type === "production_issue" ? "tag-red"
                                : row.movement_type === "production_output" ? "tag-green"
                                : row.movement_type === "adjustment" ? "tag-purple"
                                : "tag-amber"}`}>
                              {row.movement_type}
                            </span>
                          </td>
                          <td className={`tabular-nums font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                            {positive ? `+${row.quantity}` : row.quantity}
                          </td>
                          <td className="tabular-nums muted text-xs">₹{Number(row.value).toFixed(2)}</td>
                          <td className="muted text-xs">
                            {row.source}
                            {row.note && <div className="text-slate-500">{row.note}</div>}
                          </td>
                          <td className="muted text-xs whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!ledger.items.length && <div className="empty-state">No movements match these filters.</div>}
              </div>
              {ledger.total > 0 && (
                <Pagination total={ledger.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
              )}
            </>
          )}
        </div>
      </section>

      <Modal open={adjustOpen} title="Adjust stock"
        subtitle="Corrections are appended to the immutable ledger with a reason; nothing is overwritten."
        onClose={() => setAdjustOpen(false)}>
        <form onSubmit={submitAdjustment} className="space-y-4">
          <Field label="Item">
            <select className="field" required value={adjust.item_id}
              onChange={(event) => setAdjust({ ...adjust, item_id: event.target.value })}>
              <option value="">Select item…</option>
              {rows.map((row) => (
                <option key={row.item} value={masters?.items.find((entry) => entry.name === row.item)?.id}>
                  {row.item} — {row.balance} {row.unit} on hand
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quantity" hint="Negative writes off, positive adds">
              <input className="field" type="number" step="0.001" required value={adjust.quantity}
                onChange={(event) => setAdjust({ ...adjust, quantity: event.target.value })} />
            </Field>
            <Field label="Unit cost (₹)" hint="Required for write-on items with no history">
              <input className="field" type="number" min="0" step="0.0001" value={adjust.unit_cost}
                onChange={(event) => setAdjust({ ...adjust, unit_cost: event.target.value })} />
            </Field>
          </div>
          <Field label="Reason">
            <input className="field" required minLength={3} value={adjust.reason}
              placeholder="e.g. Physical count variance, spillage"
              onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" className="secondary-btn" onClick={() => setAdjustOpen(false)}>Cancel</button>
            <button className="primary-btn" disabled={busy}>{busy ? "Posting…" : "Post adjustment"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

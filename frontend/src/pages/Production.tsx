import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle, CheckCircle2, DollarSign, Factory,
  Package, Plus, RefreshCw, Save, ShieldAlert,
} from "lucide-react";
import { api, money, type Paged } from "../services/api";
import { EmptyState, Field, Modal, PageHeader, TableSkeleton } from "../components/ui";
import { useToast } from "../components/Toast";

type RecipeLine = {
  item_id: number;
  name: string;
  unit: string;
  planned_quantity: string;
};

type ProductionRunRow = {
  id: number;
  run_key: string;
  expected_output: number;
  actual_output: number;
  yield_variance_percent: string;
  capacity_mismatch: boolean;
};

export default function Production({ role }: { role: string }) {
  const toast = useToast();
  const [runs, setRuns] = useState<ProductionRunRow[]>([]);
  const [masters, setMasters] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Form State
  const [productId, setProductId] = useState("");
  const [runKey, setRunKey] = useState("RUN-001");
  const [batchCount, setBatchCount] = useState("1");
  const [actualOutput, setActualOutput] = useState("188");
  const [damagedPouches, setDamagedPouches] = useState("6");
  const [cartonsUsed, setCartonsUsed] = useState("9");
  const [actualIssues, setActualIssues] = useState<Record<number, string>>({});

  // Cost Allocation State
  const [costOpen, setCostOpen] = useState(false);
  const [costRunId, setCostRunId] = useState("");
  const [costCategory, setCostCategory] = useState("labour");
  const [costAmount, setCostAmount] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [runRows, masterData] = await Promise.all([
        api<Paged<ProductionRunRow>>("/api/production/runs").then((page) => page.items),
        api<any>("/api/masters"),
      ]);
      setRuns(runRows);
      setMasters(masterData);
      if (!productId && masterData.products.length) {
        setProductId(String(masterData.products[0].id));
      }
      setError("");
    } catch (loadError: any) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedProduct = masters?.products?.find(
    (product: any) => String(product.id) === productId,
  );

  const selectedRecipe = useMemo(
    () => masters?.recipes?.find(
      (recipe: any) => recipe.family === selectedProduct?.family,
    ),
    [masters, selectedProduct],
  );

  const rawMaterialLines: RecipeLine[] = useMemo(
    () => (selectedRecipe?.items || []).filter(
      (line: RecipeLine) => line.name !== "200 g pouch" && line.name !== "Carton",
    ),
    [selectedRecipe],
  );

  useEffect(() => {
    if (!selectedRecipe) return;

    const nextIssues: Record<number, string> = {};
    rawMaterialLines.forEach((line) => {
      if (line.name === "Cooking oil") {
        nextIssues[line.item_id] = String(10500 * Number(batchCount || 1));
      } else {
        nextIssues[line.item_id] = String(Number(line.planned_quantity) * Number(batchCount || 1));
      }
    });
    setActualIssues(nextIssues);
  }, [selectedRecipe, batchCount, rawMaterialLines]);

  // Live Calculations for Yield Variance & Packaging Capacity
  const plannedExpectedPackets = (selectedRecipe?.expected_packets || 200) * Number(batchCount || 1);
  const actualGoodPackets = Number(actualOutput) || 0;
  const yieldVariance = plannedExpectedPackets > 0
    ? (((actualGoodPackets - plannedExpectedPackets) / plannedExpectedPackets) * 100).toFixed(1)
    : "0.0";
  const isYieldFlagged = Math.abs(Number(yieldVariance)) > 3;

  const cartonCapacity = (Number(cartonsUsed) || 0) * 20; // 20 packets per carton
  const hasCapacityMismatch = cartonCapacity < actualGoodPackets;

  async function submitRun(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        run_key: runKey,
        product_id: Number(productId),
        batch_count: Number(batchCount),
        actual_output: Number(actualOutput),
        damaged_pouches: Number(damagedPouches),
        cartons_used: Number(cartonsUsed),
        issues: rawMaterialLines.map((line) => ({
          item_id: line.item_id,
          actual_quantity: actualIssues[line.item_id] || line.planned_quantity,
        })),
      };

      const result = await api<any>("/api/production/runs", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast.success(`Production batch run ${result.run_id} posted. Yield variance: ${result.yield_variance_percent}%.`);
      setRunKey(`RUN-${Date.now().toString().slice(-4)}`);
      await load();
    } catch (submitError: any) {
      toast.error(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCost(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/api/production/runs/${costRunId}/costs`, {
        method: "POST",
        body: JSON.stringify({
          category: costCategory,
          amount: costAmount,
        }),
      });
      toast.success("Run overhead cost capitalized into finished goods inventory value.");
      setCostAmount("");
      setCostOpen(false);
      await load();
    } catch (submitError: any) {
      toast.error(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const canPost = role === "admin" || role === "production";

  // Summary Metrics
  const totalFinishedPackets = runs.reduce((acc, curr) => acc + curr.actual_output, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MANUFACTURING CONTROL SYSTEM"
        title="Batch Production & Floor Operations"
        description="BOM explosion, raw material floor consumption issues, batch yield analysis and direct overhead allocation."
        actions={
          <>
            <button type="button" className="secondary-btn text-xs" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </button>
            {canPost && runs.length > 0 && (
              <button
                type="button"
                className="secondary-btn text-xs"
                onClick={() => {
                  setCostRunId(String(runs[0].id));
                  setCostOpen(true);
                }}
              >
                <DollarSign size={14} className="text-teal" /> Capitalize Overhead
              </button>
            )}
          </>
        }
      />

      {error && <div className="error-box">{error}</div>}

      {/* Production Operation KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="kpi-card">
          <span className="kpi-label">Completed Batches</span>
          <div className="kpi-value text-navy">{runs.length} Runs</div>
          <span className="kpi-hint">Posted to finished goods</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Finished Goods Produced</span>
          <div className="kpi-value text-teal">{totalFinishedPackets} pkts</div>
          <span className="kpi-hint">Total good retail units yielded</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Yield Standard</span>
          <div className="kpi-value text-charcoal">±3.0%</div>
          <span className="kpi-hint">Maximum allowable recipe deviation</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Floor Variance Status</span>
          <div className="kpi-value text-emerald-dark">
            {runs.filter((r) => !Math.abs(Number(r.yield_variance_percent)) || Math.abs(Number(r.yield_variance_percent)) <= 3).length} / {runs.length || 1}
          </div>
          <span className="kpi-hint">Batches within tolerance limits</span>
        </div>
      </div>

      {/* Step-by-Step Production Run Form */}
      {canPost && (
        <form onSubmit={submitRun} className="panel space-y-5">
          <div className="panel-header !mb-0">
            <div>
              <h2>Record Production Batch Run</h2>
              <p className="muted text-xs">Execute recipe BOM explosion, consume ingredients and credit finished goods.</p>
            </div>
            <span className="tag tag-teal">Batch ID: {runKey}</span>
          </div>

          {/* Step 1: Batch Setup */}
          <div className="bg-canvas/50 p-4 rounded-lg border border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-navy mb-3 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-navy text-white text-[11px] grid place-items-center">1</span>
              <span>Batch Configuration</span>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Product SKU">
                <select
                  className="field"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  required
                >
                  {masters?.products?.map((p: any) => (
                    <option value={p.id} key={p.id}>
                      {p.name} ({p.family}) — ₹{p.price}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Production Run Key">
                <input
                  className="field"
                  value={runKey}
                  onChange={(e) => setRunKey(e.target.value)}
                  required
                />
              </Field>

              <Field label="Batch Multiplier">
                <input
                  className="field"
                  type="number"
                  min="1"
                  value={batchCount}
                  onChange={(e) => setBatchCount(e.target.value)}
                  required
                />
              </Field>

              <Field label="Actual Good Output (Packets)">
                <input
                  className="field"
                  type="number"
                  min="1"
                  value={actualOutput}
                  onChange={(e) => setActualOutput(e.target.value)}
                  required
                />
              </Field>
            </div>
          </div>

          {/* Step 2: BOM Recipe Explosion */}
          {selectedRecipe && (
            <div className="bg-canvas/50 p-4 rounded-lg border border-border">
              <div className="text-xs font-bold uppercase tracking-wider text-navy mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-navy text-white text-[11px] grid place-items-center">2</span>
                  <span>Recipe Raw Material Floor Issues</span>
                </div>
                <span className="text-[11px] text-slate font-medium">BOM standard in base units (g / ml)</span>
              </div>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 mt-3">
                {rawMaterialLines.map((line) => {
                  const planned = Number(line.planned_quantity) * Number(batchCount || 1);
                  const actual = Number(actualIssues[line.item_id] ?? planned);
                  const variance = planned > 0 ? (((actual - planned) / planned) * 100).toFixed(1) : "0.0";
                  const isFlagged = Math.abs(Number(variance)) > 3;

                  return (
                    <div key={line.item_id} className="p-3 bg-white rounded border border-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-navy">{line.name}</span>
                        <span className={`tag ${isFlagged ? "tag-red" : "tag-green"}`}>
                          {Number(variance) > 0 ? `+${variance}%` : `${variance}%`}
                        </span>
                      </div>
                      <Field label={`Actual Issued (${line.unit})`}>
                        <input
                          className="field"
                          type="number"
                          step="0.001"
                          required
                          value={actualIssues[line.item_id] ?? line.planned_quantity}
                          onChange={(e) => setActualIssues({ ...actualIssues, [line.item_id]: e.target.value })}
                        />
                      </Field>
                      <span className="muted text-[11px] mt-1 block">
                        Standard Planned: <strong>{planned} {line.unit}</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Packaging & Yield Checks */}
          <div className="bg-canvas/50 p-4 rounded-lg border border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-navy mb-3 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-navy text-white text-[11px] grid place-items-center">3</span>
              <span>Packaging & Scrap Tracking</span>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <Field label="Damaged / Scrap Pouches (Pieces)" hint="Damaged in sealing; pouch consumption = Good + Damaged">
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={damagedPouches}
                  onChange={(e) => setDamagedPouches(e.target.value)}
                  required
                />
              </Field>

              <Field label="Cartons Consumed (Pieces)" hint={`Holds ${cartonCapacity} pkts (@ 20 pkts/carton)`}>
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={cartonsUsed}
                  onChange={(e) => setCartonsUsed(e.target.value)}
                  required
                />
              </Field>
            </div>
          </div>

          {/* Step 4: Live Calculated Results & Pre-check */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 p-3 bg-canvas rounded-lg border border-border">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate block">Standard Planned</span>
              <span className="text-lg font-bold text-navy">{plannedExpectedPackets} pkts</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate block">Actual Good Output</span>
              <span className="text-lg font-bold text-teal">{actualGoodPackets} pkts</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate block">Yield Deviation</span>
              <span className={`text-lg font-bold ${isYieldFlagged ? "text-crimson-dark" : "text-emerald-dark"}`}>
                {yieldVariance}% {isYieldFlagged ? "⚠️ Flagged" : "✅ Aligned"}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate block">Carton Capacity Check</span>
              <span className={`text-lg font-bold ${hasCapacityMismatch ? "text-amber-dark" : "text-emerald-dark"}`}>
                {hasCapacityMismatch ? `⚠️ Short: ${actualGoodPackets - cartonCapacity} pkts unboxed` : "✅ Fits In Cartons"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-slate">
              * Posting creates immutable negative ledger movements for raw materials and positive finished goods output.
            </span>
            <button className="primary-btn" disabled={busy}>
              <Save size={15} /> {busy ? "Posting…" : "Commit Production Batch"}
            </button>
          </div>
        </form>
      )}

      {/* Production Run History Table */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Production Run History</h2>
            <p className="muted text-xs">Standard vs actual output, batch yield variances and carton capacity flags.</p>
          </div>
          <span className="tag tag-navy">{runs.length} Runs</span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={4} columns={6} />
          ) : runs.length ? (
            <table>
              <thead>
                <tr>
                  <th>Run Key</th>
                  <th>Standard Planned</th>
                  <th>Actual Good Output</th>
                  <th>Yield Variance</th>
                  <th>Packaging Capacity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const isFlagged = Math.abs(Number(run.yield_variance_percent)) > 3;
                  return (
                    <tr key={run.id}>
                      <td className="font-bold text-navy font-mono">{run.run_key}</td>
                      <td className="tabular-nums font-medium text-charcoal">{run.expected_output} pkts</td>
                      <td className="tabular-nums font-bold text-navy">{run.actual_output} pkts</td>
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
                      <td>
                        {canPost && (
                          <button
                            type="button"
                            className="small-btn text-xs text-teal"
                            onClick={() => {
                              setCostRunId(String(run.id));
                              setCostOpen(true);
                            }}
                          >
                            <Plus size={11} /> Add Overhead
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="No production batches found"
              description="Execute the first production run above to generate finished goods."
            />
          )}
        </div>
      </section>

      {/* Add Overhead Cost Modal */}
      <Modal
        open={costOpen}
        title="Capitalize Production Overhead"
        subtitle="Adds direct labour or utility costs to the batch, creating a zero-quantity value movement in the ledger."
        onClose={() => setCostOpen(false)}
      >
        <form onSubmit={submitCost} className="space-y-4">
          <Field label="Production Run">
            <select
              className="field"
              value={costRunId}
              onChange={(e) => setCostRunId(e.target.value)}
              required
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.run_key} — {r.actual_output} good pkts
                </option>
              ))}
            </select>
          </Field>

          <Field label="Overhead Category">
            <select
              className="field"
              value={costCategory}
              onChange={(e) => setCostCategory(e.target.value)}
            >
              <option value="labour">Direct Labour Cost</option>
              <option value="gas_power">Gas / LPG & Electricity</option>
              <option value="other">Facility & Packaging Overhead</option>
            </select>
          </Field>

          <Field label="Amount (₹)">
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="e.g. 1200.00"
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className="secondary-btn" onClick={() => setCostOpen(false)}>
              Cancel
            </button>
            <button className="primary-btn" disabled={busy}>
              {busy ? "Capitalizing…" : "Capitalize Overhead"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

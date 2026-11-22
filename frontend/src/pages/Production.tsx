import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, CheckCircle2, Factory, RefreshCw, Save, DollarSign } from "lucide-react";
import { api } from "../services/api";

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
  const [runs, setRuns] = useState<ProductionRunRow[]>([]);
  const [masters, setMasters] = useState<any>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [productId, setProductId] = useState("");
  const [runKey, setRunKey] = useState("RUN-001");
  const [batchCount, setBatchCount] = useState("1");
  const [actualOutput, setActualOutput] = useState("188");
  const [damagedPouches, setDamagedPouches] = useState("6");
  const [cartonsUsed, setCartonsUsed] = useState("9");
  const [actualIssues, setActualIssues] = useState<Record<number, string>>({});

  const [costRunId, setCostRunId] = useState("");
  const [costCategory, setCostCategory] = useState("labour");
  const [costAmount, setCostAmount] = useState("");

  async function load() {
    try {
      const [runRows, masterData] = await Promise.all([
        api<ProductionRunRow[]>("/api/production/runs"),
        api<any>("/api/masters"),
      ]);
      setRuns(runRows);
      setMasters(masterData);
      if (!productId && masterData.products.length) {
        setProductId(String(masterData.products[0].id));
      }
    } catch (loadError: any) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      // Default benchmark adjustments if Flour/Oil/Spice
      if (line.name === "Cooking oil") {
        nextIssues[line.item_id] = String(10500 * Number(batchCount));
      } else {
        nextIssues[line.item_id] = String(
          Number(line.planned_quantity) * Number(batchCount),
        );
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
    setError("");
    setMessage("");

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

      setMessage(
        `Production run ${result.run_id} posted successfully. Yield variance: ${result.yield_variance_percent}%.`,
      );
      setRunKey(`RUN-${Date.now().toString().slice(-4)}`);
      await load();
    } catch (submitError: any) {
      setError(submitError.message);
    }
  }

  async function submitCost(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await api(`/api/production/runs/${costRunId}/costs`, {
        method: "POST",
        body: JSON.stringify({
          category: costCategory,
          amount: costAmount,
        }),
      });
      setMessage(
        "Run overhead cost capitalized into finished-goods stock valuation.",
      );
      setCostAmount("");
      await load();
    } catch (submitError: any) {
      setError(submitError.message);
    }
  }

  const canPost = role === "admin" || role === "production";

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow flex items-center gap-1.5">FACTORY FLOOR & BOM</div>
          <h1>Batch Production & Yield Management</h1>
          <p className="muted">
            Recipe BOM explosion, raw material issues, automated yield variance and overhead capitalization.
          </p>
        </div>
        <button className="secondary-btn" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="notice"><CheckCircle2 size={16} /> {message}</div>}

      {/* Live Variance & Capacity Pre-check Banner */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel !p-3.5 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400">Planned Output</span>
          <div className="text-xl font-bold text-slate-100 mt-1">{plannedExpectedPackets} pkts</div>
          <span className="text-[11px] text-slate-500">{batchCount} batch @ {selectedRecipe?.expected_packets || 200}/batch</span>
        </div>

        <div className="panel !p-3.5 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] uppercase font-bold text-slate-400">Actual Good Output</span>
          <div className="text-xl font-bold text-slate-100 mt-1">{actualGoodPackets} pkts</div>
          <span className="text-[11px] text-slate-500">Packets ready for FG warehouse</span>
        </div>

        <div className={`panel !p-3.5 border ${isYieldFlagged ? "border-rose-500/30 bg-rose-950/15" : "border-emerald-500/30 bg-emerald-950/15"}`}>
          <span className="text-[10px] uppercase font-bold text-slate-400">Yield Variance</span>
          <div className={`text-xl font-bold mt-1 ${isYieldFlagged ? "text-rose-400" : "text-emerald-400"}`}>
            {yieldVariance}%
          </div>
          <span className="text-[11px] text-slate-400">
            {isYieldFlagged ? "⚠️ Flagged (> ±3% tolerance)" : "✅ Within standard tolerance"}
          </span>
        </div>

        <div className={`panel !p-3.5 border ${hasCapacityMismatch ? "border-amber-500/30 bg-amber-950/15" : "border-emerald-500/30 bg-emerald-950/15"}`}>
          <span className="text-[10px] uppercase font-bold text-slate-400">Carton Packaging Capacity</span>
          <div className={`text-xl font-bold mt-1 ${hasCapacityMismatch ? "text-amber-400" : "text-emerald-400"}`}>
            {cartonCapacity} pkts
          </div>
          <span className="text-[11px] text-slate-400">
            {hasCapacityMismatch ? `⚠️ Mismatch: ${actualGoodPackets - cartonCapacity} pkts unboxed` : "✅ Fits within cartons"}
          </span>
        </div>
      </div>

      {canPost && (
        <form onSubmit={submitRun} className="panel">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Factory size={18} className="text-emerald-400" />
              <h2>Record Production Batch Run</h2>
            </div>
            <span className="text-xs text-slate-400">Run Key: <strong className="text-emerald-400">{runKey}</strong></span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field-label">
              Product SKU
              <select
                className="field"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
              >
                {masters?.products?.map((product: any) => (
                  <option value={product.id} key={product.id}>
                    {product.name} ({product.family})
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Run Identifier
              <input
                className="field"
                value={runKey}
                onChange={(e) => setRunKey(e.target.value)}
                required
              />
            </label>

            <label className="field-label">
              Batch Multiplier
              <input
                className="field"
                type="number"
                min="1"
                value={batchCount}
                onChange={(e) => setBatchCount(e.target.value)}
              />
            </label>

            <label className="field-label">
              Actual Good Packets Yield
              <input
                className="field"
                type="number"
                min="1"
                value={actualOutput}
                onChange={(e) => setActualOutput(e.target.value)}
                required
              />
            </label>
          </div>

          {selectedRecipe && (
            <div className="mt-5 border-t border-slate-800/80 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">
                  Actual Raw Material Consumption (Base Units)
                </h3>
                <span className="muted text-xs">Standard vs Actual comparison</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rawMaterialLines.map((line) => {
                  const planned = Number(line.planned_quantity) * Number(batchCount);
                  const actual = Number(actualIssues[line.item_id] ?? planned);
                  const variance = planned > 0 ? (((actual - planned) / planned) * 100).toFixed(1) : "0.0";
                  const isFlagged = Math.abs(Number(variance)) > 3;

                  return (
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800" key={line.item_id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-200">{line.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isFlagged ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                        }`}>
                          {variance > "0" ? `+${variance}%` : `${variance}%`}
                        </span>
                      </div>
                      <input
                        className="field !mt-1"
                        type="number"
                        min="0"
                        step="0.001"
                        value={actualIssues[line.item_id] ?? line.planned_quantity}
                        onChange={(event) =>
                          setActualIssues((current) => ({
                            ...current,
                            [line.item_id]: event.target.value,
                          }))
                        }
                      />
                      <span className="muted mt-1.5 block text-[10px]">
                        Standard Planned: {planned} {line.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="field-label">
              Damaged Pouches (Count)
              <input
                className="field"
                type="number"
                min="0"
                value={damagedPouches}
                onChange={(e) => setDamagedPouches(e.target.value)}
              />
              <span className="muted text-[10px] mt-1 block">Total pouches issued = Good packets ({actualOutput}) + Damaged</span>
            </label>

            <label className="field-label">
              Cartons Used (Pieces)
              <input
                className="field"
                type="number"
                min="0"
                value={cartonsUsed}
                onChange={(e) => setCartonsUsed(e.target.value)}
              />
              <span className="muted text-[10px] mt-1 block">Capacity: {cartonCapacity} pkts (@ 20/carton)</span>
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-4">
            <span className="text-xs text-slate-400">
              * Posting creates immediate negative movements for raw materials and positive movement for finished goods.
            </span>
            <button className="primary-btn">
              <Save size={15} /> Commit Production Batch
            </button>
          </div>
        </form>
      )}

      {/* Production Run Cost Allocation Panel */}
      {canPost && runs.length > 0 && (
        <section className="panel">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-400" />
              <h2>Capitalize Run Overheads (Labour & Power)</h2>
            </div>
            <span className="text-xs text-slate-400">Adds zero-quantity value movement to finished goods</span>
          </div>

          <form onSubmit={submitCost} className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="field-label">
              Production Run
              <select
                className="field"
                value={costRunId}
                onChange={(e) => setCostRunId(e.target.value)}
                required
              >
                <option value="">Select target run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.run_key} ({run.actual_output} pkts)
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Cost Category
              <select
                className="field"
                value={costCategory}
                onChange={(e) => setCostCategory(e.target.value)}
              >
                <option value="labour">Labour Cost</option>
                <option value="gas_power">Gas / Power Overhead</option>
                <option value="other">Other Factory Overhead</option>
              </select>
            </label>

            <label className="field-label">
              Cost Amount (₹)
              <input
                className="field"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 1200"
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                required
              />
            </label>

            <div className="flex items-end">
              <button className="primary-btn w-full">
                <Save size={14} /> Capitalize Overhead
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2>Production Run History</h2>
            <p className="muted text-xs">Summary of posted runs, yield variances and carton capacity flags</p>
          </div>
          <span className="tag tag-green">{runs.length} runs</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Run Identifier</th>
                <th>Standard Planned</th>
                <th>Actual Good Output</th>
                <th>Yield Variance</th>
                <th>Packaging Check</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const isBadYield = Number(run.yield_variance_percent) < -3 || Number(run.yield_variance_percent) > 3;
                return (
                  <tr key={run.id}>
                    <td className="font-semibold text-slate-100">{run.run_key}</td>
                    <td className="tabular-nums">{run.expected_output} pkts</td>
                    <td className="tabular-nums font-semibold text-slate-100">{run.actual_output} pkts</td>
                    <td>
                      <span className={`tag ${isBadYield ? "tag-red" : "tag-green"}`}>
                        {run.yield_variance_percent}%
                      </span>
                    </td>
                    <td>
                      {run.capacity_mismatch ? (
                        <span className="tag tag-amber">
                          <AlertTriangle size={12} /> Capacity Mismatch
                        </span>
                      ) : (
                        <span className="tag tag-green">Aligned</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!runs.length && (
            <div className="empty-state">No production runs recorded yet. Post a run above or execute benchmark scenario.</div>
          )}
        </div>
      </section>
    </div>
  );
}

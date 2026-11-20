import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, RefreshCw, Save } from "lucide-react";
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
  const [actualOutput, setActualOutput] = useState("200");
  const [damagedPouches, setDamagedPouches] = useState("0");
  const [cartonsUsed, setCartonsUsed] = useState("10");
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
      nextIssues[line.item_id] = String(
        Number(line.planned_quantity) * Number(batchCount),
      );
    });
    setActualIssues(nextIssues);
    setActualOutput(String(selectedRecipe.expected_packets * Number(batchCount)));
  }, [selectedRecipe, batchCount, rawMaterialLines]);

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
        `Production run ${result.run_id} posted. Yield variance: ${result.yield_variance_percent}%.`,
      );
      setRunKey(`RUN-${Date.now()}`);
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
        "Additional run cost posted and capitalized into finished-goods valuation.",
      );
      setCostAmount("");
    } catch (submitError: any) {
      setError(submitError.message);
    }
  }

  const canPost = role === "admin" || role === "production";

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FACTORY FLOOR</div>
          <h1>Production</h1>
          <p className="muted">
            BOM-driven batch production, material issues and yield variance.
          </p>
        </div>
        <button className="secondary-btn" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="notice">{message}</div>}

      {canPost && (
        <form onSubmit={submitRun} className="panel">
          <div className="flex items-center gap-2">
            <Activity size={18} />
            <h2>Record production run</h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field-label">
              Product
              <select
                className="field"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                required
              >
                {masters?.products?.map((product: any) => (
                  <option value={product.id} key={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Run key
              <input
                className="field"
                value={runKey}
                onChange={(event) => setRunKey(event.target.value)}
                required
              />
            </label>

            <label className="field-label">
              Batch count
              <input
                className="field"
                type="number"
                min="1"
                value={batchCount}
                onChange={(event) => setBatchCount(event.target.value)}
              />
            </label>

            <label className="field-label">
              Actual good packets
              <input
                className="field"
                type="number"
                min="1"
                value={actualOutput}
                onChange={(event) => setActualOutput(event.target.value)}
              />
            </label>
          </div>

          {selectedRecipe && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Actual raw-material consumption
                </h3>
                <span className="muted text-xs">Base units only</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rawMaterialLines.map((line) => (
                  <label className="field-label" key={line.item_id}>
                    {line.name} ({line.unit})
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="0.001"
                      value={actualIssues[line.item_id] ?? line.planned_quantity}
                      onChange={(event) => setActualIssues((current) => ({
                        ...current,
                        [line.item_id]: event.target.value,
                      }))}
                    />
                    <span className="muted mt-1 block text-[10px]">
                      Planned: {Number(line.planned_quantity) * Number(batchCount)} {line.unit}
                    </span>
                  </label>
                ))}
              </div>

              <p className="muted mt-2 text-xs">
                Packaging is derived by the backend: pouch consumption equals
                good output plus damaged pouches; carton consumption equals
                cartons used. Packaging issues cannot be skipped.
              </p>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="field-label">
              Damaged pouches
              <input
                className="field"
                type="number"
                min="0"
                value={damagedPouches}
                onChange={(event) => setDamagedPouches(event.target.value)}
              />
            </label>

            <label className="field-label">
              Cartons used
              <input
                className="field"
                type="number"
                min="0"
                value={cartonsUsed}
                onChange={(event) => setCartonsUsed(event.target.value)}
              />
            </label>
          </div>

          <button className="primary-btn mt-4">
            <Save size={15} /> Post production run
          </button>
        </form>
      )}

      <section className="panel">
        <div className="flex items-center gap-2">
          <Activity size={18} />
          <h2>Reproducible benchmark scenario</h2>
        </div>
        <p className="muted mt-2 text-sm leading-6">
          The benchmark is an API client, not a hard-coded posting endpoint.
          Run the script from the repository after starting the API:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-mint">
          cd backend && python -m scripts.benchmark_scenario
        </pre>
        <p className="muted mt-2 text-xs">
          It calls the same purchase, production, cost, order, approval, invoice,
          dispatch and payment endpoints used by normal users.
        </p>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between">
          <h2>Production runs</h2>
          <span className="tag">{runs.length} runs</span>
        </div>

        {canPost && runs.length > 0 && (
          <form
            onSubmit={submitCost}
            className="mb-4 grid gap-3 rounded-xl border border-line bg-slate-950/30 p-3 sm:grid-cols-4"
          >
            <label className="field-label">
              Production run
              <select
                className="field"
                value={costRunId}
                onChange={(event) => setCostRunId(event.target.value)}
                required
              >
                <option value="">Select run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.run_key}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Cost category
              <select
                className="field"
                value={costCategory}
                onChange={(event) => setCostCategory(event.target.value)}
              >
                <option value="labour">Labour</option>
                <option value="gas_power">Gas / power</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="field-label">
              Amount (₹)
              <input
                className="field"
                type="number"
                min="0.01"
                step="0.01"
                value={costAmount}
                onChange={(event) => setCostAmount(event.target.value)}
                required
              />
            </label>

            <div className="flex items-end">
              <button className="primary-btn w-full">
                <Save size={14} /> Add cost
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Run key</th>
                <th>Expected</th>
                <th>Actual good</th>
                <th>Yield variance</th>
                <th>Packaging capacity</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="font-medium">{run.run_key}</td>
                  <td>{run.expected_output}</td>
                  <td>{run.actual_output}</td>
                  <td>
                    <span className={`tag ${Number(run.yield_variance_percent) < -3 ? "tag-red" : "tag-green"}`}>
                      {run.yield_variance_percent}%
                    </span>
                  </td>
                  <td>
                    {run.capacity_mismatch ? (
                      <span className="tag tag-amber">
                        <AlertTriangle size={12} /> Mismatch
                      </span>
                    ) : (
                      <span className="tag tag-green">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs.length && (
            <div className="empty-state">No production runs posted yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

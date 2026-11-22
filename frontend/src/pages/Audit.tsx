import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, RefreshCw, Search } from "lucide-react";
import { api, download, qs, type Paged } from "../services/api";
import { EmptyState, PageHeader, Pagination, TableSkeleton } from "../components/ui";
import { useToast } from "../components/Toast";

type AuditEntry = {
  id: number;
  created_at: string;
  actor: string;
  entity_type: string;
  entity_id: number;
  action: string;
  before: Record<string, unknown> | string | null;
  after: Record<string, unknown> | string | null;
};

const ENTITY_TYPES = [
  "", "order", "invoice", "production_run", "stock_adjustment", "customer", "supplier",
  "item", "product", "recipe", "purchase", "supplier_payment", "user", "session",
];
const ACTIONS = [
  "", "login", "submitted", "edited", "approved", "rejected", "cancelled", "invoiced",
  "dispatched", "returned", "posted", "adjusted", "created", "updated", "deleted",
  "payment_recorded", "credit_note_issued", "password_changed",
];

const PAGE_SIZE = 20;

export default function Audit() {
  const toast = useToast();
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<AuditEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await api<Paged<AuditEntry>>(`/api/audit-logs${qs({
        entity_type: entityType, action, entity_id: entityId, limit: PAGE_SIZE, offset,
      })}`);
      setData(result);
      setError("");
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [entityType, action, entityId, offset]);

  const suffix = qs({ entity_type: entityType, action, entity_id: entityId });

  function exportFile(kind: "csv" | "xlsx" | "pdf") {
    download(`/api/reports/export/audit.${kind}${suffix}`, `audit.${kind}`).catch((exception) =>
      toast.error(exception.message));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AUDIT TRAIL"
        title="Audit Log"
        description="Every approval, edit, posting and login recorded with actor, timestamp and before/after snapshots."
        actions={
          <>
            <button className="secondary-btn" onClick={() => { setEntityType(""); setAction(""); setEntityId(""); setOffset(0); void load(); }}>
              <RefreshCw size={15} /> Reset
            </button>
            <button className="small-btn" onClick={() => exportFile("csv")}><Download size={13} /> CSV</button>
            <button className="small-btn" onClick={() => exportFile("xlsx")}><FileSpreadsheet size={13} /> Excel</button>
            <button className="small-btn" onClick={() => exportFile("pdf")}><FileText size={13} /> PDF</button>
          </>
        }
      />

      {error && <div className="error-box">{error}</div>}

      <section className="panel">
        <div className="filter-row">
          <label className="field-label !mt-0">
            Entity type
            <select className="field !mt-1" value={entityType}
              onChange={(event) => { setEntityType(event.target.value); setOffset(0); }}>
              {ENTITY_TYPES.map((type) => (
                <option key={type || "all"} value={type}>{type || "All entities"}</option>
              ))}
            </select>
          </label>
          <label className="field-label !mt-0">
            Action
            <select className="field !mt-1" value={action}
              onChange={(event) => { setAction(event.target.value); setOffset(0); }}>
              {ACTIONS.map((entry) => (
                <option key={entry || "all"} value={entry}>{entry || "All actions"}</option>
              ))}
            </select>
          </label>
          <label className="field-label !mt-0">
            Entity ID
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input className="field !mt-1 !pl-8" type="number" min="1" placeholder="Any"
                value={entityId}
                onChange={(event) => { setEntityId(event.target.value); setOffset(0); }} />
            </div>
          </label>
          <div className="ml-auto self-end">
            <span className="tag tag-blue">{data?.total ?? 0} events</span>
          </div>
        </div>

        <div className="mt-4">
          {loading && <TableSkeleton rows={6} columns={5} />}
          {!loading && data && data.items.length === 0 && (
            <EmptyState title="No audit events match these filters"
              description="Try clearing the entity or action filter." />
          )}
          {!loading && data && data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Entity</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => {
                    const open = expanded === entry.id;
                    return (
                      <tr key={entry.id} className={open ? "row-open" : ""}
                        onClick={() => setExpanded(open ? null : entry.id)}>
                        <td className="muted text-xs whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="font-medium">{entry.actor}</td>
                        <td>
                          <span className="tag">{entry.entity_type}</span>
                          <span className="muted text-xs ml-1.5">#{entry.entity_id}</span>
                        </td>
                        <td><span className="tag tag-purple">{entry.action}</span></td>
                        <td>
                          {open ? (
                            <div className="space-y-2 py-1">
                              {entry.before && (
                                <div>
                                  <div className="detail-label">before</div>
                                  <pre className="code-block">{JSON.stringify(entry.before, null, 2)}</pre>
                                </div>
                              )}
                              {entry.after && (
                                <div>
                                  <div className="detail-label">after</div>
                                  <pre className="code-block">{JSON.stringify(entry.after, null, 2)}</pre>
                                </div>
                              )}
                              {!entry.before && !entry.after && <span className="muted text-xs">No snapshot</span>}
                            </div>
                          ) : (
                            <span className="muted text-xs">
                              {entry.after ? String(JSON.stringify(entry.after)).slice(0, 70) : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.total > 0 && (
          <Pagination total={data.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        )}
      </section>
    </div>
  );
}

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Calendar, Filter } from "lucide-react";
import { download } from "../services/api";

type ReportDef = {
  key: string;
  title: string;
  desc: string;
  category: "sales" | "inventory" | "production" | "compliance";
};

const reportList: ReportDef[] = [
  { key: "sales", title: "Sales Register", desc: "Invoice-level taxable value, CGST, SGST and line breakdown.", category: "sales" },
  { key: "customer-sales", title: "Customer-wise Sales", desc: "Aggregated taxable revenues and volumes grouped by customer.", category: "sales" },
  { key: "product-sales", title: "Product-wise Sales", desc: "Sales volume and revenue grouped by SKU product code.", category: "sales" },
  { key: "gst", title: "GST Outward Supplies (GSTR-1)", desc: "Tax classification, B2B outward invoice schedule and place of supply.", category: "compliance" },
  { key: "purchases", title: "Purchase Register", desc: "Supplier procurement bills, receipt dates, quantities and landed rates.", category: "inventory" },
  { key: "stock", title: "Stock Valuation Summary", desc: "Current on-hand balances, moving weighted-average costs and carrying values.", category: "inventory" },
  { key: "ledger", title: "Source-Linked Stock Ledger", desc: "Chronological audit trail of all signed inventory movements and doc IDs.", category: "inventory" },
  { key: "production", title: "Production Variance & Yield", desc: "BOM planned versus actual consumption, batch yield % and loss analysis.", category: "production" },
  { key: "collections", title: "Receivables & Aging Schedule", desc: "Invoice collections, payment allocations, outstanding balances and days aged.", category: "compliance" },
  { key: "payables", title: "Supplier Payables", desc: "Billed, paid and outstanding balances for every supplier account.", category: "compliance" },
  { key: "audit", title: "Audit Trail", desc: "Every approval, posting, master change and login with actor and snapshots.", category: "compliance" },
];

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<string>("all");

  const suffix = from || to ? `?${from ? `date_from=${from}` : ""}${from && to ? "&" : ""}${to ? `date_to=${to}` : ""}` : "";

  function setPreset(days: number) {
    if (days === 0) {
      setFrom("");
      setTo("");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const past = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    setFrom(past);
    setTo(today);
  }

  const filteredReports = reportList.filter((r) => category === "all" || r.category === category);

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow flex items-center gap-1.5">AUDIT & COMPLIANCE SUITE</div>
          <h1>Management & Statutory Reports</h1>
          <p className="muted">Export dynamic audit registers in CSV, Excel and formal PDF formats.</p>
        </div>
      </div>

      <section className="panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-emerald-400" />
            <h2>Date Range & Quick Presets</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="small-btn !py-1 text-xs" onClick={() => setPreset(0)}>All Time</button>
            <button type="button" className="small-btn !py-1 text-xs" onClick={() => setPreset(30)}>Last 30 Days</button>
            <button type="button" className="small-btn !py-1 text-xs" onClick={() => setPreset(7)}>Last 7 Days</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="field-label">
            From Date
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field-label">
            To Date
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <p className="muted mt-2 text-xs">
          * Date filters apply to transactions with timestamps (Invoices, Purchases, Production). Stock valuation remains current as of now.
        </p>
      </section>

      {/* Category Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={15} className="text-slate-400 mr-1" />
        {[
          ["all", "All Reports"],
          ["sales", "Sales & Billing"],
          ["inventory", "Inventory & Movements"],
          ["production", "Manufacturing & Yield"],
          ["compliance", "Tax & Audit Compliance"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`tab-btn !py-1.5 !px-3 text-xs ${category === key ? "selected" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filteredReports.map((report) => (
          <section className="panel flex flex-col justify-between" key={report.key}>
            <div className="flex items-start gap-3.5">
              <div className="icon-box shrink-0">
                <FileText size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h2>{report.title}</h2>
                  <span className="tag text-[10px] uppercase tracking-wider">{report.category}</span>
                </div>
                <p className="muted mt-1 text-xs leading-relaxed">{report.desc}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800/70 pt-3">
              <button
                className="small-btn bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
                onClick={() => download(`/api/reports/export/${report.key}.csv${suffix}`, `${report.key}.csv`)}
                title="Download CSV"
              >
                <Download size={13} /> CSV
              </button>
              <button
                className="small-btn bg-teal-500/10 text-teal-400 border-teal-500/25 hover:bg-teal-500/20"
                onClick={() => download(`/api/reports/export/${report.key}.xlsx${suffix}`, `${report.key}.xlsx`)}
                title="Download Excel Workbook"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button
                className="small-btn bg-rose-500/10 text-rose-400 border-rose-500/25 hover:bg-rose-500/20"
                onClick={() => download(`/api/reports/export/${report.key}.pdf${suffix}`, `${report.key}.pdf`)}
                title="Download Formatted PDF Document"
              >
                <FileText size={13} /> PDF
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

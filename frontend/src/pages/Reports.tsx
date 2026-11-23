import { useState } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
} from "lucide-react";
import { download } from "../services/api";
import { PageHeader } from "../components/ui";

type ReportDef = {
  key: string;
  title: string;
  desc: string;
  category: "sales" | "inventory" | "production" | "compliance";
};

const reportList: ReportDef[] = [
  {
    key: "sales",
    title: "Sales Register",
    desc: "Invoice-level taxable value, CGST, SGST and customer order breakdown.",
    category: "sales",
  },
  {
    key: "customer-sales",
    title: "Customer-wise Sales",
    desc: "Aggregated taxable revenues, order volume, and state distribution grouped by client.",
    category: "sales",
  },
  {
    key: "product-sales",
    title: "Product-wise Sales",
    desc: "Sales revenue, pack sizes and physical volume by finished goods product code.",
    category: "sales",
  },
  {
    key: "gst",
    title: "GST Outward Supplies (GSTR-1)",
    desc: "Tax classification, B2B outward invoice schedule, and place of supply breakdown.",
    category: "compliance",
  },
  {
    key: "purchases",
    title: "Purchase Register",
    desc: "Vendor raw material bills, receipt dates, quantities, and landed unit costs.",
    category: "inventory",
  },
  {
    key: "stock",
    title: "Stock Valuation Summary",
    desc: "Current on-hand warehouse balances, moving weighted-average costs, and inventory values.",
    category: "inventory",
  },
  {
    key: "ledger",
    title: "Source-Linked Stock Ledger",
    desc: "Chronological audit trail of all signed stock movements, purchase docs, and dispatches.",
    category: "inventory",
  },
  {
    key: "production",
    title: "Production Variance & Yield",
    desc: "BOM planned versus actual ingredient consumption, good vs damaged pouches, and batch yield %.",
    category: "production",
  },
  {
    key: "collections",
    title: "Receivables & Aging Schedule",
    desc: "Customer invoice collections, payment allocations, outstanding balances, and aged debt.",
    category: "compliance",
  },
  {
    key: "payables",
    title: "Supplier Payables Register",
    desc: "Vendor bills, disbursements, and net pending credit balances.",
    category: "compliance",
  },
  {
    key: "audit",
    title: "System Audit Trail",
    desc: "Comprehensive activity log capturing every approval, posting, master edit, and user session.",
    category: "compliance",
  },
];

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<string>("all");

  const suffix =
    from || to
      ? `?${from ? `date_from=${from}` : ""}${from && to ? "&" : ""}${to ? `date_to=${to}` : ""}`
      : "";

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

  const filteredReports = reportList.filter(
    (r) => category === "all" || r.category === category
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AUDIT & COMPLIANCE SUITE"
        title="Management & Statutory Reports"
        description="Generate certified audit registers in CSV, Excel spreadsheets (.xlsx), and formal PDF reports."
      />

      {/* FILTER & DATE CONTROLS */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#DFE3E6] gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-[#087F8C]" />
            <h3 className="font-semibold text-sm text-[#142B3B]">Date Range & Preset Windows</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium rounded border border-[#DFE3E6] bg-white text-[#657580] hover:bg-[#F5F6F2]"
              onClick={() => setPreset(0)}
            >
              All Time
            </button>
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium rounded border border-[#DFE3E6] bg-white text-[#657580] hover:bg-[#F5F6F2]"
              onClick={() => setPreset(30)}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              className="px-2.5 py-1 text-xs font-medium rounded border border-[#DFE3E6] bg-white text-[#657580] hover:bg-[#F5F6F2]"
              onClick={() => setPreset(7)}
            >
              Last 7 Days
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="field-label">
            From Date
            <input
              type="date"
              className="field mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field-label">
            To Date
            <input
              type="date"
              className="field mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <p className="text-[11px] text-[#657580]">
          * Date boundaries filter time-series registers (Invoices, Purchases, Production runs). Inventory valuations reflect real-time live balances.
        </p>
      </div>

      {/* CATEGORY SELECTOR CHIPS */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={15} className="text-[#657580] mr-1" />
        {[
          ["all", "All Reports"],
          ["sales", "Commercial & Invoices"],
          ["inventory", "Warehouse & Inventory"],
          ["production", "Manufacturing & Costing"],
          ["compliance", "Tax & Audit Compliance"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              category === key
                ? "bg-[#142B3B] text-white border-[#142B3B]"
                : "bg-white text-[#657580] border-[#DFE3E6] hover:bg-[#F5F6F2]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* REPORT TILES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredReports.map((report) => (
          <div key={report.key} className="card p-5 flex flex-col justify-between hover:border-[#087F8C]/40 transition-colors">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded bg-[#142B3B]/10 text-[#142B3B] flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-[#142B3B]">{report.title}</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#087F8C] bg-[#087F8C]/10 px-2 py-0.5 rounded">
                    {report.category}
                  </span>
                </div>
                <p className="text-xs text-[#657580] mt-1 leading-relaxed">{report.desc}</p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#DFE3E6] flex items-center gap-2 flex-wrap">
              <button
                className="secondary-btn !py-1 text-xs"
                onClick={() => download(`/api/reports/export/${report.key}.csv${suffix}`, `${report.key}.csv`)}
                title="Download CSV register"
              >
                <Download size={12} /> CSV
              </button>
              <button
                className="secondary-btn !py-1 text-xs !bg-[#087F8C]/10 !text-[#087F8C] !border-[#087F8C]/30 hover:!bg-[#087F8C]/20"
                onClick={() => download(`/api/reports/export/${report.key}.xlsx${suffix}`, `${report.key}.xlsx`)}
                title="Download Microsoft Excel Workbook"
              >
                <FileSpreadsheet size={12} /> Excel (.xlsx)
              </button>
              <button
                className="secondary-btn !py-1 text-xs !bg-[#142B3B]/10 !text-[#142B3B] !border-[#142B3B]/30 hover:!bg-[#142B3B]/20"
                onClick={() => download(`/api/reports/export/${report.key}.pdf${suffix}`, `${report.key}.pdf`)}
                title="Download Formatted PDF"
              >
                <FileText size={12} /> PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

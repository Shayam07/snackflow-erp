import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  FileDown,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Share2,
} from "lucide-react";
import { api, download, money } from "../services/api";
import { useToast } from "../components/Toast";
import { EmptyState, Modal, PageHeader, TableSkeleton } from "../components/ui";

type InvoiceRow = {
  id: number;
  order_id: number;
  invoice_number: string;
  invoice_date: string;
  customer: string;
  state: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  paid: string;
  outstanding: string;
};

export default function Invoices({ role }: { role: string }) {
  const toast = useToast();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Payment modal state
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Credit note modal state
  const [creditTarget, setCreditTarget] = useState<InvoiceRow | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("Rate discrepancy / return");
  const [restockGoods, setRestockGoods] = useState(false);
  const [submittingCredit, setSubmittingCredit] = useState(false);

  const isAdmin = role === "admin" || role === "owner";

  async function loadInvoices() {
    setLoading(true);
    try {
      const data = await api<InvoiceRow[]>("/api/reports/sales");
      setInvoices(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoices();
  }, []);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalTaxable = 0;
    let totalTax = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;

    invoices.forEach((inv) => {
      totalTaxable += Number(inv.taxable || 0);
      totalTax += Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0);
      totalBilled += Number(inv.total || 0);
      totalPaid += Number(inv.paid || 0);
      totalOutstanding += Number(inv.outstanding || 0);
    });

    return { totalTaxable, totalTax, totalBilled, totalPaid, totalOutstanding };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const out = Number(inv.outstanding);
      let matchesStatus = true;
      if (statusFilter === "paid") matchesStatus = out <= 0;
      if (statusFilter === "unpaid") matchesStatus = out > 0;
      if (statusFilter === "partial") matchesStatus = out > 0 && Number(inv.paid) > 0;

      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.customer.toLowerCase().includes(q) ||
        inv.state.toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [invoices, statusFilter, search]);

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentTarget || !paymentAmount) return;

    setSubmittingPayment(true);
    try {
      // Find customer id from masters if needed, or pass customer id from order
      const masters = await api<any>("/api/masters");
      const customer = masters.customers?.find((c: any) => c.name === paymentTarget.customer);
      if (!customer) throw new Error("Customer profile not found");

      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customer.id,
          invoice_id: paymentTarget.id,
          amount: paymentAmount,
          reference: paymentRef || null,
        }),
      });

      toast.success(`Payment of ₹${Number(paymentAmount).toLocaleString("en-IN")} recorded for ${paymentTarget.invoice_number}`);
      setPaymentTarget(null);
      setPaymentAmount("");
      setPaymentRef("");
      await loadInvoices();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function handleCreateCreditNote(e: React.FormEvent) {
    e.preventDefault();
    if (!creditTarget || !creditAmount) return;

    setSubmittingCredit(true);
    try {
      await api(`/api/invoices/${creditTarget.id}/credit-note`, {
        method: "POST",
        body: JSON.stringify({
          amount: creditAmount,
          reason: creditReason,
          restock: restockGoods,
        }),
      });

      toast.success(`Credit note issued for ${creditTarget.invoice_number}`);
      setCreditTarget(null);
      setCreditAmount("");
      await loadInvoices();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingCredit(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="COMMERCIAL BILLING"
        title="Tax Invoices & Receivables"
        description="Official GST outward supplies register, tax breakdowns, automated PDF invoicing, and collection settlements."
        actions={
          <button onClick={() => void loadInvoices()} className="secondary-btn">
            Refresh
          </button>
        }
      />

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Total Taxable Value</span>
            <div className="w-8 h-8 rounded bg-[#142B3B]/10 text-[#142B3B] flex items-center justify-center font-bold">
              <FileText size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#142B3B]">
            {money(summary.totalTaxable)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Excluding GST across all invoices</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">GST Collected</span>
            <div className="w-8 h-8 rounded bg-[#087F8C]/10 text-[#087F8C] flex items-center justify-center font-bold">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#087F8C]">
            {money(summary.totalTax)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">CGST + SGST + IGST liability</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Total Invoiced</span>
            <div className="w-8 h-8 rounded bg-[#21865B]/10 text-[#21865B] flex items-center justify-center font-bold">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#202B33]">
            {money(summary.totalBilled)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Gross commercial value billed</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Outstanding Dues</span>
            <div className="w-8 h-8 rounded bg-[#F2A541]/10 text-[#D99426] flex items-center justify-center font-bold">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#D99426]">
            {money(summary.totalOutstanding)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Awaiting retail settlement</div>
        </div>
      </div>

      {/* INVOICES TABLE PANEL */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DFE3E6]">
          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "all", label: "All Invoices" },
              { id: "unpaid", label: "Outstanding" },
              { id: "partial", label: "Partially Paid" },
              { id: "paid", label: "Fully Settled" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  statusFilter === f.id
                    ? "bg-[#142B3B] text-white border-[#142B3B]"
                    : "bg-white text-[#657580] border-[#DFE3E6] hover:bg-[#F5F6F2]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#657580]" />
            <input
              className="field pl-9 py-1.5 text-xs"
              placeholder="Search invoice #, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            description="No tax invoices match your filter or search query."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer / Place of Supply</th>
                  <th className="text-right">Taxable (₹)</th>
                  <th className="text-right">GST (₹)</th>
                  <th className="text-right">Gross Total (₹)</th>
                  <th className="text-right">Outstanding (₹)</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const out = Number(inv.outstanding);
                  const isSettled = out <= 0;
                  const isPartial = out > 0 && Number(inv.paid) > 0;
                  const totalTax = Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst);

                  const shareText = `SnackFlow Tax Invoice ${inv.invoice_number} for Rs. ${inv.total}. Outstanding balance: Rs. ${inv.outstanding}.`;
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

                  return (
                    <tr key={inv.id} className="hover:bg-[#F5F6F2]/60">
                      <td className="font-mono font-semibold text-[#142B3B]">
                        {inv.invoice_number}
                      </td>

                      <td className="text-xs text-[#657580] whitespace-nowrap">
                        {inv.invoice_date}
                      </td>

                      <td>
                        <div className="font-semibold text-[#142B3B]">{inv.customer}</div>
                        <div className="text-[11px] text-[#657580]">{inv.state}</div>
                      </td>

                      <td className="text-right font-mono text-xs">
                        ₹{Number(inv.taxable).toFixed(2)}
                      </td>

                      <td className="text-right font-mono text-xs text-[#087F8C]">
                        ₹{totalTax.toFixed(2)}
                      </td>

                      <td className="text-right font-mono font-semibold text-[#142B3B]">
                        ₹{Number(inv.total).toFixed(2)}
                      </td>

                      <td className="text-right font-mono font-semibold">
                        {out > 0 ? (
                          <span className="text-[#D99426]">₹{out.toFixed(2)}</span>
                        ) : (
                          <span className="text-[#21865B]">₹0.00</span>
                        )}
                      </td>

                      <td>
                        {isSettled ? (
                          <span className="status-badge status-completed">Settled</span>
                        ) : isPartial ? (
                          <span className="status-badge status-pending">Partial</span>
                        ) : (
                          <span className="status-badge status-draft">Unpaid</span>
                        )}
                      </td>

                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => download(`/api/invoices/${inv.id}/pdf`, `${inv.invoice_number}.pdf`)}
                            className="secondary-btn !py-1 text-xs"
                            title="Download official PDF invoice"
                          >
                            <FileDown size={12} /> PDF
                          </button>

                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded border border-[#21865B]/30 bg-[#21865B]/10 text-[#21865B] hover:bg-[#21865B]/20 transition-colors"
                            title="Share on WhatsApp"
                          >
                            <Share2 size={13} />
                          </a>

                          {isAdmin && !isSettled && (
                            <button
                              onClick={() => {
                                setPaymentTarget(inv);
                                setPaymentAmount(inv.outstanding);
                              }}
                              className="secondary-btn !py-1 text-xs !bg-[#21865B]/10 !text-[#21865B] !border-[#21865B]/30"
                              title="Record payment collection"
                            >
                              <DollarSign size={12} /> Settle
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => {
                                setCreditTarget(inv);
                                setCreditAmount(inv.outstanding);
                              }}
                              className="p-1.5 rounded border border-[#DFE3E6] text-[#657580] hover:text-[#F2A541] hover:border-[#F2A541]/40"
                              title="Issue Credit Note / Return"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        open={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title={`Record Payment for ${paymentTarget?.invoice_number}`}
        description={`Customer: ${paymentTarget?.customer} · Current Outstanding: ₹${paymentTarget?.outstanding}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <label className="field-label">
            Payment Amount (₹) *
            <input
              type="number"
              step="0.01"
              max={paymentTarget?.outstanding}
              required
              className="field mt-1"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="e.g. 5000"
            />
          </label>

          <label className="field-label">
            Bank UTR / Cheque Ref / Payment Note
            <input
              className="field mt-1"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="e.g. NEFT/HDFC/20261108"
            />
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setPaymentTarget(null)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={submittingPayment} className="primary-btn">
              Confirm Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* ISSUE CREDIT NOTE MODAL */}
      <Modal
        open={Boolean(creditTarget)}
        onClose={() => setCreditTarget(null)}
        title={`Issue Credit Note for ${creditTarget?.invoice_number}`}
        description="Creates a statutory GST credit note and adjusts outstanding receivables."
      >
        <form onSubmit={handleCreateCreditNote} className="space-y-4">
          <label className="field-label">
            Credit Note Amount (₹) *
            <input
              type="number"
              step="0.01"
              max={creditTarget?.total}
              required
              className="field mt-1"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </label>

          <label className="field-label">
            Statutory Reason
            <input
              className="field mt-1"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              placeholder="e.g. Damaged goods credit / Trade price adjustment"
              required
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-[#202B33] cursor-pointer pt-1">
            <input
              type="checkbox"
              className="rounded border-[#DFE3E6] text-[#087F8C]"
              checked={restockGoods}
              onChange={(e) => setRestockGoods(e.target.checked)}
            />
            Restock goods back into warehouse inventory (dispatched orders only)
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setCreditTarget(null)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={submittingCredit} className="primary-btn !bg-[#F2A541] !text-black">
              Issue Credit Note
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

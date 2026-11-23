import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Filter,
  Plus,
  Receipt,
  Search,
} from "lucide-react";
import { api, money } from "../services/api";
import { useToast } from "../components/Toast";
import { EmptyState, Modal, PageHeader, TableSkeleton } from "../components/ui";

type CollectionRow = {
  payment_id: number;
  payment_date: string;
  customer: string;
  amount: string;
  reference: string | null;
  invoice_number: string;
  invoice_date: string;
  invoice_total: string;
};

export default function Payments({ role }: { role: string }) {
  const toast = useToast();
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [masters, setMasters] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Record payment modal
  const [openModal, setOpenModal] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = role === "admin" || role === "owner";

  async function loadData() {
    setLoading(true);
    try {
      const [colData, invData, masterData] = await Promise.all([
        api<CollectionRow[]>("/api/reports/collections"),
        api<any[]>("/api/reports/sales"),
        api<any>("/api/masters"),
      ]);

      setCollections(colData);
      setInvoices(invData);
      setMasters(masterData);

      if (!customerId && masterData.customers?.length) {
        setCustomerId(String(masterData.customers[0].id));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load payment records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Filter invoices for chosen customer
  const customerInvoices = useMemo(() => {
    if (!customerId || !masters) return [];
    const customerObj = masters.customers?.find((c: any) => String(c.id) === customerId);
    if (!customerObj) return [];
    return invoices.filter(
      (inv) => inv.customer === customerObj.name && Number(inv.outstanding) > 0
    );
  }, [customerId, masters, invoices]);

  useEffect(() => {
    if (customerInvoices.length > 0) {
      setInvoiceId(String(customerInvoices[0].id));
      setAmount(customerInvoices[0].outstanding);
    } else {
      setInvoiceId("");
      setAmount("");
    }
  }, [customerInvoices]);

  const summary = useMemo(() => {
    const totalCollected = collections.reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const totalInvoiced = invoices.reduce((acc, i) => acc + Number(i.total || 0), 0);
    const totalOutstanding = invoices.reduce((acc, i) => acc + Number(i.outstanding || 0), 0);

    return { totalCollected, totalInvoiced, totalOutstanding };
  }, [collections, invoices]);

  const filteredCollections = useMemo(() => {
    return collections.filter((c) => {
      const q = search.toLowerCase();
      return (
        !q ||
        c.customer.toLowerCase().includes(q) ||
        c.invoice_number.toLowerCase().includes(q) ||
        (c.reference && c.reference.toLowerCase().includes(q))
      );
    });
  }, [collections, search]);

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!customerId || !invoiceId || !amount) {
      toast.error("Please fill in customer, invoice, and payment amount");
      return;
    }

    setSubmitting(true);
    try {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: Number(customerId),
          invoice_id: Number(invoiceId),
          amount,
          reference: reference || null,
        }),
      });

      toast.success(`Payment of ₹${Number(amount).toLocaleString("en-IN")} recorded successfully`);
      setOpenModal(false);
      setReference("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="TREASURY & CASH FLOW"
        title="Payment Collections Register"
        description="Monitor customer cash receipts, bank transfers, invoice payment allocations, and receivables reconciliation."
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setOpenModal(true)} className="primary-btn">
                <Plus size={15} /> Record Collection
              </button>
            )}
            <button onClick={() => void loadData()} className="secondary-btn">
              Refresh
            </button>
          </div>
        }
      />

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Total Invoiced</span>
            <div className="w-8 h-8 rounded bg-[#142B3B]/10 text-[#142B3B] flex items-center justify-center font-bold">
              <Receipt size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#142B3B]">
            {money(summary.totalInvoiced)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Total revenue billed across all dispatches</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Total Collected</span>
            <div className="w-8 h-8 rounded bg-[#21865B]/10 text-[#21865B] flex items-center justify-center font-bold">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#21865B]">
            {money(summary.totalCollected)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Settled in factory bank accounts</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Uncollected Dues</span>
            <div className="w-8 h-8 rounded bg-[#F2A541]/10 text-[#D99426] flex items-center justify-center font-bold">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#D99426]">
            {money(summary.totalOutstanding)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Net pending trade receivables</div>
        </div>
      </div>

      {/* COLLECTIONS TABLE */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DFE3E6]">
          <div>
            <h3 className="font-semibold text-[#142B3B] text-sm">Receipts & Payment Allocations</h3>
            <p className="text-xs text-[#657580]">Real-time ledger of inbound payments mapped to statutory tax invoices</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#657580]" />
            <input
              className="field pl-9 py-1 text-xs"
              placeholder="Search customer, invoice #, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : filteredCollections.length === 0 ? (
          <EmptyState
            title="No payment collections found"
            description="No customer collections have been recorded yet or match your search."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Target Invoice</th>
                  <th>Invoice Total</th>
                  <th>Reference / UTR</th>
                  <th className="text-right">Amount Received (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCollections.map((col) => (
                  <tr key={col.payment_id} className="hover:bg-[#F5F6F2]/60">
                    <td className="font-mono text-xs text-[#657580]">
                      REC-{String(col.payment_id).padStart(5, "0")}
                    </td>

                    <td className="text-xs text-[#657580] whitespace-nowrap">
                      {col.payment_date}
                    </td>

                    <td className="font-semibold text-[#142B3B]">{col.customer}</td>

                    <td className="font-mono text-xs text-[#087F8C]">
                      {col.invoice_number}
                    </td>

                    <td className="font-mono text-xs">
                      ₹{Number(col.invoice_total).toFixed(2)}
                    </td>

                    <td className="text-xs font-mono text-[#657580]">
                      {col.reference || "Direct Transfer"}
                    </td>

                    <td className="text-right font-mono font-semibold text-[#21865B]">
                      ₹{Number(col.amount).toFixed(2)}
                    </td>

                    <td>
                      <span className="status-badge status-completed">Reconciled</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECORD COLLECTION MODAL */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Record Customer Payment Receipt"
        description="Allocate incoming funds to outstanding tax invoices."
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <label className="field-label">
            Customer / Distributor *
            <select
              className="field mt-1"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              {masters?.customers?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.state})
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Target Invoice to Settle *
            <select
              className="field mt-1"
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const inv = customerInvoices.find((i) => String(i.id) === e.target.value);
                if (inv) setAmount(inv.outstanding);
              }}
              required
            >
              {customerInvoices.length === 0 ? (
                <option value="">No outstanding invoices for this customer</option>
              ) : (
                customerInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} · Total: ₹{inv.total} (Due: ₹{inv.outstanding})
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="field-label">
            Receipt Amount (₹) *
            <input
              type="number"
              step="0.01"
              required
              className="field mt-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10000"
            />
          </label>

          <label className="field-label">
            Payment Ref / Bank UTR / Cheque #
            <input
              className="field mt-1"
              placeholder="e.g. NEFT/SBI/44091823"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setOpenModal(false)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !invoiceId}
              className="primary-btn"
            >
              Record Receipt
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { api, money, type Paged } from "../services/api";
import { useToast } from "../components/Toast";
import { EmptyState, Modal, PageHeader, TableSkeleton } from "../components/ui";

type Payable = {
  supplier_id: number;
  supplier: string;
  state: string;
  bills: number;
  billed: string;
  paid: string;
  outstanding: string;
};

type Purchase = {
  id: number;
  document_no: string;
  supplier_id: number;
  supplier: string;
  purchased_at: string;
  total: string;
};

type SupplierPayment = {
  id: number;
  supplier: string;
  purchase_id: number | null;
  amount: string;
  method: string;
  reference: string | null;
  paid_at: string;
};

type PurchaseLine = { item_id: string; quantity: string; unit_cost: string };

export default function Purchases({ role }: { role: string }) {
  const toast = useToast();
  const [payables, setPayables] = useState<Payable[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [masters, setMasters] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New purchase modal
  const [openNewPurchase, setOpenNewPurchase] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([
    { item_id: "", quantity: "100", unit_cost: "50" },
  ]);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  // Supplier payment settlement modal
  const [paymentTarget, setPaymentTarget] = useState<Payable | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [paymentRef, setPaymentRef] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState<"bills" | "payables" | "payments">("bills");
  const [search, setSearch] = useState("");

  const isAdmin = role === "admin" || role === "production";

  async function loadData() {
    setLoading(true);
    try {
      const [summary, billPage, paymentPage, masterData] = await Promise.all([
        api<Payable[]>("/api/payables"),
        api<Paged<Purchase>>("/api/purchases?limit=50"),
        api<Paged<SupplierPayment>>("/api/supplier-payments?limit=30"),
        api<any>("/api/masters"),
      ]);

      setPayables(summary);
      setPurchases(billPage.items);
      setPayments(paymentPage.items);
      setMasters(masterData);

      if (!supplierId && masterData.suppliers?.length) {
        setSupplierId(String(masterData.suppliers[0].id));
      }
      if (!lines[0].item_id && masterData.items?.length) {
        const rawItem = masterData.items.find((i: any) => i.type !== "finished");
        if (rawItem) {
          setLines([{ item_id: String(rawItem.id), quantity: "100", unit_cost: "50" }]);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load procurement records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const totals = useMemo(() => {
    return payables.reduce(
      (acc, row) => ({
        billed: acc.billed + Number(row.billed),
        paid: acc.paid + Number(row.paid),
        outstanding: acc.outstanding + Number(row.outstanding),
      }),
      { billed: 0, paid: 0, outstanding: 0 }
    );
  }, [payables]);

  const rawAndPackagingItems = useMemo(() => {
    return masters?.items?.filter((i: any) => i.type !== "finished") || [];
  }, [masters]);

  function updateLine(index: number, field: keyof PurchaseLine, value: string) {
    setLines((curr) => curr.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addLine() {
    const defaultItem = rawAndPackagingItems[0];
    setLines((curr) => [
      ...curr,
      { item_id: defaultItem ? String(defaultItem.id) : "", quantity: "100", unit_cost: "50" },
    ]);
  }

  function removeLine(index: number) {
    setLines((curr) => curr.filter((_, i) => i !== index));
  }

  const purchaseTotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  }, [lines]);

  async function handleCreatePurchase(e: FormEvent) {
    e.preventDefault();
    if (!supplierId || !documentNo) {
      toast.error("Please specify a supplier and invoice number");
      return;
    }

    setSubmittingPurchase(true);
    try {
      await api("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(supplierId),
          document_no: documentNo,
          lines: lines.map((l) => ({
            item_id: Number(l.item_id),
            quantity: Number(l.quantity),
            unit_cost: Number(l.unit_cost),
          })),
        }),
      });

      toast.success(`Purchase invoice ${documentNo} posted successfully. Stock ledger updated.`);
      setOpenNewPurchase(false);
      setDocumentNo("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingPurchase(false);
    }
  }

  async function handleSupplierPayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentTarget || !paymentAmount) return;

    setSubmittingPayment(true);
    try {
      await api("/api/supplier-payments", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: paymentTarget.supplier_id,
          amount: paymentAmount,
          method: paymentMethod,
          reference: paymentRef || null,
        }),
      });

      toast.success(`Payment of ₹${Number(paymentAmount).toLocaleString("en-IN")} recorded for ${paymentTarget.supplier}`);
      setPaymentTarget(null);
      setPaymentAmount("");
      setPaymentRef("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingPayment(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SUPPLY CHAIN & PROCUREMENT"
        title="Purchases & Supplier Payables"
        description="Receive raw materials, packaging cartons and pouches, track vendor invoice dues, and settle accounts."
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setOpenNewPurchase(true)}
                className="primary-btn"
              >
                <Plus size={15} /> New Purchase Bill
              </button>
            )}
            <button onClick={() => void loadData()} className="secondary-btn">
              Refresh
            </button>
          </div>
        }
      />

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Total Billed</span>
            <div className="w-8 h-8 rounded bg-[#142B3B]/10 text-[#142B3B] flex items-center justify-center font-bold">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#142B3B]">
            {money(totals.billed)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Cumulative vendor procurement bills</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Paid to Date</span>
            <div className="w-8 h-8 rounded bg-[#21865B]/10 text-[#21865B] flex items-center justify-center font-bold">
              <Banknote size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#21865B]">
            {money(totals.paid)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Disbursed to ingredient suppliers</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Payables Outstanding</span>
            <div className="w-8 h-8 rounded bg-[#D64B4B]/10 text-[#D64B4B] flex items-center justify-center font-bold">
              <Clock size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#D64B4B]">
            {money(totals.outstanding)}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Due to active suppliers</div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#657580] uppercase tracking-wider">Suppliers With Dues</span>
            <div className="w-8 h-8 rounded bg-[#F2A541]/10 text-[#D99426] flex items-center justify-center font-bold">
              <Truck size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#D99426]">
            {payables.filter((p) => Number(p.outstanding) > 0).length} of {payables.length}
          </div>
          <div className="text-[11px] text-[#657580] mt-1">Active vendor credit accounts</div>
        </div>
      </div>

      {/* TABS & DATA DISPLAY */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DFE3E6]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("bills")}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                activeTab === "bills"
                  ? "bg-[#142B3B] text-white"
                  : "text-[#657580] hover:text-[#142B3B]"
              }`}
            >
              Purchase Bills Register
            </button>
            <button
              onClick={() => setActiveTab("payables")}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                activeTab === "payables"
                  ? "bg-[#142B3B] text-white"
                  : "text-[#657580] hover:text-[#142B3B]"
              }`}
            >
              Supplier Payables Summary
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                activeTab === "payments"
                  ? "bg-[#142B3B] text-white"
                  : "text-[#657580] hover:text-[#142B3B]"
              }`}
            >
              Disbursement History
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#657580]" />
            <input
              className="field pl-9 py-1 text-xs"
              placeholder="Search vendor, bill #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : activeTab === "bills" ? (
          /* BILLS REGISTER */
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Doc #</th>
                  <th>Supplier</th>
                  <th>Receipt Date</th>
                  <th className="text-right">Total Amount (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases
                  .filter(
                    (p) =>
                      !search ||
                      p.document_no.toLowerCase().includes(search.toLowerCase()) ||
                      p.supplier.toLowerCase().includes(search.toLowerCase())
                  )
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-[#F5F6F2]/60">
                      <td className="font-mono font-semibold text-[#142B3B]">{p.document_no}</td>
                      <td className="font-medium text-[#142B3B]">{p.supplier}</td>
                      <td className="text-xs text-[#657580]">
                        {new Date(p.purchased_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="text-right font-mono font-semibold text-[#142B3B]">
                        ₹{Number(p.total).toFixed(2)}
                      </td>
                      <td>
                        <span className="status-badge status-completed">Posted to Stock</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === "payables" ? (
          /* PAYABLES SUMMARY */
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>State</th>
                  <th className="text-center">Bills Count</th>
                  <th className="text-right">Total Billed (₹)</th>
                  <th className="text-right">Total Paid (₹)</th>
                  <th className="text-right">Outstanding (₹)</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payables
                  .filter(
                    (row) =>
                      !search ||
                      row.supplier.toLowerCase().includes(search.toLowerCase()) ||
                      row.state.toLowerCase().includes(search.toLowerCase())
                  )
                  .map((row) => {
                    const out = Number(row.outstanding);
                    return (
                      <tr key={row.supplier_id} className="hover:bg-[#F5F6F2]/60">
                        <td className="font-semibold text-[#142B3B]">{row.supplier}</td>
                        <td className="text-xs text-[#657580]">{row.state}</td>
                        <td className="text-center font-mono text-xs">{row.bills}</td>
                        <td className="text-right font-mono text-xs">₹{Number(row.billed).toFixed(2)}</td>
                        <td className="text-right font-mono text-xs text-[#21865B]">
                          ₹{Number(row.paid).toFixed(2)}
                        </td>
                        <td className="text-right font-mono font-semibold">
                          {out > 0 ? (
                            <span className="text-[#D64B4B]">₹{out.toFixed(2)}</span>
                          ) : (
                            <span className="text-[#21865B]">₹0.00</span>
                          )}
                        </td>
                        <td className="text-right">
                          {out > 0 && isAdmin && (
                            <button
                              onClick={() => {
                                setPaymentTarget(row);
                                setPaymentAmount(row.outstanding);
                              }}
                              className="secondary-btn !py-1 text-xs !bg-[#21865B]/10 !text-[#21865B] !border-[#21865B]/30"
                            >
                              <DollarSign size={12} /> Pay Supplier
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          /* PAYMENTS REGISTER */
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Supplier</th>
                  <th>Disbursed Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pmt) => (
                  <tr key={pmt.id} className="hover:bg-[#F5F6F2]/60">
                    <td className="font-mono text-xs text-[#657580]">#{pmt.id}</td>
                    <td className="font-semibold text-[#142B3B]">{pmt.supplier}</td>
                    <td className="text-xs text-[#657580]">
                      {new Date(pmt.paid_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td>
                      <span className="uppercase text-[11px] font-semibold text-[#087F8C]">
                        {pmt.method}
                      </span>
                    </td>
                    <td className="text-xs font-mono text-[#657580]">{pmt.reference || "—"}</td>
                    <td className="text-right font-mono font-semibold text-[#21865B]">
                      ₹{Number(pmt.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NEW PURCHASE BILL MODAL */}
      <Modal
        open={openNewPurchase}
        onClose={() => setOpenNewPurchase(false)}
        title="Record Supplier Purchase Bill"
        description="Receive raw material ingredients or packaging materials into inventory warehouse stock."
      >
        <form onSubmit={handleCreatePurchase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="field-label">
              Supplier / Vendor *
              <select
                className="field mt-1"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
              >
                {masters?.suppliers?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.state})
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Vendor Bill / Invoice # *
              <input
                className="field mt-1"
                placeholder="e.g. BILL-2026-881"
                value={documentNo}
                onChange={(e) => setDocumentNo(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#DFE3E6]">
            <div className="flex items-center justify-between text-xs font-semibold text-[#657580]">
              <span>Purchased Line Items</span>
              <span className="text-[#087F8C]">Estimated Total: ₹{purchaseTotal.toFixed(2)}</span>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  className="field text-xs flex-1"
                  value={line.item_id}
                  onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                  required
                >
                  {rawAndPackagingItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit}) [{item.type}]
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="0.1"
                  step="any"
                  className="field text-xs w-24"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                  required
                />

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="field text-xs w-28"
                  placeholder="Rate (₹)"
                  value={line.unit_cost}
                  onChange={(e) => updateLine(idx, "unit_cost", e.target.value)}
                  required
                />

                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(idx)}
                  className="p-1.5 text-[#657580] hover:text-[#D64B4B]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addLine}
              className="text-xs font-semibold text-[#087F8C] flex items-center gap-1 mt-1"
            >
              <Plus size={13} /> Add Item Line
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setOpenNewPurchase(false)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={submittingPurchase} className="primary-btn">
              Post Purchase Bill
            </button>
          </div>
        </form>
      </Modal>

      {/* SUPPLIER PAYMENT MODAL */}
      <Modal
        open={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title={`Disburse Payment to ${paymentTarget?.supplier}`}
        description={`Current Outstanding Balance: ₹${paymentTarget?.outstanding}`}
      >
        <form onSubmit={handleSupplierPayment} className="space-y-4">
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
            />
          </label>

          <label className="field-label">
            Payment Method
            <select
              className="field mt-1"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="bank">Bank Transfer (NEFT / RTGS / IMPS)</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash / Petty Cash</option>
            </select>
          </label>

          <label className="field-label">
            Transaction UTR / Cheque Reference #
            <input
              className="field mt-1"
              placeholder="e.g. UTR-AXIS-88291039"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
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
              Confirm Disbursement
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

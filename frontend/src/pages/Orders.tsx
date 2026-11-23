import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileDown,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  ShoppingCart,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { api, download, money } from "../services/api";
import { enqueueOrder, syncQueuedOrders } from "../services/offlineQueue";
import { useToast } from "../components/Toast";
import { EmptyState, Modal, PageHeader, TableSkeleton } from "../components/ui";

type OrderLine = { product_id: string; quantity: string; unit_price?: string };
type OrderRow = {
  id: number;
  customer_id: number;
  customer_name: string;
  status: string;
  salesman_id: number | null;
  notes: string | null;
  created_at: string;
  lines: { product_id: number; product_name: string; quantity: number; unit_price: string }[];
};

export default function Orders({ role }: { role: string }) {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [masters, setMasters] = useState<any>(null);
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([{ product_id: "", quantity: "1" }]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Edit order modal
  const [editingOrder, setEditingOrder] = useState<OrderRow | null>(null);
  const [editLines, setEditLines] = useState<OrderLine[]>([]);
  const [editNotes, setEditNotes] = useState("");

  // Invoicing and payment modals
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [paymentModalOrder, setPaymentModalOrder] = useState<OrderRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Shortage modal feedback
  const [shortageReport, setShortageReport] = useState<{ orderId: number; items: Record<string, string> } | null>(null);

  // Salesman territory history
  const [salesHistory, setSalesHistory] = useState<any[]>([]);

  const isAdmin = role === "admin" || role === "owner";
  const canCreate = role === "salesman" || role === "admin";

  async function loadData() {
    setLoading(true);
    try {
      const [orderRows, masterData] = await Promise.all([
        api<OrderRow[]>("/api/orders?limit=100"),
        api<any>("/api/masters"),
      ]);
      setOrders(orderRows);
      setMasters(masterData);

      if (!customerId && masterData.customers?.length) {
        setCustomerId(String(masterData.customers[0].id));
      }
      if (!lines[0]?.product_id && masterData.products?.length) {
        setLines([{ product_id: String(masterData.products[0].id), quantity: "1" }]);
      }

      if (role === "salesman") {
        try {
          const hist = await api<any[]>("/api/sales/my-sales");
          setSalesHistory(hist);
        } catch {
          // salesman sales optional
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();

    const handleOnline = async () => {
      try {
        const synced = await syncQueuedOrders();
        if (synced) {
          toast.success(`${synced} offline order(s) synchronized with factory server`);
          void loadData();
        }
      } catch (err: any) {
        toast.error(err.message);
      }
    };

    window.addEventListener("online", handleOnline);
    if (navigator.onLine) void handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, [role]);

  // Live order calculations
  const selectedCustomer = useMemo(() => {
    return masters?.customers?.find((c: any) => String(c.id) === customerId);
  }, [masters, customerId]);

  const isIntraState = selectedCustomer?.state === "Tamil Nadu" || !selectedCustomer;

  const orderCalculations = useMemo(() => {
    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let totalUnits = 0;

    lines.forEach((line) => {
      const prod = masters?.products?.find((p: any) => String(p.id) === line.product_id);
      const qty = Number(line.quantity) || 0;
      const rate = prod ? Number(prod.price) : 0;
      const lineTaxable = qty * rate;
      const gstRate = prod ? Number(prod.gst_rate) : 0.12;

      subtotal += lineTaxable;
      totalUnits += qty;

      if (isIntraState) {
        cgst += (lineTaxable * gstRate) / 2;
        sgst += (lineTaxable * gstRate) / 2;
      } else {
        igst += lineTaxable * gstRate;
      }
    });

    const totalTax = cgst + sgst + igst;
    const grandTotal = subtotal + totalTax;

    return { subtotal, cgst, sgst, igst, totalTax, grandTotal, totalUnits };
  }, [lines, masters, isIntraState]);

  function updateLine(index: number, field: keyof OrderLine, value: string, edit = false) {
    const setter = edit ? setEditLines : setLines;
    setter((curr) => curr.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addLine(edit = false) {
    const setter = edit ? setEditLines : setLines;
    setter((curr) => [
      ...curr,
      { product_id: String(masters?.products?.[0]?.id || ""), quantity: "1", unit_price: "" },
    ]);
  }

  function removeLine(index: number, edit = false) {
    const setter = edit ? setEditLines : setLines;
    setter((curr) => curr.filter((_, i) => i !== index));
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }

    try {
      const payload = {
        customer_id: Number(customerId),
        client_request_id: crypto.randomUUID(),
        notes: notes || undefined,
        lines: lines.map((l) => ({
          product_id: Number(l.product_id),
          quantity: Number(l.quantity),
        })),
      };

      if (!navigator.onLine) {
        await enqueueOrder(payload);
        toast.info("Offline: order saved locally and will auto-sync when online");
      } else {
        try {
          await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
          toast.success("Sales order placed successfully");
        } catch (err: any) {
          if (err instanceof TypeError) {
            await enqueueOrder(payload);
            toast.info("Connection lost: order saved in local queue");
          } else {
            throw err;
          }
        }
      }

      setNotes("");
      if (masters?.products?.length) {
        setLines([{ product_id: String(masters.products[0].id), quantity: "1" }]);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit order");
    }
  }

  function openEdit(order: OrderRow) {
    setEditingOrder(order);
    setEditNotes(order.notes || "");
    setEditLines(
      order.lines.map((l) => ({
        product_id: String(l.product_id),
        quantity: String(l.quantity),
        unit_price: l.unit_price,
      }))
    );
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;

    try {
      await api(`/api/orders/${editingOrder.id}`, {
        method: "PUT",
        body: JSON.stringify({
          notes: editNotes || null,
          lines: editLines.map((l) => ({
            product_id: Number(l.product_id),
            quantity: Number(l.quantity),
            unit_price: l.unit_price ? Number(l.unit_price) : undefined,
          })),
        }),
      });
      toast.success(`Order SO-${String(editingOrder.id).padStart(5, "0")} revised`);
      setEditingOrder(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleAction(orderId: number, act: "approve" | "reject" | "cancel" | "invoice" | "dispatch" | "return") {
    try {
      const res = await api<any>(`/api/orders/${orderId}/${act}`, { method: "POST" });

      if (act === "approve") {
        if (res.approved) {
          toast.success(`Order SO-${String(orderId).padStart(5, "0")} approved for fulfillment`);
        } else if (res.shortage) {
          setShortageReport({ orderId, items: res.shortage });
          toast.error("Stock shortage detected — cannot approve order");
        }
      } else if (act === "invoice") {
        setLastInvoice(res);
        toast.success(`Tax Invoice ${res.invoice_number} generated`);
      } else if (act === "dispatch") {
        toast.success(`Order SO-${String(orderId).padStart(5, "0")} dispatched and stock deducted`);
      } else if (act === "return") {
        toast.success(`Order SO-${String(orderId).padStart(5, "0")} returned. Restocked & credit note raised.`);
      } else if (act === "reject") {
        toast.info(`Order SO-${String(orderId).padStart(5, "0")} rejected`);
      } else if (act === "cancel") {
        toast.info(`Order SO-${String(orderId).padStart(5, "0")} cancelled`);
      }

      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentModalOrder || !paymentAmount) return;

    setSubmittingPayment(true);
    try {
      // Find invoice for this order or use order id
      const invoiceData = await api<any[]>(`/api/reports/sales`);
      const inv = invoiceData.find((r) => r.order_id === paymentModalOrder.id || r.invoice_number?.includes(String(paymentModalOrder.id)));
      const invoiceId = inv?.id || paymentModalOrder.id;

      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: paymentModalOrder.customer_id,
          invoice_id: invoiceId,
          amount: paymentAmount,
          reference: paymentRef || null,
        }),
      });

      toast.success(`Recorded payment of ₹${Number(paymentAmount).toLocaleString("en-IN")}`);
      setPaymentModalOrder(null);
      setPaymentAmount("");
      setPaymentRef("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingPayment(false);
    }
  }

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        o.customer_name.toLowerCase().includes(q) ||
        String(o.id).includes(q) ||
        o.lines.some((l) => l.product_name.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, search]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return <span className="status-badge status-draft"><Clock size={11} /> Submitted</span>;
      case "approved":
        return <span className="status-badge status-active"><CheckCircle2 size={11} /> Approved</span>;
      case "invoiced":
        return <span className="status-badge status-pending"><FileText size={11} /> Invoiced</span>;
      case "dispatched":
        return <span className="status-badge status-completed"><Truck size={11} /> Dispatched</span>;
      case "returned":
        return <span className="status-badge status-reversal"><RotateCcw size={11} /> Returned</span>;
      case "cancelled":
      case "rejected":
        return <span className="status-badge status-disabled"><XCircle size={11} /> {status}</span>;
      default:
        return <span className="status-badge status-draft">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="COMMERCIAL DISTRIBUTION"
        title="Sales Orders & Fulfillment"
        description="Capture multi-line wholesale orders, verify stock allocations, generate GST invoices, and track dispatches."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadData()}
              className="secondary-btn"
              title="Refresh order records"
            >
              Refresh
            </button>
          </div>
        }
      />

      {/* NEW ORDER ENTRY PANEL */}
      {canCreate && (
        <form onSubmit={submitOrder} className="card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#DFE3E6] gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-[#087F8C]/10 text-[#087F8C] flex items-center justify-center font-bold">
                <ShoppingCart size={17} />
              </div>
              <div>
                <h3 className="font-semibold text-[#142B3B] text-base">New Sales Order</h3>
                <p className="text-xs text-[#657580]">Create an order for an authorized retail distributor or supermarket</p>
              </div>
            </div>

            {/* Quick summary badges */}
            <div className="flex items-center gap-3 text-xs bg-[#F5F6F2] px-3 py-1.5 rounded border border-[#DFE3E6]">
              <span className="text-[#657580]">
                Volume: <strong className="text-[#142B3B]">{orderCalculations.totalUnits}</strong> pkts
              </span>
              <span className="h-3 w-px bg-[#DFE3E6]" />
              <span className="text-[#657580]">
                Est. Total: <strong className="text-[#087F8C] font-semibold">₹{orderCalculations.grandTotal.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="field-label">
                Distributor / Retail Customer *
                <select
                  className="field mt-1"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  {masters?.customers?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.state} ({c.type || c.customer_type}) {c.gstin ? `[GST: ${c.gstin}]` : "[Unregistered]"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="field-label">
                Order Memo / PO Ref
                <input
                  className="field mt-1"
                  placeholder="e.g. PO-2026-904"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Line items table */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-[#657580] uppercase tracking-wider">
              Product SKU Lines
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const prod = masters?.products?.find((p: any) => String(p.id) === line.product_id);
                const item = masters?.items?.find((i: any) => i.id === prod?.item_id);
                const rate = prod ? Number(prod.price) : 0;
                const qty = Number(line.quantity) || 0;
                const lineTotal = qty * rate;
                const onHand = item ? Number(item.balance || 0) : 0;
                const isShort = qty > onHand;

                return (
                  <div
                    key={idx}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded border ${
                      isShort ? "bg-[#D64B4B]/5 border-[#D64B4B]/30" : "bg-white border-[#DFE3E6]"
                    }`}
                  >
                    <div className="flex-1">
                      <select
                        className="field text-sm"
                        value={line.product_id}
                        onChange={(e) => updateLine(idx, "product_id", e.target.value)}
                        required
                      >
                        {masters?.products?.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.family} ({p.pack_size_g}g) — ₹{p.price} (GST {Number(p.gst_rate) * 100}%)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-32">
                      <input
                        type="number"
                        min="1"
                        className="field text-sm"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                        placeholder="Quantity"
                        required
                      />
                    </div>

                    <div className="w-28 text-right font-mono text-sm font-semibold text-[#142B3B]">
                      ₹{lineTotal.toFixed(2)}
                      <div className="text-[10px] text-[#657580] font-sans font-normal">
                        Stock: {onHand} pkts {isShort && <span className="text-[#D64B4B] font-bold">Short!</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(idx)}
                      className="p-2 text-[#657580] hover:text-[#D64B4B] hover:bg-[#D64B4B]/10 rounded disabled:opacity-30 transition-colors"
                      title="Remove product line"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => addLine()}
              className="text-xs font-semibold text-[#087F8C] hover:text-[#066570] flex items-center gap-1.5 py-1 px-2 rounded hover:bg-[#087F8C]/10 transition-colors"
            >
              <Plus size={14} /> Add Another Product SKU
            </button>
          </div>

          {/* Live Order Valuation Summary */}
          <div className="mt-4 pt-4 border-t border-[#DFE3E6] bg-[#F5F6F2] p-4 rounded flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[#657580] block">Taxable Subtotal:</span>
                <span className="font-semibold text-sm text-[#142B3B] font-mono">₹{orderCalculations.subtotal.toFixed(2)}</span>
              </div>
              {isIntraState ? (
                <>
                  <div>
                    <span className="text-[#657580] block">CGST (Intra-state):</span>
                    <span className="font-semibold text-sm text-[#142B3B] font-mono">₹{orderCalculations.cgst.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[#657580] block">SGST (Intra-state):</span>
                    <span className="font-semibold text-sm text-[#142B3B] font-mono">₹{orderCalculations.sgst.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-[#657580] block">IGST (Inter-state):</span>
                  <span className="font-semibold text-sm text-[#142B3B] font-mono">₹{orderCalculations.igst.toFixed(2)}</span>
                </div>
              )}
              <div>
                <span className="text-[#657580] block">Est. Grand Total:</span>
                <span className="font-bold text-base text-[#087F8C] font-mono">₹{orderCalculations.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button type="submit" className="primary-btn">
                <Send size={15} /> Submit Sales Order
              </button>
            </div>
          </div>
        </form>
      )}

      {/* GENERATED INVOICE ALERT */}
      {lastInvoice && (
        <div className="card p-4 bg-[#087F8C]/5 border-[#087F8C]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#087F8C] text-white flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <div className="font-bold text-[#142B3B] text-sm">
                Invoice {lastInvoice.invoice_number} Issued
              </div>
              <div className="text-xs text-[#657580]">
                Taxable: ₹{lastInvoice.taxable} · Total: ₹{lastInvoice.total} (CGST: ₹{lastInvoice.cgst}, SGST: ₹{lastInvoice.sgst})
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => download(`/api/invoices/${lastInvoice.invoice_id}/pdf`, `${lastInvoice.invoice_number}.pdf`)}
              className="secondary-btn !py-1 text-xs"
            >
              <FileDown size={14} /> Download PDF
            </button>
            {lastInvoice.whatsapp_share_url && (
              <a
                href={lastInvoice.whatsapp_share_url}
                target="_blank"
                rel="noreferrer"
                className="secondary-btn !py-1 text-xs !bg-[#21865B]/10 !text-[#21865B] !border-[#21865B]/30"
              >
                <Share2 size={14} /> Share on WhatsApp
              </a>
            )}
            <button
              onClick={() => setLastInvoice(null)}
              className="text-[#657580] hover:text-[#142B3B] text-xs px-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ORDERS LIST & STATUS PIPELINE */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#DFE3E6]">
          {/* Status filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Orders" },
              { id: "submitted", label: "Submitted" },
              { id: "approved", label: "Approved" },
              { id: "invoiced", label: "Invoiced" },
              { id: "dispatched", label: "Dispatched" },
              { id: "returned", label: "Returned" },
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
              placeholder="Search customer, order ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            title="No sales orders found"
            description="No orders match your filter criteria or search query."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer / Retailer</th>
                  <th>Order Items</th>
                  <th>Status</th>
                  <th>Created Date</th>
                  {isAdmin && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const totalItems = order.lines.reduce((acc, l) => acc + l.quantity, 0);
                  const approxTotal = order.lines.reduce(
                    (acc, l) => acc + l.quantity * Number(l.unit_price || 0),
                    0
                  );

                  return (
                    <tr key={order.id} className="hover:bg-[#F5F6F2]/60">
                      <td className="font-mono font-semibold text-[#142B3B]">
                        SO-{String(order.id).padStart(5, "0")}
                      </td>

                      <td>
                        <div className="font-semibold text-[#142B3B]">{order.customer_name}</div>
                        {order.notes && (
                          <div className="text-[11px] text-[#657580] truncate max-w-xs">
                            {order.notes}
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="text-xs">
                          {order.lines.map((l, i) => (
                            <div key={i} className="text-[#202B33]">
                              <strong className="font-mono text-[#087F8C]">{l.quantity}×</strong>{" "}
                              {l.product_name}
                            </div>
                          ))}
                          <div className="text-[10px] text-[#657580] mt-0.5">
                            Total: {totalItems} pkts {approxTotal > 0 && `(₹${approxTotal.toFixed(2)})`}
                          </div>
                        </div>
                      </td>

                      <td>{statusBadge(order.status)}</td>

                      <td className="text-xs text-[#657580]">
                        {new Date(order.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {isAdmin && (
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {order.status === "submitted" && (
                              <>
                                <button
                                  onClick={() => handleAction(order.id, "approve")}
                                  className="secondary-btn !py-1 text-xs !bg-[#21865B]/10 !text-[#21865B] !border-[#21865B]/30 hover:!bg-[#21865B]/20"
                                  title="Approve order after stock check"
                                >
                                  <CheckCircle2 size={12} /> Approve
                                </button>
                                <button
                                  onClick={() => openEdit(order)}
                                  className="secondary-btn !py-1 text-xs"
                                  title="Revise quantities or rates"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleAction(order.id, "reject")}
                                  className="secondary-btn !py-1 text-xs !text-[#D64B4B] hover:!bg-[#D64B4B]/10"
                                  title="Reject order"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {order.status === "approved" && (
                              <button
                                onClick={() => handleAction(order.id, "invoice")}
                                className="secondary-btn !py-1 text-xs !bg-[#087F8C]/10 !text-[#087F8C] !border-[#087F8C]/30 hover:!bg-[#087F8C]/20"
                                title="Generate formal GST Tax Invoice"
                              >
                                <FileText size={12} /> Generate Invoice
                              </button>
                            )}

                            {order.status === "invoiced" && (
                              <button
                                onClick={() => handleAction(order.id, "dispatch")}
                                className="secondary-btn !py-1 text-xs !bg-[#142B3B] !text-white hover:!bg-[#142B3B]/90"
                                title="Confirm warehouse dispatch and deduct stock"
                              >
                                <Truck size={12} /> Mark Dispatched
                              </button>
                            )}

                            {order.status === "dispatched" && (
                              <>
                                <button
                                  onClick={() => handleAction(order.id, "return")}
                                  className="secondary-btn !py-1 text-xs !text-[#F2A541] !border-[#F2A541]/30 hover:!bg-[#F2A541]/10"
                                  title="Process full sales return and restock"
                                >
                                  <RotateCcw size={12} /> Return
                                </button>
                                <button
                                  onClick={() => {
                                    setPaymentModalOrder(order);
                                    setPaymentAmount(String(approxTotal));
                                  }}
                                  className="secondary-btn !py-1 text-xs !bg-[#21865B]/10 !text-[#21865B] !border-[#21865B]/30"
                                  title="Record customer payment collection"
                                >
                                  <DollarSign size={12} /> Collect
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT ORDER MODAL */}
      <Modal
        open={Boolean(editingOrder)}
        onClose={() => setEditingOrder(null)}
        title={`Revise Order SO-${String(editingOrder?.id || 0).padStart(5, "0")}`}
        description="Admin order override: adjust quantities and custom unit prices prior to formal approval."
      >
        <form onSubmit={saveEdit} className="space-y-4">
          <label className="field-label">
            Internal Order Note
            <input
              className="field mt-1"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="e.g. Revised special discount per sales manager"
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#657580]">Line Items</span>
            {editLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  className="field text-xs flex-1"
                  value={line.product_id}
                  onChange={(e) => updateLine(idx, "product_id", e.target.value, true)}
                >
                  {masters?.products?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · ₹{p.price}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="field text-xs w-24"
                  value={line.quantity}
                  onChange={(e) => updateLine(idx, "quantity", e.target.value, true)}
                  placeholder="Qty"
                />
                <input
                  type="number"
                  step="0.01"
                  className="field text-xs w-28"
                  value={line.unit_price || ""}
                  onChange={(e) => updateLine(idx, "unit_price", e.target.value, true)}
                  placeholder="Unit Price ₹"
                />
                <button
                  type="button"
                  disabled={editLines.length === 1}
                  onClick={() => removeLine(idx, true)}
                  className="p-1.5 text-[#657580] hover:text-[#D64B4B]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addLine(true)}
              className="text-xs font-semibold text-[#087F8C] flex items-center gap-1"
            >
              <Plus size={13} /> Add Line
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setEditingOrder(null)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" className="primary-btn">
              <Save size={14} /> Commit Order Revision
            </button>
          </div>
        </form>
      </Modal>

      {/* STOCK SHORTAGE MODAL */}
      <Modal
        open={Boolean(shortageReport)}
        onClose={() => setShortageReport(null)}
        title="Stock Shortage Alert"
        description="The following items have insufficient inventory balance in warehouse storage:"
      >
        <div className="space-y-3">
          <div className="p-3 bg-[#D64B4B]/10 border border-[#D64B4B]/30 rounded text-xs text-[#D64B4B] space-y-1">
            {shortageReport &&
              Object.entries(shortageReport.items).map(([name, deficit]) => (
                <div key={name} className="flex justify-between font-medium">
                  <span>{name}</span>
                  <span>Shortage Deficit: -{deficit} pkts</span>
                </div>
              ))}
          </div>
          <p className="text-xs text-[#657580]">
            Please execute a production batch in the <strong>Production</strong> module to fulfill this shortage before approving the order.
          </p>
          <div className="flex justify-end">
            <button
              onClick={() => setShortageReport(null)}
              className="primary-btn"
            >
              Understood
            </button>
          </div>
        </div>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        open={Boolean(paymentModalOrder)}
        onClose={() => setPaymentModalOrder(null)}
        title={`Record Payment for Order SO-${String(paymentModalOrder?.id || 0).padStart(5, "0")}`}
        description={`Customer: ${paymentModalOrder?.customer_name}`}
      >
        <form onSubmit={submitPayment} className="space-y-4">
          <label className="field-label">
            Payment Amount (₹) *
            <input
              type="number"
              step="0.01"
              required
              className="field mt-1"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="e.g. 5000"
            />
          </label>

          <label className="field-label">
            Reference / Bank UTR / Cheque #
            <input
              className="field mt-1"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="e.g. NEFT/AXIS/987654321"
            />
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE3E6]">
            <button
              type="button"
              onClick={() => setPaymentModalOrder(null)}
              className="secondary-btn"
            >
              Cancel
            </button>
            <button type="submit" disabled={submittingPayment} className="primary-btn">
              Record Collection
            </button>
          </div>
        </form>
      </Modal>

      {/* SALESMAN TERRITORY PERFORMANCE */}
      {role === "salesman" && salesHistory.length > 0 && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#DFE3E6]">
            <div>
              <h3 className="font-semibold text-[#142B3B] text-sm">My Territory Sales History</h3>
              <p className="text-xs text-[#657580]">Direct retail orders generated under your salesman account</p>
            </div>
            <span className="status-badge status-active">Sales Field Rep</span>
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salesHistory.map((row, idx) => (
                  <tr key={idx}>
                    <td className="font-medium text-[#142B3B]">{row.customer}</td>
                    <td>{row.product}</td>
                    <td className="font-mono">{row.quantity}</td>
                    <td className="font-mono">₹{row.unit_price}</td>
                    <td>{statusBadge(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

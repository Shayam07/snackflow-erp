import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileText, Plus, Send, Save, Trash2, Truck, DollarSign, Search, XCircle, RotateCcw } from "lucide-react";
import { api, download } from "../services/api";
import { enqueueOrder, syncQueuedOrders } from "../services/offlineQueue";

type OrderLine = { product_id: string; quantity: string; unit_price?: string };
type OrderRow = {
  id: number; customer_id: number; customer_name: string; status: string;
  created_at: string; lines: { product_id: number; product_name: string; quantity: number; unit_price: string }[];
};

export default function Orders({ role }: { role: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [masters, setMasters] = useState<any>(null);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([{ product_id: "", quantity: "1" }]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLines, setEditLines] = useState<OrderLine[]>([]);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("4000");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function load() {
    const [orderRows, masterData] = await Promise.all([
      api<OrderRow[]>("/api/orders"), api<any>("/api/masters"),
    ]);
    setOrders(orderRows);
    setMasters(masterData);
    if (!customerId && masterData.customers.length) setCustomerId(String(masterData.customers[0].id));
    if (!lines[0].product_id && masterData.products.length) {
      setLines([{ product_id: String(masterData.products[0].id), quantity: "1" }]);
    }
  }

  async function loadSalesHistory() {
    if (role === "salesman") setSalesHistory(await api<any[]>("/api/sales/my-sales"));
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    loadSalesHistory().catch((e: Error) => setError(e.message));
    const handleOnline = async () => {
      try {
        const synced = await syncQueuedOrders();
        if (synced) {
          setMessage(`${synced} offline order(s) synced successfully.`);
          await load();
        }
      } catch (e: any) { setError(e.message); }
    };
    window.addEventListener("online", handleOnline);
    if (navigator.onLine) void handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  function updateLine(index: number, field: keyof OrderLine, value: string, edit = false) {
    const setter = edit ? setEditLines : setLines;
    setter((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }

  function addLine(edit = false) {
    const setter = edit ? setEditLines : setLines;
    setter((current) => [...current, { product_id: String(masters?.products?.[0]?.id || ""), quantity: "1", unit_price: "" }]);
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const payload = {
        customer_id: Number(customerId),
        client_request_id: crypto.randomUUID(),
        lines: lines.map((line) => ({ product_id: Number(line.product_id), quantity: Number(line.quantity) })),
      };
      if (!navigator.onLine) {
        await enqueueOrder(payload);
        setMessage("Offline: order saved on this device and will sync when connection returns.");
      } else {
        try {
          await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
          setMessage("Order submitted successfully.");
        } catch (requestError) {
          if (!(requestError instanceof TypeError)) throw requestError;
          await enqueueOrder(payload);
          setMessage("Connection lost: order saved locally and will sync when the API is reachable.");
        }
      }
      setLines([{ product_id: String(masters.products[0].id), quantity: "1" }]);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  function beginEdit(order: OrderRow) {
    setEditingId(order.id);
    setEditLines(order.lines.map((line) => ({
      product_id: String(line.product_id), quantity: String(line.quantity), unit_price: line.unit_price,
    })));
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    try {
      await api(`/api/orders/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          lines: editLines.map((line) => ({
            product_id: Number(line.product_id), quantity: Number(line.quantity),
            unit_price: line.unit_price === "" ? null : line.unit_price,
          })),
        }),
      });
      setEditingId(null); setMessage("Order changes saved and audit logged."); await load();
    } catch (e: any) { setError(e.message); }
  }

  async function action(id: number, actionName: string) {
    if (actionName === "return" && !window.confirm(
      "Return the entire order? Goods are restocked and a credit note is raised for the invoice."
    )) return;
    setError(""); setMessage("");
    try {
      const result = await api<any>(`/api/orders/${id}/${actionName}`, { method: "POST" });
      if (actionName === "invoice" && result.invoice_id) setLastInvoice(result);
      if (result.shortage) setMessage(`Insufficient stock: ${JSON.stringify(result.shortage)}`);
      else if (actionName === "return") setMessage(`Order returned. Credit note ${result.credit_note} for ₹${result.amount}.`);
      else setMessage(actionName === "approve" && !result.approved ? "Approval was not completed." : `Order ${actionName} successful.`);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function receivePayment(event: FormEvent) {
    event.preventDefault();
    if (!lastInvoice) return;
    try {
      const result = await api<any>("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          customer_id: lastInvoice.customer_id, invoice_id: lastInvoice.invoice_id,
          amount: paymentAmount, reference: "UI-PAYMENT",
        }),
      });
      setMessage(`Payment recorded. Outstanding balance: ₹${result.outstanding}`);
      setPaymentAmount("0");
    } catch (e: any) { setError(e.message); }
  }

  // Calculate live preview totals for order form
  const totalUnits = lines.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
  const estimatedAmount = lines.reduce((acc, curr) => {
    const prod = masters?.products?.find((p: any) => String(p.id) === curr.product_id);
    const price = Number(prod?.price || 0);
    return acc + ((Number(curr.quantity) || 0) * price);
  }, 0);

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    const matchesSearch = !search ||
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      `so-${o.id}`.includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const lineEditor = (values: OrderLine[], edit = false) => (
    <div className="space-y-3">
      {values.map((line, index) => {
        const prod = masters?.products?.find((p: any) => String(p.id) === line.product_id);
        const lineTotal = (Number(line.quantity) || 0) * (edit && line.unit_price ? Number(line.unit_price) : Number(prod?.price || 0));

        return (
          <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_110px_130px_100px_38px] p-2.5 rounded-xl bg-slate-900/50 border border-slate-800" key={`${edit ? "edit" : "new"}-${index}`}>
            <label className="field-label">Product
              <select className="field" value={line.product_id} onChange={(e) => updateLine(index, "product_id", e.target.value, edit)}>
                {masters?.products?.map((product: any) => (
                  <option value={product.id} key={product.id}>
                    {product.name} · ₹{product.price}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">Quantity
              <input className="field" type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value, edit)} />
            </label>
            {edit && (
              <label className="field-label">Unit price (₹)
                <input className="field" type="number" min="0" step="0.01" value={line.unit_price || ""} onChange={(e) => updateLine(index, "unit_price", e.target.value, true)} />
              </label>
            )}
            <div className="pb-2">
              <span className="text-[10px] uppercase font-semibold text-slate-500 block">Est. Total</span>
              <span className="text-xs font-semibold text-emerald-400">₹{lineTotal.toFixed(2)}</span>
            </div>
            <button type="button" className="small-btn h-10 hover:!border-rose-500/40 hover:!text-rose-400" title="Remove line" disabled={values.length === 1}
              onClick={() => (edit ? setEditLines : setLines)((current) => current.filter((_, i) => i !== index))}>
              <Trash2 size={14}/>
            </button>
          </div>
        );
      })}
      <button type="button" className="small-btn" onClick={() => addLine(edit)}>
        <Plus size={13}/> Add Product Line
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow flex items-center gap-1.5">SALES WORKSPACE</div>
          <h1>Sales Orders & Invoicing</h1>
          <p className="muted">Capture multi-product retail orders, execute shortage checks, issue GST invoices and record payments.</p>
        </div>
      </div>

      {message && <div className="notice"><CheckCircle2 size={16} /> {message}</div>}
      {error && <div className="error-box">{error}</div>}

      {["salesman", "admin"].includes(role) && (
        <form onSubmit={submitOrder} className="panel">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-emerald-400" />
              <h2>New Sales Order</h2>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">Units: <strong className="text-slate-200">{totalUnits}</strong> pkts</span>
              <span className="text-slate-400">Estimated Total: <strong className="text-emerald-400">₹{estimatedAmount.toFixed(2)}</strong></span>
            </div>
          </div>

          <div className="mt-4">
            <label className="field-label">Customer / Retailer
              <select className="field max-w-md" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                {masters?.customers?.map((customer: any) => (
                  <option value={customer.id} key={customer.id}>
                    {customer.name} · {customer.state} ({customer.customer_type})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">{lineEditor(lines)}</div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-4">
            <div className="text-xs text-slate-400">
              * Supports IndexedDB offline queue. Orders submitted offline auto-sync upon reconnection.
            </div>
            <button className="primary-btn">
              <Send size={15}/> Submit Sales Order
            </button>
          </div>
        </form>
      )}

      {lastInvoice && (
        <section className="panel bg-gradient-to-br from-slate-900 to-slate-900/80 border-emerald-500/30">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <div className="eyebrow text-emerald-400">INVOICE GENERATED</div>
              <h2 className="text-lg">Invoice {lastInvoice.invoice_number}</h2>
              <p className="muted mt-0.5 text-xs">
                Taxable: ₹{Number(lastInvoice.taxable).toFixed(2)} · CGST: ₹{Number(lastInvoice.cgst).toFixed(2)} · SGST: ₹{Number(lastInvoice.sgst).toFixed(2)} · Total: <span className="text-emerald-400 font-semibold">₹{Number(lastInvoice.total).toFixed(2)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="small-btn bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" onClick={() => download(`/api/invoices/${lastInvoice.invoice_id}/pdf`, `${lastInvoice.invoice_number}.pdf`)}>
                <FileText size={13}/> Download Official PDF
              </button>
              <button className="small-btn bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20" onClick={() => window.open(lastInvoice.whatsapp_share_url, "_blank", "noopener,noreferrer")}>
                <Send size={13}/> WhatsApp Share
              </button>
            </div>
          </div>

          <form onSubmit={receivePayment} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="field-label">Collect Payment on Invoice (₹)
              <input className="field" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
            </label>
            <button className="primary-btn">
              <DollarSign size={14}/> Record Payment
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h2>Order Register</h2>
            <span className="tag tag-green">{filteredOrders.length} orders</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field !mt-0 !py-1.5 !pl-8 !pr-2 text-xs w-40"
              />
            </div>
            <div className="flex gap-1">
              {["all", "submitted", "approved", "invoiced", "dispatched", "returned"].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`tab-btn !py-1 !px-2.5 text-xs capitalize ${statusFilter === status ? "selected" : ""}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Lines & Quantities</th>
                <th>Created</th>
                <th>Workflow Status</th>
                {role === "admin" && <th>Approval Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                let statusBadge = "tag";
                if (order.status === "dispatched") statusBadge = "tag tag-green";
                else if (order.status === "invoiced") statusBadge = "tag tag-blue";
                else if (order.status === "approved") statusBadge = "tag tag-purple";
                else if (order.status === "submitted") statusBadge = "tag tag-amber";
                else if (order.status === "returned") statusBadge = "tag tag-red";
                else if (order.status === "cancelled" || order.status === "rejected") statusBadge = "tag";

                return (
                  <tr key={order.id}>
                    <td className="font-semibold text-slate-100">SO-{String(order.id).padStart(5, "0")}</td>
                    <td className="font-medium">{order.customer_name}</td>
                    <td>{order.lines.map((line) => `${line.product_name} × ${line.quantity} @ ₹${line.unit_price}`).join("; ")}</td>
                    <td className="muted text-xs">{new Date(order.created_at).toLocaleString()}</td>
                    <td><span className={statusBadge}>{order.status}</span></td>
                    {role === "admin" && (
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {order.status === "submitted" && (
                            <>
                              <button className="small-btn" onClick={() => beginEdit(order)} title="Edit lines and prices before approval">
                                <Save size={12}/> Edit
                              </button>
                              <button className="small-btn bg-emerald-500/10 text-emerald-400 border-emerald-500/30" onClick={() => action(order.id, "approve")} title="Perform stock check and approve">
                                <CheckCircle2 size={12}/> Approve
                              </button>
                              <button className="small-btn danger" onClick={() => action(order.id, "reject")} title="Reject this order">
                                <XCircle size={12}/> Reject
                              </button>
                            </>
                          )}
                          {order.status === "approved" && (
                            <button className="small-btn danger" onClick={() => action(order.id, "cancel")} title="Cancel before invoicing">
                              <XCircle size={12}/> Cancel
                            </button>
                          )}
                          {order.status === "approved" && (
                            <button className="small-btn bg-blue-500/10 text-blue-400 border-blue-500/30" onClick={() => action(order.id, "invoice")}>
                              <FileText size={12}/> Generate Invoice
                            </button>
                          )}
                          {order.status === "invoiced" && (
                            <button className="small-btn bg-purple-500/10 text-purple-400 border-purple-500/30" onClick={() => action(order.id, "dispatch")}>
                              <Truck size={12}/> Post Dispatch
                            </button>
                          )}
                          {order.status === "dispatched" && (
                            <button className="small-btn bg-rose-500/10 text-rose-400 border-rose-500/30" onClick={() => action(order.id, "return")} title="Restock goods and raise a credit note">
                              <RotateCcw size={12}/> Return
                            </button>
                          )}
                          {["returned", "cancelled", "rejected"].includes(order.status) && (
                            <span className="text-[11px] text-slate-500 italic">{order.status}</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredOrders.length && (
            <div className="empty-state">No orders match the selected filter.</div>
          )}
        </div>
      </section>

      {editingId !== null && (
        <section className="panel border-amber-500/30 bg-amber-950/10">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <div className="eyebrow text-amber-400">ADMIN ORDER REVISION</div>
              <h2>Edit Order SO-{String(editingId).padStart(5, "0")}</h2>
            </div>
            <button className="small-btn" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
          <p className="muted mt-2 text-xs">
            Admin can override quantities, unit prices, or product lines before formal approval. Every edit produces an immutable Audit Log entry.
          </p>
          <form onSubmit={saveEdit} className="mt-4">
            {lineEditor(editLines, true)}
            <button className="primary-btn mt-4">
              <Save size={14}/> Save & Commit Order Revision
            </button>
          </form>
        </section>
      )}

      {role === "salesman" && (
        <section className="panel">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2>My Sales Territory History</h2>
              <p className="muted text-xs">Direct sales performance for your assigned retail accounts</p>
            </div>
            <span className="tag tag-green">Assigned orders only</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Unit price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salesHistory.map((row, index) => (
                  <tr key={index}>
                    <td className="font-semibold">{row.customer}</td>
                    <td>{row.product}</td>
                    <td className="tabular-nums">{row.quantity}</td>
                    <td className="tabular-nums">₹{row.unit_price}</td>
                    <td><span className="tag">{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!salesHistory.length && <div className="empty-state">No past customer sales found for this account.</div>}
          </div>
        </section>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileText, Plus, Send, Save, Trash2, Truck } from "lucide-react";
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

  async function load() {
    const [orderRows, masterData] = await Promise.all([
      api<OrderRow[]>("/api/orders"), api("/api/masters"),
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
    try {
      const result = await api<any>(`/api/orders/${id}/${actionName}`, { method: "POST" });
      if (actionName === "invoice" && result.invoice_id) setLastInvoice(result);
      if (result.shortage) setMessage(`Insufficient stock: ${JSON.stringify(result.shortage)}`);
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
      setMessage(`Payment recorded. Outstanding: ₹${result.outstanding}`);
      setPaymentAmount("0");
    } catch (e: any) { setError(e.message); }
  }

  const lineEditor = (values: OrderLine[], edit = false) => (
    <div className="space-y-3">
      {values.map((line, index) => (
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_110px_130px_38px]" key={`${edit ? "edit" : "new"}-${index}`}>
          <label className="field-label">Product
            <select className="field" value={line.product_id} onChange={(e) => updateLine(index, "product_id", e.target.value, edit)}>
              {masters?.products?.map((product: any) => <option value={product.id} key={product.id}>{product.name} · ₹{product.price}</option>)}
            </select>
          </label>
          <label className="field-label">Quantity
            <input className="field" type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value, edit)} />
          </label>
          {edit && <label className="field-label">Unit price (₹)
            <input className="field" type="number" min="0" step="0.01" value={line.unit_price || ""} onChange={(e) => updateLine(index, "unit_price", e.target.value, true)} />
          </label>}
          <button type="button" className="small-btn h-10" title="Remove line" disabled={values.length === 1}
            onClick={() => (edit ? setEditLines : setLines)((current) => current.filter((_, i) => i !== index))}>
            <Trash2 size={14}/>
          </button>
        </div>
      ))}
      <button type="button" className="small-btn" onClick={() => addLine(edit)}><Plus size={13}/> Add product line</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div><div className="eyebrow">SALES WORKSPACE</div><h1>Orders</h1>
          <p className="muted">Capture multi-product orders and manage verification, invoicing and dispatch.</p>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      {error && <div className="error-box">{error}</div>}

      {["salesman", "admin"].includes(role) && (
        <form onSubmit={submitOrder} className="panel">
          <div className="flex items-center gap-2"><Plus size={18}/><h2>New sales order</h2></div>
          <div className="mt-4">
            <label className="field-label">Customer
              <select className="field max-w-lg" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                {masters?.customers?.map((customer: any) => <option value={customer.id} key={customer.id}>{customer.name} · {customer.state}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4">{lineEditor(lines)}</div>
          <button className="primary-btn mt-4"><Send size={15}/> Submit order</button>
        </form>
      )}

      {lastInvoice && (
        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2>Invoice {lastInvoice.invoice_number}</h2>
              <p className="muted mt-1 text-xs">Taxable ₹{lastInvoice.taxable} · Total ₹{lastInvoice.total}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="small-btn" onClick={() => download(`/api/invoices/${lastInvoice.invoice_id}/pdf`, `${lastInvoice.invoice_number}.pdf`)}><FileText size={13}/> Download PDF</button>
              <button className="small-btn" onClick={() => window.open(lastInvoice.whatsapp_share_url, "_blank", "noopener,noreferrer")}><Send size={13}/> WhatsApp share</button>
            </div>
          </div>
          <form onSubmit={receivePayment} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="field-label">Record payment (₹)<input className="field" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}/></label>
            <button className="primary-btn"><CheckCircle2 size={14}/> Record payment</button>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="flex items-center justify-between"><h2>Order register</h2><span className="tag">{orders.length} orders</span></div>
        <div className="mt-4 overflow-x-auto">
          <table><thead><tr><th>Order</th><th>Customer</th><th>Lines</th><th>Created</th><th>Status</th>{role === "admin" && <th>Actions</th>}</tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-semibold">SO-{String(order.id).padStart(5, "0")}</td>
                  <td>{order.customer_name}</td>
                  <td>{order.lines.map((line) => `${line.product_name} × ${line.quantity} @ ₹${line.unit_price}`).join("; ")}</td>
                  <td className="muted">{new Date(order.created_at).toLocaleString()}</td>
                  <td><span className={`tag ${order.status === "dispatched" ? "tag-green" : ""}`}>{order.status}</span></td>
                  {role === "admin" && <td><div className="flex flex-wrap gap-2">
                    {order.status === "submitted" && <><button className="small-btn" onClick={() => beginEdit(order)}><Save size={13}/> Edit</button><button className="small-btn" onClick={() => action(order.id, "approve")}><CheckCircle2 size={13}/> Approve</button></>}
                    {order.status === "approved" && <button className="small-btn" onClick={() => action(order.id, "invoice")}><FileText size={13}/> Invoice</button>}
                    {order.status === "invoiced" && <button className="small-btn" onClick={() => action(order.id, "dispatch")}><Truck size={13}/> Dispatch</button>}
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && <div className="empty-state">No orders yet. Create the first order above.</div>}
        </div>
      </section>

      {editingId !== null && (
        <section className="panel">
          <div className="flex items-center justify-between"><h2>Edit order SO-{String(editingId).padStart(5, "0")}</h2><button className="small-btn" onClick={() => setEditingId(null)}>Cancel</button></div>
          <p className="muted mt-1 text-xs">Admin can change quantities, prices and product lines before approval. Changes are audit logged.</p>
          <form onSubmit={saveEdit} className="mt-4">{lineEditor(editLines, true)}<button className="primary-btn mt-4"><Save size={14}/> Save verified order</button></form>
        </section>
      )}

      {role === "salesman" && (
        <section className="panel">
          <div className="flex items-center justify-between"><h2>My customer sales</h2><span className="tag">Assigned orders only</span></div>
          <div className="mt-4 overflow-x-auto"><table><thead><tr><th>Customer</th><th>Product</th><th>Quantity</th><th>Unit price</th><th>Status</th></tr></thead>
            <tbody>{salesHistory.map((row, index) => <tr key={index}><td>{row.customer}</td><td>{row.product}</td><td>{row.quantity}</td><td>₹{row.unit_price}</td><td><span className="tag">{row.status}</span></td></tr>)}</tbody>
          </table>{!salesHistory.length && <div className="empty-state">Your sales history will appear here.</div>}</div>
        </section>
      )}
    </div>
  );
}

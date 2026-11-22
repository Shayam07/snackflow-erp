import { useEffect, useMemo, useState } from "react";
import { Banknote, Plus, RefreshCw } from "lucide-react";
import { api, money, type Paged } from "../services/api";
import { EmptyState, Field, Modal, PageHeader, TableSkeleton } from "../components/ui";
import { useToast } from "../components/Toast";

type Payable = {
  supplier_id: number; supplier: string; state: string; bills: number;
  billed: string; paid: string; outstanding: string;
};
type Purchase = {
  id: number; document_no: string; supplier_id: number; supplier: string;
  purchased_at: string; total: string;
};
type SupplierPayment = {
  id: number; supplier: string; purchase_id: number | null; amount: string;
  method: string; reference: string | null; paid_at: string;
};

export default function Payables({ role }: { role: string }) {
  const toast = useToast();
  const [payables, setPayables] = useState<Payable[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "", purchase_id: "", amount: "", method: "bank", reference: "",
  });

  const isAdmin = role === "admin";

  async function load() {
    setLoading(true);
    try {
      const [summary, billPage, paymentPage] = await Promise.all([
        api<Payable[]>("/api/payables"),
        api<Paged<Purchase>>("/api/purchases?limit=50"),
        api<Paged<SupplierPayment>>("/api/supplier-payments?limit=15"),
      ]);
      setPayables(summary);
      setPurchases(billPage.items);
      setPayments(paymentPage.items);
      if (!form.supplier_id && summary.length) {
        setForm((current) => ({ ...current, supplier_id: String(summary[0].supplier_id) }));
      }
      setError("");
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => payables.reduce((acc, row) => ({
    billed: acc.billed + Number(row.billed),
    paid: acc.paid + Number(row.paid),
    outstanding: acc.outstanding + Number(row.outstanding),
  }), { billed: 0, paid: 0, outstanding: 0 }), [payables]);

  const supplierBills = purchases.filter((bill) =>
    String(bill.supplier_id) === form.supplier_id);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/supplier-payments", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(form.supplier_id),
          purchase_id: form.purchase_id ? Number(form.purchase_id) : null,
          amount: form.amount,
          method: form.method,
          reference: form.reference || null,
        }),
      });
      toast.success("Supplier payment recorded");
      setOpen(false);
      setForm((current) => ({ ...current, amount: "", purchase_id: "", reference: "" }));
      await load();
    } catch (exception: any) {
      toast.error(exception.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ACCOUNTS PAYABLE"
        title="Supplier Bills & Payments"
        description="Track what the factory owes each supplier and record payments against specific bills."
        actions={
          <>
            <button className="secondary-btn" onClick={() => void load()}>
              <RefreshCw size={15} /> Refresh
            </button>
            {isAdmin && (
              <button className="primary-btn" onClick={() => setOpen(true)}>
                <Plus size={15} /> Record payment
              </button>
            )}
          </>
        }
      />

      {error && <div className="error-box">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total billed", value: totals.billed, hint: "Purchase receipts posted" },
          { label: "Total paid", value: totals.paid, hint: "Supplier payments recorded" },
          { label: "Outstanding", value: totals.outstanding, hint: "Still owed to suppliers", accent: totals.outstanding > 0 },
        ].map((card) => (
          <div className="panel !p-4" key={card.label}>
            <div className="muted text-[11px] font-semibold uppercase tracking-wider">{card.label}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${card.accent ? "text-amber-400" : "text-slate-100"}`}>
              {money(card.value)}
            </div>
            <div className="muted mt-0.5 text-[11px]">{card.hint}</div>
          </div>
        ))}
      </div>

      <section className="panel">
        <h2>Supplier Position</h2>
        <p className="muted text-xs">Billed versus paid, derived from purchase receipts and payments.</p>
        <div className="mt-4">
          {loading && <TableSkeleton rows={4} columns={5} />}
          {!loading && payables.length === 0 && (
            <EmptyState title="No suppliers yet" description="Add suppliers under Masters to start recording bills." />
          )}
          {!loading && payables.length > 0 && (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>State</th>
                    <th>Bills</th>
                    <th>Billed</th>
                    <th>Paid</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map((row) => (
                    <tr key={row.supplier_id}>
                      <td className="font-semibold text-slate-100">{row.supplier}</td>
                      <td className="muted text-xs">{row.state}</td>
                      <td className="tabular-nums">{row.bills}</td>
                      <td className="tabular-nums">{money(row.billed)}</td>
                      <td className="tabular-nums">{money(row.paid)}</td>
                      <td className={`tabular-nums font-semibold ${Number(row.outstanding) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {money(row.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Banknote size={17} className="text-emerald-400" />
          <h2>Recent Supplier Payments</h2>
        </div>
        <div className="mt-4">
          {payments.length === 0 ? (
            <EmptyState title="No supplier payments yet"
              description="Record a payment against a purchase bill to build the payable history." />
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr><th>Paid</th><th>Supplier</th><th>Bill</th><th>Method</th><th>Reference</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="muted text-xs">{new Date(payment.paid_at).toLocaleString()}</td>
                      <td className="font-medium">{payment.supplier}</td>
                      <td className="muted text-xs">{payment.purchase_id ? `#${payment.purchase_id}` : "On account"}</td>
                      <td><span className="tag">{payment.method}</span></td>
                      <td className="muted text-xs">{payment.reference || "—"}</td>
                      <td className="tabular-nums font-semibold text-slate-100">{money(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <Modal open={open} title="Record supplier payment" subtitle="Payments cannot exceed the selected bill's outstanding."
        onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Supplier">
            <select className="field" value={form.supplier_id} required
              onChange={(event) => setForm({ ...form, supplier_id: event.target.value, purchase_id: "" })}>
              <option value="">Select supplier…</option>
              {payables.map((row) => (
                <option key={row.supplier_id} value={row.supplier_id}>
                  {row.supplier} — {money(row.outstanding)} due
                </option>
              ))}
            </select>
          </Field>
          <Field label="Against bill" hint="Leave blank for an on-account payment">
            <select className="field" value={form.purchase_id}
              onChange={(event) => {
                const bill = supplierBills.find((row) => String(row.id) === event.target.value);
                setForm({
                  ...form,
                  purchase_id: event.target.value,
                  amount: bill ? bill.total : form.amount,
                });
              }}>
              <option value="">On account</option>
              {supplierBills.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.document_no} · {money(bill.total)} · {new Date(bill.purchased_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)">
              <input className="field" type="number" min="0.01" step="0.01" required
                value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </Field>
            <Field label="Method">
              <select className="field" value={form.method}
                onChange={(event) => setForm({ ...form, method: event.target.value })}>
                <option value="bank">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </Field>
          </div>
          <Field label="Reference">
            <input className="field" value={form.reference}
              onChange={(event) => setForm({ ...form, reference: event.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" className="secondary-btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary-btn" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

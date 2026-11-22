import { useEffect, useMemo, useState } from "react";
import {
  Boxes, Building2, Package, Plus, RefreshCw, Trash2, Truck, Users, Pencil, BookOpen,
} from "lucide-react";
import { api } from "../services/api";
import { EmptyState, Field, Modal, PageHeader, TableSkeleton } from "../components/ui";
import { useToast } from "../components/Toast";

type Item = {
  id: number; name: string; type: string; unit: string; hsn_code: string;
  active: boolean; reorder_level: string; conversion_factor: string;
  balance: string; average_cost: string;
};
type Product = {
  id: number; item_id: number; name: string; family: string;
  pack_size_g: number; price: string; gst_rate: string;
};
type Customer = {
  id: number; name: string; state: string; type: string;
  gstin?: string | null; salesman_id?: number | null;
};
type Supplier = { id: number; name: string; state: string };
type Recipe = {
  id: number; family: string; product_id: number; version: number;
  expected_packets: number; tolerance_percent: string;
  items: { item_id: number; name: string; unit: string; planned_quantity: string }[];
};
type Member = { id: number; username: string; role: string; is_active: boolean };
type Masters = {
  items: Item[]; products: Product[]; customers: Customer[]; suppliers: Supplier[];
  recipes: Recipe[]; users: Member[]; roles: { name: string; description: string }[];
};

type Tab = "customers" | "suppliers" | "items" | "products" | "recipes" | "users";

const TABS: { key: Tab; label: string; icon: typeof Boxes; adminOnly?: boolean }[] = [
  { key: "customers", label: "Customers", icon: Building2 },
  { key: "suppliers", label: "Suppliers", icon: Truck },
  { key: "items", label: "Inventory Items", icon: Boxes },
  { key: "products", label: "Products", icon: Package },
  { key: "recipes", label: "BOM Recipes", icon: BookOpen, adminOnly: true },
  { key: "users", label: "Users & Roles", icon: Users, adminOnly: true },
];

const empty = {
  customer: { name: "", customer_type: "retailer", state: "Tamil Nadu", gstin: "", salesman_id: "" },
  supplier: { name: "", state: "Tamil Nadu" },
  item: {
    name: "", item_type: "raw", base_unit: "g", hsn_code: "2106",
    reorder_level: "0", conversion_factor: "1", opening_quantity: "", opening_unit_cost: "",
  },
  product: { item_id: "", family: "", pack_size_g: "", selling_price: "", gst_rate: "5" },
  user: { username: "", password: "", role: "salesman", is_active: true },
};

export default function Masters({ role }: { role: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("customers");
  const [data, setData] = useState<Masters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const isAdmin = role === "admin";

  async function load() {
    setLoading(true);
    try {
      setData(await api<Masters>("/api/masters"));
      setError("");
    } catch (exception: any) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visibleTabs = TABS.filter((entry) => !entry.adminOnly || isAdmin);

  async function remove(path: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      await api(path, { method: "DELETE" });
      toast.success(`${label} deleted`);
      await load();
    } catch (exception: any) {
      toast.error(exception.message);
    }
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
  }

  function openEdit(row: any) {
    setCreating(false);
    setEditing(row);
  }

  function close() {
    setCreating(false);
    setEditing(null);
  }

  const modalTitle = creating ? `New ${labelFor(tab)}` : `Edit ${labelFor(tab)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MASTER DATA"
        title="Masters & Configuration"
        description="Maintain the customers, suppliers, items, recipes and users that every transaction depends on."
        actions={
          <>
            <button className="secondary-btn" onClick={() => void load()}>
              <RefreshCw size={15} /> Refresh
            </button>
            {isAdmin && tab !== "recipes" && (
              <button className="primary-btn" onClick={openCreate}>
                <Plus size={15} /> Add {labelFor(tab)}
              </button>
            )}
          </>
        }
      />

      {error && <div className="error-box">{error}</div>}

      <div className="tab-bar">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? "selected" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <section className="panel">
        {loading && <TableSkeleton rows={6} columns={5} />}
        {!loading && data && (
          <>
            {tab === "customers" && (
              <DataTable
                head={["Customer", "Type", "State", "GSTIN", "Assigned to", ""]}
                rows={data.customers.map((row) => [
                  <span className="font-semibold text-slate-100">{row.name}</span>,
                  <span className="tag">{row.type}</span>,
                  row.state,
                  <span className="muted text-xs">{row.gstin || "Unregistered"}</span>,
                  <span className="muted text-xs">
                    {data.users.find((user) => user.id === row.salesman_id)?.username || "—"}
                  </span>,
                  isAdmin ? (
                    <div className="flex gap-1.5">
                      <button className="small-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>
                      <button className="small-btn danger" onClick={() => void remove(`/api/customers/${row.id}`, row.name)}><Trash2 size={12} /></button>
                    </div>
                  ) : null,
                ])}
                empty="No customers yet. Add your first retailer to start taking orders."
              />
            )}

            {tab === "suppliers" && (
              <DataTable
                head={["Supplier", "State", ""]}
                rows={data.suppliers.map((row) => [
                  <span className="font-semibold text-slate-100">{row.name}</span>,
                  row.state,
                  isAdmin ? (
                    <div className="flex gap-1.5">
                      <button className="small-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>
                      <button className="small-btn danger" onClick={() => void remove(`/api/suppliers/${row.id}`, row.name)}><Trash2 size={12} /></button>
                    </div>
                  ) : null,
                ])}
                empty="No suppliers yet."
              />
            )}

            {tab === "items" && (
              <DataTable
                head={["Item", "Type", "Base unit", "On hand", "Moving avg", "Reorder at", ""]}
                rows={data.items.map((row) => [
                  <span className="font-semibold text-slate-100">
                    {row.name} {!row.active && <span className="tag tag-amber ml-1">inactive</span>}
                  </span>,
                  <span className={`tag ${row.type === "finished" ? "tag-green" : row.type === "packaging" ? "tag-blue" : "tag-amber"}`}>{row.type}</span>,
                  row.unit,
                  <span className="tabular-nums">{row.balance}</span>,
                  <span className="tabular-nums muted text-xs">₹{Number(row.average_cost).toFixed(4)}</span>,
                  <span className="tabular-nums muted text-xs">{row.reorder_level}</span>,
                  isAdmin ? (
                    <div className="flex gap-1.5">
                      <button className="small-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>
                      <button className="small-btn danger" onClick={() => void remove(`/api/items/${row.id}`, row.name)}><Trash2 size={12} /></button>
                    </div>
                  ) : null,
                ])}
                empty="No inventory items yet."
              />
            )}

            {tab === "products" && (
              <DataTable
                head={["Product", "Family", "Pack size", "Selling price", "GST", ""]}
                rows={data.products.map((row) => [
                  <span className="font-semibold text-slate-100">{row.name}</span>,
                  row.family,
                  `${row.pack_size_g} g`,
                  <span className="tabular-nums">₹{Number(row.price).toFixed(2)}</span>,
                  `${Number(row.gst_rate)}%`,
                  isAdmin ? (
                    <div className="flex gap-1.5">
                      <button className="small-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>
                      <button className="small-btn danger" onClick={() => void remove(`/api/products/${row.id}`, row.name)}><Trash2 size={12} /></button>
                    </div>
                  ) : null,
                ])}
                empty="No sellable products yet. Create a finished item first."
              />
            )}

            {tab === "recipes" && (
              <DataTable
                head={["Family", "Expected output", "Tolerance", "Components", ""]}
                rows={data.recipes.map((row) => [
                  <span className="font-semibold text-slate-100">{row.family} v{row.version}</span>,
                  `${row.expected_packets} packets`,
                  `±${Number(row.tolerance_percent)}%`,
                  <span className="muted text-xs">
                    {row.items.map((line) => `${line.name} ${line.planned_quantity}${line.unit}`).join(" · ")}
                  </span>,
                  <div className="flex gap-1.5">
                    <button className="small-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>
                    <button className="small-btn" onClick={() => { setTab("products"); openCreate(); }}>
                      <Plus size={12} /> New
                    </button>
                  </div>,
                ])}
                empty="No active BOM recipes."
              />
            )}

            {tab === "users" && data.users.length > 0 && (
              <DataTable
                head={["Username", "Role", "Status", ""]}
                rows={data.users.map((row) => [
                  <span className="font-semibold text-slate-100">{row.username}</span>,
                  <span className="tag tag-purple">{row.role}</span>,
                  <span className={row.is_active ? "tag tag-green" : "tag tag-amber"}>
                    {row.is_active ? "active" : "disabled"}
                  </span>,
                  <button className="small-btn" onClick={() => openEdit(row)}><Pencil size={12} /> Edit</button>,
                ])}
                empty="No users."
              />
            )}
            {tab === "users" && data.users.length === 0 && (
              <EmptyState
                icon={<Users size={20} />}
                title="User directory is admin-only"
                description="Sign in as an administrator to manage factory users and roles."
              />
            )}
          </>
        )}
      </section>

      <Modal open={creating || editing !== null} title={modalTitle} onClose={close} wide={tab === "recipes"}>
        {data && (creating || editing) && (
          <MasterForm
            tab={tab}
            data={data}
            editing={editing}
            onCancel={close}
            onSaved={async (message) => {
              toast.success(message);
              close();
              await load();
            }}
            onError={(message) => toast.error(message)}
          />
        )}
      </Modal>
    </div>
  );
}

function labelFor(tab: Tab) {
  switch (tab) {
    case "customers": return "Customer";
    case "suppliers": return "Supplier";
    case "items": return "Item";
    case "products": return "Product";
    case "recipes": return "Recipe";
    case "users": return "User";
  }
}

function DataTable({ head, rows, empty }: { head: string[]; rows: (React.ReactNode | null)[][]; empty: string }) {
  if (!rows.length) {
    return <EmptyState title={empty} description="Use the add button above to create the first record." />;
  }
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>{head.map((label, index) => <th key={`${label}-${index}`}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MasterForm({ tab, data, editing, onCancel, onSaved, onError }: {
  tab: Tab;
  data: Masters;
  editing: any | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState(() => editing ? {
    name: editing.name, customer_type: editing.type, state: editing.state,
    gstin: editing.gstin || "", salesman_id: editing.salesman_id ? String(editing.salesman_id) : "",
  } : empty.customer);
  const [supplier, setSupplier] = useState(() => editing ? { name: editing.name, state: editing.state } : empty.supplier);
  const [item, setItem] = useState(() => editing ? {
    name: editing.name, item_type: editing.type, base_unit: editing.unit, hsn_code: editing.hsn_code,
    reorder_level: editing.reorder_level, conversion_factor: editing.conversion_factor,
    opening_quantity: "", opening_unit_cost: "",
  } : empty.item);
  const [product, setProduct] = useState(() => editing ? {
    item_id: String(editing.item_id), family: editing.family,
    pack_size_g: String(editing.pack_size_g), selling_price: editing.price, gst_rate: editing.gst_rate,
  } : empty.product);
  const [user, setUser] = useState(() => editing ? {
    username: editing.username, password: "", role: editing.role, is_active: editing.is_active,
  } : empty.user);

  const finishedItems = useMemo(() => data.items.filter((row) => row.type === "finished"), [data.items]);
  const [recipeLine, setRecipeLine] = useState(() => editing ? {
    product_id: String(editing.product_id), family: editing.family,
    expected_packets: String(editing.expected_packets),
    tolerance_percent: String(Number(editing.tolerance_percent)),
    components: editing.items.map((line: any) => ({ item_id: String(line.item_id), quantity: line.planned_quantity })),
  } : { product_id: String(finishedItems[0]?.id || ""), family: "", expected_packets: "200", tolerance_percent: "3", components: [{ item_id: "", quantity: "" }] });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (tab === "customers") {
        const body = {
          name: customer.name, customer_type: customer.customer_type, state: customer.state,
          gstin: customer.gstin || null,
          salesman_id: customer.salesman_id ? Number(customer.salesman_id) : null,
        };
        await api(editing ? `/api/customers/${editing.id}` : "/api/customers",
          { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      } else if (tab === "suppliers") {
        await api(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers",
          { method: editing ? "PUT" : "POST", body: JSON.stringify(supplier) });
      } else if (tab === "items") {
        const body = editing ? {
          name: item.name, hsn_code: item.hsn_code, reorder_level: item.reorder_level,
          conversion_factor: item.conversion_factor, active: editing.active,
        } : {
          name: item.name, item_type: item.item_type, base_unit: item.base_unit,
          hsn_code: item.hsn_code, reorder_level: item.reorder_level,
          conversion_factor: item.conversion_factor,
          opening_quantity: item.opening_quantity || null,
          opening_unit_cost: item.opening_unit_cost || null,
        };
        await api(editing ? `/api/items/${editing.id}` : "/api/items",
          { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      } else if (tab === "products") {
        const body = editing ? {
          family: product.family, pack_size_g: Number(product.pack_size_g),
          selling_price: product.selling_price, gst_rate: product.gst_rate,
        } : {
          item_id: Number(product.item_id), family: product.family,
          pack_size_g: Number(product.pack_size_g), selling_price: product.selling_price,
          gst_rate: product.gst_rate,
        };
        await api(editing ? `/api/products/${editing.id}` : "/api/products",
          { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      } else if (tab === "recipes") {
        const components = recipeLine.components
          .filter((line: any) => line.item_id && Number(line.quantity) > 0)
          .map((line: any) => ({ item_id: Number(line.item_id), quantity: line.quantity }));
        const body = editing ? {
          expected_packets: Number(recipeLine.expected_packets),
          tolerance_percent: recipeLine.tolerance_percent,
          items: components,
        } : {
          product_id: Number(recipeLine.product_id), family: recipeLine.family || "Murukku",
          expected_packets: Number(recipeLine.expected_packets),
          tolerance_percent: recipeLine.tolerance_percent, items: components,
        };
        await api(editing ? `/api/recipes/${editing.id}` : "/api/recipes",
          { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      } else {
        const body = editing ? {
          role: user.role, is_active: user.is_active,
          ...(user.password ? { password: user.password } : {}),
        } : { username: user.username, password: user.password, role: user.role };
        await api(editing ? `/api/users/${editing.id}` : "/api/users",
          { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      }
      onSaved(`${labelFor(tab)} saved`);
    } catch (exception: any) {
      onError(exception.message);
    } finally {
      setBusy(false);
    }
  }

  const salesmen = data.users.filter((member) => member.role === "salesman" || member.role === "admin");

  return (
    <form onSubmit={submit} className="space-y-4">
      {tab === "customers" && (
        <>
          <Field label="Customer name">
            <input className="field" value={customer.name} required
              onChange={(event) => setCustomer({ ...customer, name: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <select className="field" value={customer.customer_type}
                onChange={(event) => setCustomer({ ...customer, customer_type: event.target.value })}>
                <option value="retailer">Retailer</option>
                <option value="distributor">Distributor</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </Field>
            <Field label="State">
              <input className="field" value={customer.state} required
                onChange={(event) => setCustomer({ ...customer, state: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="GSTIN" hint="Optional; used on the tax invoice">
              <input className="field" value={customer.gstin}
                onChange={(event) => setCustomer({ ...customer, gstin: event.target.value })} />
            </Field>
            <Field label="Assigned salesman">
              <select className="field" value={customer.salesman_id}
                onChange={(event) => setCustomer({ ...customer, salesman_id: event.target.value })}>
                <option value="">Unassigned</option>
                {salesmen.map((member) => (
                  <option key={member.id} value={member.id}>{member.username}</option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}

      {tab === "suppliers" && (
        <>
          <Field label="Supplier name">
            <input className="field" value={supplier.name} required
              onChange={(event) => setSupplier({ ...supplier, name: event.target.value })} />
          </Field>
          <Field label="State">
            <input className="field" value={supplier.state} required
              onChange={(event) => setSupplier({ ...supplier, state: event.target.value })} />
          </Field>
        </>
      )}

      {tab === "items" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item name">
              <input className="field" value={item.name} required
                onChange={(event) => setItem({ ...item, name: event.target.value })} />
            </Field>
            <Field label="HSN code">
              <input className="field" value={item.hsn_code}
                onChange={(event) => setItem({ ...item, hsn_code: event.target.value })} />
            </Field>
          </div>
          {!editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Item type">
                <select className="field" value={item.item_type}
                  onChange={(event) => setItem({ ...item, item_type: event.target.value })}>
                  <option value="raw">Raw material</option>
                  <option value="packaging">Packaging</option>
                  <option value="finished">Finished goods</option>
                </select>
              </Field>
              <Field label="Base unit" hint="All ledger quantities are stored in this unit">
                <select className="field" value={item.base_unit}
                  onChange={(event) => setItem({ ...item, base_unit: event.target.value })}>
                  <option value="g">grams (g)</option>
                  <option value="ml">millilitres (ml)</option>
                  <option value="piece">pieces</option>
                  <option value="packet">packets</option>
                </select>
              </Field>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reorder level">
              <input className="field" type="number" min="0" step="1" value={item.reorder_level}
                onChange={(event) => setItem({ ...item, reorder_level: event.target.value })} />
            </Field>
            <Field label="Conversion factor" hint="e.g. packets per carton">
              <input className="field" type="number" min="0.001" step="0.001" value={item.conversion_factor}
                onChange={(event) => setItem({ ...item, conversion_factor: event.target.value })} />
            </Field>
          </div>
          {!editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opening quantity" hint="Optional opening stock">
                <input className="field" type="number" min="0" step="0.001" value={item.opening_quantity}
                  onChange={(event) => setItem({ ...item, opening_quantity: event.target.value })} />
              </Field>
              <Field label="Opening unit cost (₹)">
                <input className="field" type="number" min="0" step="0.0001" value={item.opening_unit_cost}
                  onChange={(event) => setItem({ ...item, opening_unit_cost: event.target.value })} />
              </Field>
            </div>
          )}
        </>
      )}

      {tab === "products" && (
        <>
          {!editing && (
            <Field label="Finished-goods item">
              <select className="field" value={product.item_id} required
                onChange={(event) => setProduct({ ...product, item_id: event.target.value })}>
                <option value="">Select a finished item…</option>
                {finishedItems.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Product family" hint="Recipes are resolved by family">
              <input className="field" value={product.family} required
                onChange={(event) => setProduct({ ...product, family: event.target.value })} />
            </Field>
            <Field label="Pack size (g)">
              <input className="field" type="number" min="1" value={product.pack_size_g} required
                onChange={(event) => setProduct({ ...product, pack_size_g: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Selling price (₹)">
              <input className="field" type="number" min="0" step="0.01" value={product.selling_price} required
                onChange={(event) => setProduct({ ...product, selling_price: event.target.value })} />
            </Field>
            <Field label="GST rate (%)">
              <input className="field" type="number" min="0" max="50" step="0.5" value={product.gst_rate}
                onChange={(event) => setProduct({ ...product, gst_rate: event.target.value })} />
            </Field>
          </div>
        </>
      )}

      {tab === "recipes" && (
        <>
          {!editing && (
            <Field label="Product">
              <select className="field" value={recipeLine.product_id} required
                onChange={(event) => {
                  const productId = event.target.value;
                  const chosen = data.products.find((row) => String(row.id) === productId);
                  setRecipeLine({ ...recipeLine, product_id: productId, family: chosen?.family || recipeLine.family });
                }}>
                <option value="">Select a product…</option>
                {data.products.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Family">
              <input className="field" value={recipeLine.family} required
                onChange={(event) => setRecipeLine({ ...recipeLine, family: event.target.value })} />
            </Field>
            <Field label="Expected packets / batch">
              <input className="field" type="number" min="1" value={recipeLine.expected_packets} required
                onChange={(event) => setRecipeLine({ ...recipeLine, expected_packets: event.target.value })} />
            </Field>
            <Field label="Tolerance (%)">
              <input className="field" type="number" min="0" max="100" step="0.5" value={recipeLine.tolerance_percent}
                onChange={(event) => setRecipeLine({ ...recipeLine, tolerance_percent: event.target.value })} />
            </Field>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="field-label !mb-0">Components per batch (base units)</span>
              <button type="button" className="small-btn"
                onClick={() => setRecipeLine({
                  ...recipeLine,
                  components: [...recipeLine.components, { item_id: "", quantity: "" }],
                })}>
                <Plus size={12} /> Add component
              </button>
            </div>
            <div className="space-y-2">
              {recipeLine.components.map((line: any, index: number) => (
                <div className="grid gap-2 sm:grid-cols-[1fr_150px_36px]" key={index}>
                  <select className="field !mt-0" value={line.item_id}
                    onChange={(event) => setRecipeLine({
                      ...recipeLine,
                      components: recipeLine.components.map((entry: any, position: number) =>
                        position === index ? { ...entry, item_id: event.target.value } : entry),
                    })}>
                    <option value="">Select item…</option>
                    {data.items.map((row) => (
                      <option key={row.id} value={row.id}>{row.name} ({row.unit})</option>
                    ))}
                  </select>
                  <input className="field !mt-0" type="number" min="0.001" step="0.001"
                    placeholder="Quantity" value={line.quantity}
                    onChange={(event) => setRecipeLine({
                      ...recipeLine,
                      components: recipeLine.components.map((entry: any, position: number) =>
                        position === index ? { ...entry, quantity: event.target.value } : entry),
                    })} />
                  <button type="button" className="small-btn danger"
                    onClick={() => setRecipeLine({
                      ...recipeLine,
                      components: recipeLine.components.filter((_: any, position: number) => position !== index),
                    })}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "users" && (
        <>
          <Field label="Username">
            <input className="field" value={user.username} required disabled={Boolean(editing)}
              onChange={(event) => setUser({ ...user, username: event.target.value })} />
          </Field>
          <Field label={editing ? "Reset password (optional)" : "Password"}
            hint={editing ? "Leave blank to keep the current password" : "Minimum 8 characters"}>
            <input className="field" type="password" value={user.password}
              required={!editing} minLength={8}
              onChange={(event) => setUser({ ...user, password: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select className="field" value={user.role}
                onChange={(event) => setUser({ ...user, role: event.target.value })}>
                {(data.roles.length ? data.roles.map((entry) => entry.name)
                  : ["admin", "production", "salesman", "auditor", "owner"]).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            {editing && (
              <Field label="Account status">
                <select className="field" value={user.is_active ? "active" : "disabled"}
                  onChange={(event) => setUser({ ...user, is_active: event.target.value === "active" })}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
        <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
        <button className="primary-btn" disabled={busy}>{busy ? "Saving…" : `Save ${labelFor(tab)}`}</button>
      </div>
    </form>
  );
}

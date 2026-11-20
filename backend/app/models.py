from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Integer, Boolean, DateTime, Date, ForeignKey, Numeric, Text, UniqueConstraint, event
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

MONEY = Numeric(14, 2)
QTY = Numeric(16, 3)

class Role(Base):
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(20), primary_key=True)
    description: Mapped[str] = mapped_column(String(120), default="")

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(ForeignKey("roles.name"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class Item(Base):
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    item_type: Mapped[str] = mapped_column(String(20))  # raw, packaging, finished
    base_unit: Mapped[str] = mapped_column(String(20))  # g, ml, piece, packet
    hsn_code: Mapped[str] = mapped_column(String(20), default="2106")
    reorder_level: Mapped[Decimal] = mapped_column(QTY, default=Decimal("0"))
    conversion_factor: Mapped[Decimal] = mapped_column(Numeric(12,3), default=Decimal("1"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), unique=True)
    family: Mapped[str] = mapped_column(String(100))
    pack_size_g: Mapped[int] = mapped_column(Integer)
    selling_price: Mapped[Decimal] = mapped_column(MONEY)
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(5,2), default=Decimal("5"))
    item: Mapped[Item] = relationship()

class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    customer_type: Mapped[str] = mapped_column(String(30), default="retailer")
    state: Mapped[str] = mapped_column(String(80))
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    salesman_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(80), default="Tamil Nadu")

class Recipe(Base):
    __tablename__ = "recipes"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    family: Mapped[str] = mapped_column(String(100), default="Murukku")
    version: Mapped[int] = mapped_column(Integer, default=1)
    expected_packets: Mapped[int] = mapped_column(Integer, default=200)
    tolerance_percent: Mapped[Decimal] = mapped_column(Numeric(5,2), default=Decimal("3"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class RecipeItem(Base):
    __tablename__ = "recipe_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    quantity: Mapped[Decimal] = mapped_column(QTY)  # base units per recipe batch
    unit: Mapped[str] = mapped_column(String(20))
    item: Mapped[Item] = relationship()

class Purchase(Base):
    __tablename__ = "purchases"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    document_no: Mapped[str] = mapped_column(String(60), unique=True)
    purchased_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    total: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))

class PurchaseItem(Base):
    __tablename__ = "purchase_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    quantity: Mapped[Decimal] = mapped_column(QTY)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14,4))

class StockMovement(Base):
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    movement_type: Mapped[str] = mapped_column(String(30))
    quantity: Mapped[Decimal] = mapped_column(QTY)  # signed base quantity
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14,4), default=Decimal("0"))
    value: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    source_doc_type: Mapped[str] = mapped_column(String(30))
    source_doc_id: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    batch_no: Mapped[str | None] = mapped_column(String(60), nullable=True)
    expiry: Mapped[date | None] = mapped_column(Date, nullable=True)

class ProductionRun(Base):
    __tablename__ = "production_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_key: Mapped[str] = mapped_column(String(80), unique=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"))
    batch_count: Mapped[int] = mapped_column(Integer, default=1)
    expected_output: Mapped[int] = mapped_column(Integer)
    actual_output: Mapped[int] = mapped_column(Integer)
    damaged_pouches: Mapped[int] = mapped_column(Integer, default=0)
    cartons_used: Mapped[int] = mapped_column(Integer, default=0)
    yield_variance_percent: Mapped[Decimal] = mapped_column(Numeric(8,3))
    capacity_mismatch: Mapped[bool] = mapped_column(Boolean, default=False)
    posted: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

class MaterialIssue(Base):
    __tablename__ = "material_issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("production_runs.id"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    planned_quantity: Mapped[Decimal] = mapped_column(QTY)
    actual_quantity: Mapped[Decimal] = mapped_column(QTY)
    variance_percent: Mapped[Decimal] = mapped_column(Numeric(8,3))
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)

class ProductionCost(Base):
    __tablename__ = "production_costs"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("production_runs.id"))
    category: Mapped[str] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(MONEY)

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    salesman_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True, index=True)

class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(MONEY)

class InvoiceSequence(Base):
    __tablename__ = "invoice_sequences"
    id: Mapped[int] = mapped_column(primary_key=True)
    financial_year: Mapped[str] = mapped_column(String(9), unique=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)

class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    invoice_number: Mapped[str] = mapped_column(String(40), unique=True)
    invoice_date: Mapped[date] = mapped_column(Date, default=date.today)
    place_of_supply: Mapped[str] = mapped_column(String(80))
    gst_type: Mapped[str] = mapped_column(String(10))
    taxable_value: Mapped[Decimal] = mapped_column(MONEY)
    cgst: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    sgst: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    igst: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(MONEY)
    posted: Mapped[bool] = mapped_column(Boolean, default=True)

class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(MONEY)
    taxable_value: Mapped[Decimal] = mapped_column(MONEY)

class CreditNote(Base):
    __tablename__ = "credit_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    note_number: Mapped[str] = mapped_column(String(40), unique=True)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    reason: Mapped[str] = mapped_column(String(255))

class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    amount: Mapped[Decimal] = mapped_column(MONEY)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"))
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    amount: Mapped[Decimal] = mapped_column(MONEY)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(30))
    before_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


# ORM-level guard: posted stock movements are append-only ledger records.
@event.listens_for(StockMovement, "before_update")
def prevent_stock_movement_update(mapper, connection, target):
    raise ValueError("Stock movements are append-only and cannot be updated")

@event.listens_for(StockMovement, "before_delete")
def prevent_stock_movement_delete(mapper, connection, target):
    raise ValueError("Stock movements are append-only and cannot be deleted")

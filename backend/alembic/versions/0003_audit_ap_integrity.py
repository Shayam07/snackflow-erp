"""Accounts payable, credit-note reversal, ledger notes, indexes and constraints.

Revision ID: 0003_audit_ap_integrity
Revises: 0002_order_idempotency
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_audit_ap_integrity"
down_revision = "0002_order_idempotency"
branch_labels = None
depends_on = None


def _columns(table):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table):
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}


def _create_index(name, table, columns, unique=False):
    if name not in _indexes(table):
        op.create_index(name, table, columns, unique=unique)


def _add_check(table, name, condition):
    """Portable no-op on SQLite; SQLite cannot ALTER TABLE ADD CONSTRAINT."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    existing = {item["name"] for item in sa.inspect(bind).get_check_constraints(table)}
    if name not in existing:
        op.create_check_constraint(name, table, condition)


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name
    bool_default = sa.text("0") if dialect == "sqlite" else sa.false()

    if "supplier_payments" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "supplier_payments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
            sa.Column("purchase_id", sa.Integer(), sa.ForeignKey("purchases.id"), nullable=True),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("method", sa.String(20), nullable=False, server_default="bank"),
            sa.Column("reference", sa.String(100), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        )
        _create_index("ix_supplier_payments_supplier_id", "supplier_payments", ["supplier_id"])
        _create_index("ix_supplier_payments_purchase_id", "supplier_payments", ["purchase_id"])

    if "note" not in _columns("stock_movements"):
        op.add_column("stock_movements", sa.Column("note", sa.String(255), nullable=True))

    credit_columns = _columns("credit_notes")
    if "stock_returned" not in credit_columns:
        op.add_column("credit_notes", sa.Column("stock_returned", sa.Boolean(),
                                                nullable=False, server_default=bool_default))
    if "tax_reversed" not in credit_columns:
        op.add_column("credit_notes", sa.Column("tax_reversed", sa.Numeric(14, 2),
                                                nullable=False, server_default=sa.text("0")))

    for name, table, columns, unique in [
        ("ix_orders_status", "orders", ["status"], False),
        ("ix_orders_customer_id", "orders", ["customer_id"], False),
        ("ix_orders_salesman_id", "orders", ["salesman_id"], False),
        ("ix_order_items_order_id", "order_items", ["order_id"], False),
        ("ix_invoice_items_invoice_id", "invoice_items", ["invoice_id"], False),
        ("ix_material_issues_run_id", "material_issues", ["run_id"], False),
        ("ix_production_costs_run_id", "production_costs", ["run_id"], False),
        ("ix_production_runs_product_id", "production_runs", ["product_id"], False),
        ("ix_purchase_items_purchase_id", "purchase_items", ["purchase_id"], False),
        ("ix_purchase_items_item_id", "purchase_items", ["item_id"], False),
        ("ix_credit_notes_invoice_id", "credit_notes", ["invoice_id"], False),
        ("ix_audit_logs_action", "audit_logs", ["action"], False),
        ("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"], False),
        ("ix_audit_logs_created", "audit_logs", ["created_at"], False),
        ("ix_stock_movements_item_chrono", "stock_movements",
         ["item_id", "created_at", "id"], False),
    ]:
        _create_index(name, table, columns, unique=unique)

    _add_check("orders", "ck_orders_status",
               "status IN ('submitted','approved','rejected','invoiced','dispatched',"
               "'cancelled','returned')")
    _add_check("items", "ck_items_item_type", "item_type IN ('raw','packaging','finished')")
    _add_check("items", "ck_items_base_unit", "base_unit IN ('g','ml','piece','packet')")
    _add_check("customers", "ck_customers_type",
               "customer_type IN ('retailer','distributor','wholesale')")
    _add_check("invoices", "ck_invoices_gst_type", "gst_type IN ('CGST_SGST','IGST')")
    _add_check("production_costs", "ck_production_costs_category",
               "category IN ('labour','gas_power','other')")
    _add_check("production_costs", "ck_production_costs_amount_positive", "amount > 0")
    _add_check("supplier_payments", "ck_supplier_payments_amount_positive", "amount > 0")
    _add_check("supplier_payments", "ck_supplier_payments_method",
               "method IN ('bank','upi','cash','cheque')")
    _add_check("products", "ck_products_pack_size_positive", "pack_size_g > 0")
    _add_check("products", "ck_products_price_non_negative", "selling_price >= 0")
    _add_check("products", "ck_products_gst_rate_range", "gst_rate >= 0 AND gst_rate <= 50")
    _add_check("stock_movements", "ck_stock_movements_type",
               "movement_type IN ('opening','purchase','production_issue','production_output',"
               "'production_overhead','dispatch','adjustment','purchase_return','sales_return')")


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table, name in [
            ("stock_movements", "ck_stock_movements_type"),
            ("products", "ck_products_gst_rate_range"),
            ("products", "ck_products_price_non_negative"),
            ("products", "ck_products_pack_size_positive"),
            ("supplier_payments", "ck_supplier_payments_method"),
            ("supplier_payments", "ck_supplier_payments_amount_positive"),
            ("production_costs", "ck_production_costs_amount_positive"),
            ("production_costs", "ck_production_costs_category"),
            ("invoices", "ck_invoices_gst_type"),
            ("customers", "ck_customers_type"),
            ("items", "ck_items_base_unit"),
            ("items", "ck_items_item_type"),
            ("orders", "ck_orders_status"),
        ]:
            try:
                op.drop_constraint(name, table, type_="check")
            except Exception:
                pass

    for name, table in [
        ("ix_stock_movements_item_chrono", "stock_movements"),
        ("ix_audit_logs_created", "audit_logs"),
        ("ix_audit_logs_entity", "audit_logs"),
        ("ix_audit_logs_action", "audit_logs"),
        ("ix_credit_notes_invoice_id", "credit_notes"),
        ("ix_purchase_items_item_id", "purchase_items"),
        ("ix_purchase_items_purchase_id", "purchase_items"),
        ("ix_production_runs_product_id", "production_runs"),
        ("ix_production_costs_run_id", "production_costs"),
        ("ix_material_issues_run_id", "material_issues"),
        ("ix_invoice_items_invoice_id", "invoice_items"),
        ("ix_order_items_order_id", "order_items"),
        ("ix_orders_salesman_id", "orders"),
        ("ix_orders_customer_id", "orders"),
        ("ix_orders_status", "orders"),
    ]:
        if name in _indexes(table):
            op.drop_index(name, table_name=table)

    if "tax_reversed" in _columns("credit_notes"):
        op.drop_column("credit_notes", "tax_reversed")
    if "stock_returned" in _columns("credit_notes"):
        op.drop_column("credit_notes", "stock_returned")
    if "note" in _columns("stock_movements"):
        op.drop_column("stock_movements", "note")
    if "supplier_payments" in set(sa.inspect(bind).get_table_names()):
        op.drop_table("supplier_payments")

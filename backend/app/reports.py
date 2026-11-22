"""Ledger-derived report queries used by the API and the export endpoints."""
import csv
import io
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (AuditLog, CreditNote, Invoice, Item, PaymentAllocation, StockMovement,
                        User)
from app.services.inventory import valuation_many
from app.services.payables import payables_summary


def stock_summary(db: Session):
    """Balances and carrying values for every item in two queries, not three per item."""
    items = db.scalars(select(Item).order_by(Item.name)).all()
    valuations = valuation_many(db, [item.id for item in items])
    result = []
    for item in items:
        raw_balance, carrying_value, average_cost = valuations[item.id]
        display_balance, display_unit = raw_balance, item.base_unit
        if item.base_unit == "g":
            display_balance, display_unit = raw_balance / Decimal("1000"), "kg"
        elif item.base_unit == "ml":
            display_balance, display_unit = raw_balance / Decimal("1000"), "L"
        result.append({
            "item": item.name,
            "type": item.item_type,
            "unit": display_unit,
            "balance": format(display_balance.normalize(), "f"),
            "base_balance": str(raw_balance),
            "base_unit": item.base_unit,
            "reorder_level": str(item.reorder_level),
            "below_reorder": raw_balance < Decimal(item.reorder_level),
            "active": item.active,
            "carrying_value": str(carrying_value.quantize(Decimal("0.01"))),
            "average_cost_per_base_unit": str(average_cost),
        })
    return result


def stock_ledger(db: Session):
    rows = db.execute(
        select(StockMovement, Item.name, Item.base_unit)
        .join(Item, Item.id == StockMovement.item_id)
        .order_by(StockMovement.created_at, StockMovement.id)
    ).all()
    return [{
        "id": movement.id,
        "item_id": movement.item_id,
        "item": name,
        "unit": unit,
        "movement_type": movement.movement_type,
        "quantity": str(movement.quantity),
        "unit_cost": str(movement.unit_cost),
        "value": str(movement.value),
        "source": f"{movement.source_doc_type}:{movement.source_doc_id}",
        "note": movement.note or "",
        "created_at": movement.created_at.isoformat(),
    } for movement, name, unit in rows]


def sales_register(db: Session):
    """Invoice register with COGS, settled amount and outstanding balance."""
    invoices = db.scalars(select(Invoice).order_by(Invoice.invoice_date, Invoice.id)).all()
    allocated = dict(db.execute(
        select(PaymentAllocation.invoice_id, func.sum(PaymentAllocation.amount))
        .group_by(PaymentAllocation.invoice_id)
    ).all())
    credited = dict(db.execute(
        select(CreditNote.invoice_id, func.sum(CreditNote.amount))
        .group_by(CreditNote.invoice_id)
    ).all())
    cogs = dict(db.execute(
        select(StockMovement.source_doc_id, func.sum(StockMovement.value))
        .where(StockMovement.source_doc_type == "invoice",
               StockMovement.movement_type == "dispatch")
        .group_by(StockMovement.source_doc_id)
    ).all())

    result = []
    for invoice in invoices:
        invoice_cogs = -Decimal(str(cogs.get(invoice.id) or 0))
        paid = Decimal(str(allocated.get(invoice.id) or 0))
        credited_amount = Decimal(str(credited.get(invoice.id) or 0))
        result.append({
            "invoice": invoice.invoice_number,
            "date": str(invoice.invoice_date),
            "taxable": str(invoice.taxable_value),
            "cgst": str(invoice.cgst),
            "sgst": str(invoice.sgst),
            "igst": str(invoice.igst),
            "total": str(invoice.total),
            "cogs": str(invoice_cogs),
            "gross_profit_before_overheads": str(Decimal(invoice.taxable_value) - invoice_cogs),
            "received": str(paid),
            "credited": str(credited_amount),
            "outstanding": str((Decimal(invoice.total) - paid - credited_amount).quantize(Decimal("0.01"))),
        })
    return result


def audit_register(db: Session):
    rows = db.execute(
        select(AuditLog, User.username)
        .join(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at, AuditLog.id)
    ).all()
    return [{
        "id": entry.id,
        "created_at": entry.created_at.isoformat(),
        "actor": username,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "action": entry.action,
        "before": entry.before_json or "",
        "after": entry.after_json or "",
    } for entry, username in rows]


def payables_register(db: Session):
    return payables_summary(db)


def csv_bytes(rows: list[dict]) -> bytes:
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return output.getvalue().encode("utf-8")

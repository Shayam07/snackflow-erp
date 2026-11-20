import csv
import io
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import StockMovement, Item, Invoice, Order, Customer, ProductionRun, MaterialIssue, ProductionCost
from app.services.inventory import balance, inventory_value, weighted_average_cost

def stock_summary(db: Session):
    result = []
    for item in db.scalars(select(Item).order_by(Item.name)).all():
        raw_balance = balance(db, item.id)
        display_balance, display_unit = raw_balance, item.base_unit
        if item.base_unit == "g":
            display_balance, display_unit = raw_balance / Decimal("1000"), "kg"
        elif item.base_unit == "ml":
            display_balance, display_unit = raw_balance / Decimal("1000"), "L"
        carrying_value = inventory_value(db, item.id)
        average_cost = weighted_average_cost(db, item.id)
        result.append({
            "item": item.name, "type": item.item_type, "unit": display_unit,
            "balance": format(display_balance.normalize(), "f"),
            "base_balance": str(raw_balance), "base_unit": item.base_unit,
            "carrying_value": str(carrying_value.quantize(Decimal("0.01"))),
            "average_cost_per_base_unit": str(average_cost),
        })
    return result

def stock_ledger(db: Session):
    rows = db.scalars(select(StockMovement).order_by(StockMovement.created_at, StockMovement.id)).all()
    result = []
    for movement in rows:
        item = db.get(Item, movement.item_id)
        result.append({"id": movement.id, "item_id": movement.item_id,
                       "item": item.name, "unit": item.base_unit,
                       "movement_type": movement.movement_type,
                       "quantity": str(movement.quantity),
                       "unit_cost": str(movement.unit_cost),
                       "value": str(movement.value),
                       "source": f"{movement.source_doc_type}:{movement.source_doc_id}",
                       "created_at": movement.created_at.isoformat()})
    return result


def sales_register(db: Session):
    rows = db.scalars(select(Invoice).order_by(Invoice.invoice_date, Invoice.id)).all()
    result = []
    for invoice in rows:
        cogs = -sum((Decimal(m.value) for m in db.scalars(select(StockMovement).where(
            StockMovement.source_doc_type == "invoice",
            StockMovement.source_doc_id == invoice.id,
            StockMovement.movement_type == "dispatch",
        )).all()), Decimal("0"))
        result.append({
            "invoice": invoice.invoice_number, "date": str(invoice.invoice_date),
            "taxable": str(invoice.taxable_value), "cgst": str(invoice.cgst),
            "sgst": str(invoice.sgst), "igst": str(invoice.igst),
            "total": str(invoice.total), "cogs": str(cogs),
            "gross_profit_before_overheads": str(Decimal(invoice.taxable_value) - cogs),
        })
    return result

def csv_bytes(rows: list[dict]) -> bytes:
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader(); writer.writerows(rows)
    return output.getvalue().encode("utf-8")

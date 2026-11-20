
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.models import StockMovement, Item

ZERO = Decimal("0")

def balance(db: Session, item_id: int) -> Decimal:
    value = db.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.item_id == item_id)
    )
    return Decimal(str(value or 0))

def record_movement(
    db: Session, *, item_id: int, movement_type: str, quantity: Decimal,
    unit_cost: Decimal, source_doc_type: str, source_doc_id: int,
    created_by: int, batch_no=None, expiry=None, value_override=None
):
    """Append one signed stock movement. `value_override` supports zero-qty valuation adjustments."""
    item = db.get(Item, item_id)
    if not item:
        raise ValueError("Unknown inventory item")
    qty = Decimal(quantity)
    cost = Decimal(unit_cost)
    movement_value = Decimal(value_override) if value_override is not None else qty * cost
    db.add(StockMovement(
        item_id=item_id, movement_type=movement_type, quantity=qty,
        unit_cost=cost, value=movement_value,
        source_doc_type=source_doc_type, source_doc_id=source_doc_id,
        created_by=created_by, batch_no=batch_no, expiry=expiry
    ))

def inventory_valuation(db: Session, item_id: int) -> tuple[Decimal, Decimal, Decimal]:
    """Replay movements chronologically to return on-hand qty, carrying value and moving-average rate.

    Positive receipts add value at their receipt rate. Issues reduce carrying value at the
    current moving-average rate. Zero-quantity valuation movements add overhead/adjustments.
    """
    rows = db.scalars(
        select(StockMovement)
        .where(StockMovement.item_id == item_id)
        .order_by(StockMovement.created_at, StockMovement.id)
    ).all()
    qty = ZERO
    value = ZERO
    for row in rows:
        movement_qty = Decimal(row.quantity)
        movement_value = Decimal(row.value)
        if movement_qty > ZERO:
            qty += movement_qty
            value += movement_value
        elif movement_qty < ZERO:
            issue_qty = -movement_qty
            if qty <= ZERO or issue_qty > qty:
                raise ValueError(f"Ledger issue exceeds available quantity for item {item_id}")
            # Use the signed value written to the ledger at posting time. It is the
            # moving-average issue value rounded to the currency's paise precision.
            qty -= issue_qty
            value += movement_value
        elif movement_value:
            value += movement_value
    if qty == ZERO:
        return qty, ZERO, ZERO
    return qty, value, value / qty

def weighted_average_cost(db: Session, item_id: int) -> Decimal:
    """Current moving-average cost per base unit, after replaying receipts and issues."""
    return inventory_valuation(db, item_id)[2]

def inventory_value(db: Session, item_id: int) -> Decimal:
    return inventory_valuation(db, item_id)[1]

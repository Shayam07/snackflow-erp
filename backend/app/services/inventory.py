"""Append-only stock ledger, moving weighted-average valuation and stock adjustments."""
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, DomainError
from app.models import Item, StockMovement
from app.services.audit import log_event

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
    created_by: int, batch_no=None, expiry=None, value_override=None, note=None
):
    """Append one signed stock movement. `value_override` supports zero-qty valuation adjustments."""
    item = db.get(Item, item_id)
    if not item:
        raise DomainError("Unknown inventory item")
    qty = Decimal(quantity)
    cost = Decimal(unit_cost)
    movement_value = Decimal(value_override) if value_override is not None else qty * cost
    db.add(StockMovement(
        item_id=item_id, movement_type=movement_type, quantity=qty,
        unit_cost=cost, value=movement_value,
        source_doc_type=source_doc_type, source_doc_id=source_doc_id,
        created_by=created_by, batch_no=batch_no, expiry=expiry, note=note,
    ))


def valuation_many(db: Session, item_ids: list[int]) -> dict[int, tuple[Decimal, Decimal, Decimal]]:
    """Replay the ledger once for many items in a single query.

    Returns `{item_id: (on_hand, carrying_value, moving_average_rate)}`. One query plus one
    pass per item replaces the previous pattern of three full replays per item.
    """
    ids = list(dict.fromkeys(item_ids))
    if not ids:
        return {}
    rows = db.execute(
        select(StockMovement.item_id, StockMovement.quantity, StockMovement.value)
        .where(StockMovement.item_id.in_(ids))
        .order_by(StockMovement.item_id, StockMovement.created_at, StockMovement.id)
    ).all()
    state: dict[int, list[Decimal]] = {item_id: [ZERO, ZERO] for item_id in ids}
    for item_id, quantity, value in rows:
        movement_qty = Decimal(quantity)
        movement_value = Decimal(value)
        acc = state[item_id]
        if movement_qty > ZERO:
            acc[0] += movement_qty
            acc[1] += movement_value
        elif movement_qty < ZERO:
            issue_qty = -movement_qty
            if acc[0] <= ZERO or issue_qty > acc[0]:
                raise DomainError(f"Ledger issue exceeds available quantity for item {item_id}")
            # The ledger value was written at posting time using the then-current average.
            acc[0] -= issue_qty
            acc[1] += movement_value
        elif movement_value:
            acc[1] += movement_value
    return {
        item_id: (qty, value, (value / qty) if qty != ZERO else ZERO)
        for item_id, (qty, value) in state.items()
    }


def inventory_valuation(db: Session, item_id: int) -> tuple[Decimal, Decimal, Decimal]:
    """On-hand quantity, carrying value and moving-average rate for one item."""
    return valuation_many(db, [item_id])[item_id]


def weighted_average_cost(db: Session, item_id: int) -> Decimal:
    """Current moving-average cost per base unit, after replaying receipts and issues."""
    return inventory_valuation(db, item_id)[2]


def inventory_value(db: Session, item_id: int) -> Decimal:
    return inventory_valuation(db, item_id)[1]


def adjust_stock(db: Session, *, item_id: int, quantity: Decimal, reason: str, user,
                 unit_cost: Decimal | None = None):
    """Record a physical-count correction or wastage write-off as a ledger entry.

    Stock remains append-only: a correction is a new signed movement, never an edit.
    """
    item = db.get(Item, item_id)
    if not item:
        raise DomainError("Unknown inventory item")
    qty = Decimal(quantity)
    if qty == ZERO:
        raise DomainError("Adjustment quantity cannot be zero")
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise DomainError("A reason of at least 3 characters is required for stock adjustments")
    if qty < ZERO and balance(db, item_id) < -qty:
        raise ConflictError("Adjustment exceeds on-hand stock for this item")

    if unit_cost is not None:
        rate = Decimal(unit_cost)
    else:
        rate = weighted_average_cost(db, item_id) if qty < ZERO else ZERO
    if qty > ZERO and rate <= ZERO:
        raise DomainError("Provide a unit cost for write-on adjustments on items with no history")

    record_movement(
        db, item_id=item_id, movement_type="adjustment", quantity=qty, unit_cost=rate,
        source_doc_type="adjustment", source_doc_id=0, created_by=user.id, note=reason,
    )
    log_event(db, user_id=user.id, entity_type="stock_adjustment", entity_id=item_id,
              action="adjusted",
              after={"item": item.name, "quantity": str(qty), "unit_cost": str(rate),
                     "reason": reason})
    return item

"""Inventory reads and legitimate corrections to the append-only ledger."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pagination import Page, page_params, paginate
from app.core.security import require_roles
from app.database import get_db
from app.models import Item, StockMovement, User
from app.reports import stock_summary
from app.schemas import StockAdjustmentInput
from app.services.inventory import adjust_stock

router = APIRouter(tags=["inventory"])

READERS = require_roles("admin", "production", "auditor", "owner")


@router.get("/api/inventory/summary")
def inventory_summary(db: Session = Depends(get_db), user: User = Depends(READERS)):
    return stock_summary(db)


@router.get("/api/inventory/ledger")
def inventory_ledger(
    item_id: int | None = None,
    movement_type: str | None = None,
    page: Page = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(READERS),
):
    query = (
        select(StockMovement, Item.name, Item.base_unit)
        .join(Item, Item.id == StockMovement.item_id)
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
    )
    if item_id is not None:
        query = query.where(StockMovement.item_id == item_id)
    if movement_type:
        query = query.where(StockMovement.movement_type == movement_type)

    rows, total = paginate(db, query, page)
    return {
        "items": [{
            "id": movement.id,
            "item_id": movement.item_id,
            "item": name,
            "unit": unit,
            "movement_type": movement.movement_type,
            "quantity": str(movement.quantity),
            "unit_cost": str(movement.unit_cost),
            "value": str(movement.value),
            "source": f"{movement.source_doc_type}:{movement.source_doc_id}",
            "note": movement.note,
            "created_at": movement.created_at.isoformat(),
        } for movement, name, unit in rows],
        "total": total,
        "limit": page.limit,
        "offset": page.offset,
    }


@router.post("/api/inventory/adjustments", status_code=201)
def create_adjustment(data: StockAdjustmentInput, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("admin"))):
    item = adjust_stock(db, item_id=data.item_id, quantity=data.quantity,
                        reason=data.reason, user=user, unit_cost=data.unit_cost)
    db.commit()
    return {"item_id": item.id, "adjusted": str(data.quantity)}

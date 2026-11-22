"""Production run and run-cost API routes."""
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.core.pagination import Page, page_params, paginate
from app.core.security import require_roles
from app.database import get_db
from app.models import Product, ProductionCost, ProductionRun, StockMovement, User
from app.schemas import ProductionCostInput, ProductionCreate
from app.services.production import add_run_cost, post_production_run

router = APIRouter(prefix="/api/production", tags=["production"])

OPERATORS = require_roles("production", "admin")
READERS = require_roles("production", "admin", "auditor", "owner")


@router.post("/runs")
def create_production_run(data: ProductionCreate, db: Session = Depends(get_db),
                          user: User = Depends(OPERATORS)):
    run = post_production_run(db, data=data, user=user)
    db.commit()
    return {
        "run_id": run.id,
        "expected_output": run.expected_output,
        "actual_output": run.actual_output,
        "yield_variance_percent": str(run.yield_variance_percent),
        "capacity_mismatch": run.capacity_mismatch,
    }


@router.post("/runs/{run_id}/costs")
def add_production_cost(run_id: int, data: ProductionCostInput,
                        db: Session = Depends(get_db), user: User = Depends(OPERATORS)):
    add_run_cost(db, run_id=run_id, category=data.category,
                 amount=data.amount, user=user)
    db.commit()
    return {"run_id": run_id, "category": data.category, "amount": str(data.amount)}


@router.get("/runs")
def production_runs(page: Page = Depends(page_params), db: Session = Depends(get_db),
                    user: User = Depends(READERS)):
    query = select(ProductionRun).order_by(ProductionRun.id.desc())
    rows, total = paginate(db, query, page)
    return {
        "items": [{
            "id": run.id, "run_key": run.run_key, "product_id": run.product_id,
            "expected_output": run.expected_output, "actual_output": run.actual_output,
            "yield_variance_percent": str(run.yield_variance_percent),
            "capacity_mismatch": run.capacity_mismatch,
            "created_at": run.created_at.isoformat(),
        } for (run,) in rows],
        "total": total, "limit": page.limit, "offset": page.offset,
    }


@router.get("/runs/{run_id}")
def production_run_detail(run_id: int, db: Session = Depends(get_db),
                          user: User = Depends(READERS)):
    run = db.get(ProductionRun, run_id)
    if not run:
        raise DomainError("Production run not found")
    issues = db.execute(
        select(StockMovement).where(
            StockMovement.source_doc_type == "production_run",
            StockMovement.source_doc_id == run_id,
            StockMovement.movement_type == "production_issue",
        )
    ).scalars().all()
    costs = db.scalars(select(ProductionCost).where(ProductionCost.run_id == run_id)).all()
    return {
        "id": run.id, "run_key": run.run_key, "actual_output": run.actual_output,
        "expected_output": run.expected_output,
        "yield_variance_percent": str(run.yield_variance_percent),
        "capacity_mismatch": run.capacity_mismatch,
        "issues": [{"item_id": issue.item_id, "quantity": str(-Decimal(issue.quantity)),
                    "unit_cost": str(issue.unit_cost), "value": str(-Decimal(issue.value))}
                   for issue in issues],
        "costs": [{"category": cost.category, "amount": str(cost.amount)} for cost in costs],
    }


@router.get("/runs/{run_id}/cost")
def production_cost(run_id: int, db: Session = Depends(get_db),
                    user: User = Depends(READERS)):
    run = db.get(ProductionRun, run_id)
    if not run:
        raise DomainError("Production run not found")
    issues = db.scalars(select(StockMovement).where(
        StockMovement.source_doc_type == "production_run",
        StockMovement.source_doc_id == run_id,
        StockMovement.quantity < 0,
    )).all()
    material = -sum((Decimal(row.value) for row in issues), Decimal("0"))
    costs = db.scalars(select(ProductionCost).where(ProductionCost.run_id == run_id)).all()
    overhead = sum((Decimal(row.amount) for row in costs), Decimal("0"))
    total = material + overhead
    cost_per_packet = (total / Decimal(run.actual_output)).quantize(Decimal("0.01"))
    selling_price = Decimal(db.get(Product, run.product_id).selling_price)
    margin = (((selling_price - cost_per_packet) / selling_price * 100).quantize(Decimal("0.01"))
              if selling_price else Decimal("0"))
    return {
        "material_cost": str(material), "overheads": str(overhead),
        "total_run_cost": str(total), "good_packets": run.actual_output,
        "cost_per_packet": str(cost_per_packet), "selling_price": str(selling_price),
        "gross_margin_percent": str(margin),
    }

"""Production run and run-cost API routes."""
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ProductionRun, StockMovement, ProductionCost, User
from app.schemas import ProductionCreate, ProductionCostInput
from app.core.security import require_roles
from app.services.production import post_production_run, add_run_cost
from app.services.inventory import weighted_average_cost
from app.models import Product

router = APIRouter(prefix="/api/production", tags=["production"])

@router.post("/runs")
def create_production_run(
    data: ProductionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("production", "admin")),
):
    try:
        run = post_production_run(db, data=data, user=user)
        db.commit()
        return {
            "run_id": run.id,
            "expected_output": run.expected_output,
            "actual_output": run.actual_output,
            "yield_variance_percent": str(run.yield_variance_percent),
            "capacity_mismatch": run.capacity_mismatch,
        }
    except Exception as exc:
        db.rollback()
        raise HTTPException(409, str(exc))

@router.post("/runs/{run_id}/costs")
def add_production_cost(
    run_id: int,
    data: ProductionCostInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("production", "admin")),
):
    try:
        add_run_cost(db, run_id=run_id, category=data.category,
                     amount=data.amount, user=user)
        db.commit()
        return {"run_id": run_id, "category": data.category, "amount": str(data.amount)}
    except Exception as exc:
        db.rollback()
        raise HTTPException(400, str(exc))

@router.get("/runs")
def production_runs(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("production", "admin", "auditor", "owner")),
):
    rows = db.scalars(select(ProductionRun).order_by(ProductionRun.id.desc())).all()
    return [{
        "id": row.id, "run_key": row.run_key,
        "expected_output": row.expected_output, "actual_output": row.actual_output,
        "yield_variance_percent": str(row.yield_variance_percent),
        "capacity_mismatch": row.capacity_mismatch,
    } for row in rows]

@router.get("/runs/{run_id}/cost")
def production_cost(
    run_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "production", "owner", "auditor")),
):
    run = db.get(ProductionRun, run_id)
    if not run:
        raise HTTPException(404, "Production run not found")
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
    margin = ((selling_price - cost_per_packet) / selling_price * 100).quantize(Decimal("0.01"))
    return {
        "material_cost": str(material), "overheads": str(overhead),
        "total_run_cost": str(total), "good_packets": run.actual_output,
        "cost_per_packet": str(cost_per_packet), "selling_price": str(selling_price),
        "gross_margin_percent": str(margin),
    }

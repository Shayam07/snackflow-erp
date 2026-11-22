from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, DomainError
from app.models import (Item, MaterialIssue, ProductionCost, ProductionRun, Product, Recipe,
                        RecipeItem)
from app.services.audit import log_event
from app.services.calculations import variance_percent
from app.services.inventory import balance, record_movement, weighted_average_cost

ZERO = Decimal("0")


def post_production_run(db: Session, *, data, user):
    """Post BOM issues and finished output atomically, with packaging derived by the server."""
    if db.scalar(select(ProductionRun).where(ProductionRun.run_key == data.run_key)):
        raise ConflictError("Production run key already posted")

    product = db.get(Product, data.product_id)
    if not product:
        raise DomainError("Unknown product")
    recipe = db.scalar(select(Recipe).where(
        Recipe.family == product.family, Recipe.active.is_(True)
    ).order_by(Recipe.version.desc()))
    if not recipe:
        raise DomainError("No active BOM for product")

    recipe_rows = db.scalars(
        select(RecipeItem).where(RecipeItem.recipe_id == recipe.id)
    ).all()
    planned = {row.item_id: Decimal(row.quantity) * data.batch_count for row in recipe_rows}
    supplied = {line.item_id: Decimal(line.actual_quantity) for line in data.issues}
    if len(supplied) != len(data.issues):
        raise DomainError("Duplicate material issue item")
    unknown = set(supplied) - set(planned)
    if unknown:
        raise DomainError(f"Actual issue contains items outside the BOM: {sorted(unknown)}")

    pouch = next((row.item for row in recipe_rows
                  if row.item.item_type == "packaging" and "pouch" in row.item.name.lower()), None)
    carton = next((row.item for row in recipe_rows
                   if row.item.item_type == "packaging" and "carton" in row.item.name.lower()), None)
    if not pouch or not carton:
        raise DomainError("BOM must include pouch and carton packaging items")

    actual = dict(supplied)
    actual[pouch.id] = Decimal(data.actual_output + data.damaged_pouches)
    actual[carton.id] = Decimal(data.cartons_used)

    for row in recipe_rows:
        if row.item_id not in (pouch.id, carton.id) and row.item_id not in actual:
            raise DomainError(f"Actual consumption is required for {row.item.name}")
        qty = actual[row.item_id]
        if qty < ZERO:
            raise DomainError("Material consumption cannot be negative")
        if balance(db, row.item_id) < qty:
            raise ConflictError(f"Insufficient stock for {row.item.name}")

    expected_output = recipe.expected_packets * data.batch_count
    yield_variance = variance_percent(Decimal(data.actual_output), Decimal(expected_output))
    packets_per_carton = int(carton.conversion_factor)
    capacity_mismatch = data.cartons_used * packets_per_carton != data.actual_output

    run = ProductionRun(
        run_key=data.run_key, product_id=product.id, recipe_id=recipe.id,
        batch_count=data.batch_count, expected_output=expected_output,
        actual_output=data.actual_output, damaged_pouches=data.damaged_pouches,
        cartons_used=data.cartons_used, yield_variance_percent=yield_variance,
        capacity_mismatch=capacity_mismatch, created_by=user.id,
    )
    db.add(run)
    db.flush()

    material_cost = ZERO
    for row in recipe_rows:
        item = row.item
        actual_qty = actual[row.item_id]
        planned_qty = planned[row.item_id]
        variance = variance_percent(actual_qty, planned_qty)
        flagged = abs(variance) > Decimal(recipe.tolerance_percent)
        db.add(MaterialIssue(
            run_id=run.id, item_id=item.id, planned_quantity=planned_qty,
            actual_quantity=actual_qty, variance_percent=variance, flagged=flagged,
        ))
        rate = weighted_average_cost(db, item.id)
        material_cost += actual_qty * rate
        record_movement(
            db, item_id=item.id, movement_type="production_issue",
            quantity=-actual_qty, unit_cost=rate, source_doc_type="production_run",
            source_doc_id=run.id, created_by=user.id,
        )

    finished_item = product.item
    output_rate = material_cost / Decimal(data.actual_output)
    record_movement(
        db, item_id=finished_item.id, movement_type="production_output",
        quantity=Decimal(data.actual_output), unit_cost=output_rate,
        source_doc_type="production_run", source_doc_id=run.id, created_by=user.id,
        value_override=material_cost,
    )

    log_event(db, user_id=user.id, entity_type="production_run", entity_id=run.id,
              action="posted",
              after={"run_key": run.run_key, "actual_output": run.actual_output,
                     "expected_output": run.expected_output,
                     "yield_variance_percent": str(run.yield_variance_percent),
                     "material_cost": str(material_cost)})
    return run


def add_run_cost(db: Session, *, run_id: int, category: str, amount: Decimal, user):
    """Append a cost to a posted run and capitalize it into finished-goods value."""
    run = db.get(ProductionRun, run_id)
    if not run or not run.posted:
        raise DomainError("Posted production run not found")
    amount = Decimal(amount)
    if amount <= ZERO:
        raise DomainError("Cost amount must be positive")
    if category not in {"labour", "gas_power", "other"}:
        raise DomainError("Cost category must be labour, gas_power or other")

    db.add(ProductionCost(run_id=run.id, category=category, amount=amount))
    product = db.get(Product, run.product_id)
    record_movement(
        db, item_id=product.item_id, movement_type="production_overhead",
        quantity=ZERO, unit_cost=ZERO, value_override=amount,
        source_doc_type="production_run", source_doc_id=run.id, created_by=user.id,
    )
    log_event(db, user_id=user.id, entity_type="production_run", entity_id=run.id,
              action="cost_added", after={"category": category, "amount": str(amount)})
    return run

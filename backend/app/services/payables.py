"""Accounts-payable side of purchasing: supplier payments and outstanding balances."""
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, DomainError
from app.models import Purchase, Supplier, SupplierPayment
from app.services.audit import log_event

ZERO = Decimal("0")


def paid_for_purchase(db: Session, purchase_id: int) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(SupplierPayment.amount), 0))
        .where(SupplierPayment.purchase_id == purchase_id)
    )
    return Decimal(str(total or 0))


def record_supplier_payment(db: Session, *, data, user) -> SupplierPayment:
    supplier = db.get(Supplier, data.supplier_id)
    if not supplier:
        raise DomainError("Supplier not found")
    purchase = None
    if data.purchase_id is not None:
        purchase = db.get(Purchase, data.purchase_id)
        if not purchase:
            raise DomainError("Purchase not found")
        if purchase.supplier_id != supplier.id:
            raise DomainError("Purchase belongs to a different supplier")
        outstanding = Decimal(purchase.total) - paid_for_purchase(db, purchase.id)
        if Decimal(data.amount) > outstanding:
            raise ConflictError(
                f"Payment exceeds the supplier bill outstanding ({outstanding:.2f})"
            )

    payment = SupplierPayment(
        supplier_id=supplier.id, purchase_id=data.purchase_id, amount=data.amount,
        method=data.method, reference=data.reference, created_by=user.id,
    )
    db.add(payment)
    db.flush()
    log_event(db, user_id=user.id, entity_type="supplier_payment", entity_id=payment.id,
              action="recorded",
              after={"supplier": supplier.name, "amount": str(payment.amount),
                     "method": payment.method, "purchase_id": data.purchase_id})
    return payment


def payables_summary(db: Session) -> list[dict]:
    """Per-supplier billed / paid / outstanding, derived from purchases and payments."""
    suppliers = db.scalars(select(Supplier).order_by(Supplier.name)).all()
    billed = dict(db.execute(
        select(Purchase.supplier_id, func.sum(Purchase.total)).group_by(Purchase.supplier_id)
    ).all())
    paid = dict(db.execute(
        select(SupplierPayment.supplier_id, func.sum(SupplierPayment.amount))
        .group_by(SupplierPayment.supplier_id)
    ).all())
    bills = dict(db.execute(
        select(Purchase.supplier_id, func.count(Purchase.id)).group_by(Purchase.supplier_id)
    ).all())

    rows = []
    for supplier in suppliers:
        total_billed = Decimal(str(billed.get(supplier.id) or 0))
        total_paid = Decimal(str(paid.get(supplier.id) or 0))
        rows.append({
            "supplier_id": supplier.id,
            "supplier": supplier.name,
            "state": supplier.state,
            "bills": int(bills.get(supplier.id) or 0),
            "billed": str(total_billed.quantize(Decimal("0.01"))),
            "paid": str(total_paid.quantize(Decimal("0.01"))),
            "outstanding": str((total_billed - total_paid).quantize(Decimal("0.01"))),
        })
    return rows

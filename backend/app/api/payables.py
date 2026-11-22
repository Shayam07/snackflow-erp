"""Purchases read model and supplier payments (accounts payable)."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pagination import Page, page_params, paginate
from app.core.security import require_roles
from app.database import get_db
from app.models import Purchase, Supplier, SupplierPayment, User
from app.schemas import SupplierPaymentInput
from app.services.payables import payables_summary, record_supplier_payment

router = APIRouter(tags=["payables"])

READERS = require_roles("admin", "auditor", "owner")


@router.get("/api/purchases")
def list_purchases(page: Page = Depends(page_params), db: Session = Depends(get_db),
                   user: User = Depends(READERS)):
    query = (
        select(Purchase, Supplier.name)
        .join(Supplier, Supplier.id == Purchase.supplier_id)
        .order_by(Purchase.purchased_at.desc(), Purchase.id.desc())
    )
    rows, total = paginate(db, query, page)
    return {
        "items": [{
            "id": purchase.id,
            "document_no": purchase.document_no,
            "supplier_id": purchase.supplier_id,
            "supplier": supplier_name,
            "purchased_at": purchase.purchased_at.isoformat(),
            "total": str(purchase.total),
        } for purchase, supplier_name in rows],
        "total": total,
        "limit": page.limit,
        "offset": page.offset,
    }


@router.get("/api/payables")
def list_payables(db: Session = Depends(get_db), user: User = Depends(READERS)):
    return payables_summary(db)


@router.get("/api/supplier-payments")
def list_supplier_payments(page: Page = Depends(page_params), db: Session = Depends(get_db),
                           user: User = Depends(READERS)):
    query = (
        select(SupplierPayment, Supplier.name)
        .join(Supplier, Supplier.id == SupplierPayment.supplier_id)
        .order_by(SupplierPayment.paid_at.desc(), SupplierPayment.id.desc())
    )
    rows, total = paginate(db, query, page)
    return {
        "items": [{
            "id": payment.id,
            "supplier": supplier_name,
            "purchase_id": payment.purchase_id,
            "amount": str(payment.amount),
            "method": payment.method,
            "reference": payment.reference,
            "paid_at": payment.paid_at.isoformat(),
        } for payment, supplier_name in rows],
        "total": total,
        "limit": page.limit,
        "offset": page.offset,
    }


@router.post("/api/supplier-payments", status_code=201)
def create_supplier_payment(data: SupplierPaymentInput, db: Session = Depends(get_db),
                            user: User = Depends(require_roles("admin"))):
    payment = record_supplier_payment(db, data=data, user=user)
    db.commit()
    return {"payment_id": payment.id, "amount": str(payment.amount)}

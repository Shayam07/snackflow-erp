"""Sales order, invoice, dispatch, return and payment routes."""
from datetime import date
from decimal import Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, DomainError
from app.core.pagination import Page, page_params, paginate
from app.core.security import get_current_user, require_roles
from app.database import get_db
from app.models import (CreditNote, Customer, Invoice, InvoiceItem, Item, Order, OrderItem,
                        Payment, PaymentAllocation, Product, StockMovement, User)
from app.schemas import OrderCreate, OrderUpdateInput, PaymentInput
from app.services.audit import log_event
from app.services.calculations import gst_split, money
from app.services.inventory import balance, record_movement, weighted_average_cost

router = APIRouter(tags=["sales"])


def _allocated(db: Session, invoice_id: int) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
        .where(PaymentAllocation.invoice_id == invoice_id)
    )
    return Decimal(str(total or 0))


def _credited(db: Session, invoice_id: int) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(CreditNote.amount), 0))
        .where(CreditNote.invoice_id == invoice_id)
    )
    return Decimal(str(total or 0))


@router.post("/api/orders")
def create_order(data: OrderCreate, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("salesman", "admin"))):
    if data.client_request_id:
        existing = db.scalar(select(Order).where(Order.client_request_id == data.client_request_id))
        if existing:
            if user.role == "salesman" and existing.salesman_id != user.id:
                raise ConflictError("This idempotency key belongs to another sales user")
            return {"order_id": existing.id, "status": existing.status, "duplicate": True}
    customer = db.get(Customer, data.customer_id)
    if not customer:
        raise DomainError("Customer not found")
    if user.role == "salesman" and customer.salesman_id not in (None, user.id):
        raise ConflictError("This customer is assigned to another salesman")
    order = Order(customer_id=customer.id, salesman_id=user.id, status="submitted",
                  client_request_id=data.client_request_id,
                  notes=getattr(data, "notes", None))
    db.add(order)
    db.flush()
    for line in data.lines:
        product = db.get(Product, line.product_id)
        if not product:
            raise DomainError("Product not found")
        db.add(OrderItem(order_id=order.id, product_id=product.id,
                         quantity=line.quantity, unit_price=product.selling_price))
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="submitted",
              after={"customer": customer.name, "lines": len(data.lines),
                     "offline": bool(data.client_request_id)})
    db.commit()
    return {"order_id": order.id, "status": order.status}


@router.get("/api/orders")
def list_orders(response: Response, status_filter: str | None = None,
                page: Page = Depends(page_params), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    query = (
        select(Order, Customer.name)
        .join(Customer, Customer.id == Order.customer_id)
        .order_by(Order.created_at.desc(), Order.id.desc())
    )
    if user.role == "salesman":
        query = query.where(Order.salesman_id == user.id)
    if status_filter:
        query = query.where(Order.status == status_filter)

    rows, total = paginate(db, query, page)
    response.headers["X-Total-Count"] = str(total)
    order_ids = [order.id for order, _ in rows]
    lines_by_order: dict[int, list] = {order_id: [] for order_id in order_ids}
    if order_ids:
        line_rows = db.execute(
            select(OrderItem, Item.name)
            .join(Product, Product.id == OrderItem.product_id)
            .join(Item, Item.id == Product.item_id)
            .where(OrderItem.order_id.in_(order_ids))
        ).all()
        for line, item_name in line_rows:
            lines_by_order[line.order_id].append({
                "product_id": line.product_id,
                "product_name": item_name,
                "quantity": line.quantity,
                "unit_price": str(line.unit_price),
            })
    return [{
        "id": order.id,
        "customer_id": order.customer_id,
        "customer_name": customer_name,
        "status": order.status,
        "salesman_id": order.salesman_id,
        "notes": order.notes,
        "created_at": order.created_at.isoformat(),
        "lines": lines_by_order[order.id],
    } for order, customer_name in rows]


@router.put("/api/orders/{order_id}")
def update_order(order_id: int, data: OrderUpdateInput, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "submitted":
        raise ConflictError("Only submitted orders can be edited")
    before_lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
    before = [{"product_id": line.product_id, "quantity": line.quantity,
               "unit_price": str(line.unit_price)} for line in before_lines]
    new_lines = []
    for line in data.lines:
        product = db.get(Product, line.product_id)
        if not product:
            raise DomainError(f"Unknown product {line.product_id}")
        price = product.selling_price if line.unit_price is None else line.unit_price
        new_lines.append(OrderItem(order_id=order.id, product_id=product.id,
                                   quantity=line.quantity, unit_price=money(price)))
    for line in before_lines:
        db.delete(line)
    db.add_all(new_lines)
    order.notes = data.notes
    after = [{"product_id": line.product_id, "quantity": line.quantity,
              "unit_price": str(line.unit_price)} for line in new_lines]
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="edited", before={"lines": before, "notes": order.notes},
              after={"lines": after, "notes": data.notes})
    db.commit()
    return {"order_id": order.id, "status": order.status, "lines": after}


@router.post("/api/orders/{order_id}/approve")
def approve_order(order_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "submitted":
        raise DomainError("Submitted order not found")
    lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()
    shortage = {}
    for line in lines:
        product = db.get(Product, line.product_id)
        available = balance(db, product.item_id)
        if available < Decimal(line.quantity):
            shortage[product.item.name] = str(Decimal(line.quantity) - available)
    if shortage:
        return {"approved": False, "shortage": shortage}
    order.status = "approved"
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="approved", before={"status": "submitted"},
              after={"status": "approved"})
    db.commit()
    return {"approved": True, "order_id": order.id}


@router.post("/api/orders/{order_id}/reject")
def reject_order(order_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "submitted":
        raise ConflictError("Only submitted orders can be rejected")
    before = order.status
    order.status = "rejected"
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="rejected", before={"status": before}, after={"status": "rejected"})
    db.commit()
    return {"order_id": order.id, "status": order.status}


@router.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order:
        raise DomainError("Order not found")
    if order.status not in {"submitted", "approved"}:
        raise ConflictError("Only submitted or approved orders can be cancelled")
    before = order.status
    order.status = "cancelled"
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="cancelled", before={"status": before}, after={"status": "cancelled"})
    db.commit()
    return {"order_id": order.id, "status": order.status}


@router.post("/api/orders/{order_id}/invoice")
def invoice_order(order_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "approved":
        raise ConflictError("Order must be approved before invoicing")
    if db.scalar(select(Invoice).where(Invoice.order_id == order.id)):
        raise ConflictError("Order already invoiced")
    lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
    customer = db.get(Customer, order.customer_id)
    taxable = sum((Decimal(x.quantity) * Decimal(x.unit_price) for x in lines), Decimal("0"))
    cgst = Decimal("0")
    sgst = Decimal("0")
    igst = Decimal("0")
    intra_state = customer.state == "Tamil Nadu"
    for line in lines:
        product = db.get(Product, line.product_id)
        line_taxable = Decimal(line.quantity) * Decimal(line.unit_price)
        line_tax = gst_split(line_taxable, Decimal(product.gst_rate), intra_state)
        cgst += line_tax["cgst"]
        sgst += line_tax["sgst"]
        igst += line_tax["igst"]
    invoice = Invoice(order_id=order.id, invoice_number=next_invoice_number(db, date.today()),
                      place_of_supply=customer.state,
                      gst_type="CGST_SGST" if intra_state else "IGST",
                      taxable_value=money(taxable), cgst=money(cgst), sgst=money(sgst),
                      igst=money(igst), total=money(taxable + cgst + sgst + igst))
    db.add(invoice)
    db.flush()
    for line in lines:
        db.add(InvoiceItem(invoice_id=invoice.id, product_id=line.product_id,
                           quantity=line.quantity, unit_price=line.unit_price,
                           taxable_value=money(Decimal(line.quantity) * Decimal(line.unit_price))))
    order.status = "invoiced"
    log_event(db, user_id=user.id, entity_type="invoice", entity_id=invoice.id,
              action="posted",
              after={"invoice_number": invoice.invoice_number,
                     "total": str(invoice.total), "order_id": order.id})
    db.commit()
    share_text = f"SnackFlow tax invoice {invoice.invoice_number}, total Rs. {invoice.total}"
    return {"invoice_id": invoice.id, "customer_id": customer.id,
            "invoice_number": invoice.invoice_number,
            "taxable": str(invoice.taxable_value), "cgst": str(invoice.cgst),
            "sgst": str(invoice.sgst), "igst": str(invoice.igst), "total": str(invoice.total),
            "whatsapp_share_url": "https://wa.me/?text=" + quote(share_text)}


@router.post("/api/orders/{order_id}/dispatch")
def dispatch_order(order_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "invoiced":
        raise ConflictError("Order must be invoiced before dispatch")
    invoice = db.scalar(select(Invoice).where(Invoice.order_id == order_id))
    if not invoice:
        raise DomainError("Invoice missing for invoiced order")
    lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()
    for line in lines:
        product = db.get(Product, line.product_id)
        if balance(db, product.item_id) < Decimal(line.quantity):
            raise ConflictError("Insufficient stock at dispatch")
    for line in lines:
        product = db.get(Product, line.product_id)
        record_movement(db, item_id=product.item_id, movement_type="dispatch",
                        quantity=-Decimal(line.quantity),
                        unit_cost=weighted_average_cost(db, product.item_id),
                        source_doc_type="invoice", source_doc_id=invoice.id, created_by=user.id)
    order.status = "dispatched"
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="dispatched", after={"status": "dispatched",
                                          "invoice": invoice.invoice_number})
    db.commit()
    return {"order_id": order.id, "status": "dispatched"}


@router.post("/api/orders/{order_id}/return")
def return_order(order_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    """Full sales return: restock dispatched goods and raise a credit note."""
    order = db.get(Order, order_id)
    if not order or order.status != "dispatched":
        raise ConflictError("Only dispatched orders can be returned")
    invoice = db.scalar(select(Invoice).where(Invoice.order_id == order.id).with_for_update())
    if not invoice:
        raise DomainError("Invoice missing for dispatched order")
    if db.scalar(select(CreditNote).where(CreditNote.invoice_id == invoice.id,
                                          CreditNote.stock_returned.is_(True))):
        raise ConflictError("This invoice has already been returned")

    lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
    for line in lines:
        product = db.get(Product, line.product_id)
        dispatch = db.scalar(select(StockMovement).where(
            StockMovement.source_doc_type == "invoice",
            StockMovement.source_doc_id == invoice.id,
            StockMovement.item_id == product.item_id,
            StockMovement.movement_type == "dispatch",
        ))
        if not dispatch:
            raise DomainError(f"Dispatch movement missing for {product.item.name}")
        record_movement(
            db, item_id=product.item_id, movement_type="sales_return",
            quantity=Decimal(line.quantity), unit_cost=Decimal(dispatch.unit_cost),
            source_doc_type="invoice", source_doc_id=invoice.id, created_by=user.id,
            note=f"Sales return for order {order.id}",
        )

    tax = Decimal(invoice.cgst) + Decimal(invoice.sgst) + Decimal(invoice.igst)
    note = CreditNote(
        invoice_id=invoice.id,
        note_number=f"CN/{date.today().year}/{invoice.id:05d}/RET",
        amount=money(Decimal(invoice.total)), reason="Full sales return",
        stock_returned=True, tax_reversed=money(tax),
    )
    db.add(note)
    order.status = "returned"
    log_event(db, user_id=user.id, entity_type="order", entity_id=order.id,
              action="returned", before={"status": "dispatched"},
              after={"status": "returned", "credit_note": note.note_number,
                     "restocked_lines": len(lines), "tax_reversed": str(note.tax_reversed)})
    db.commit()
    return {"order_id": order.id, "status": "returned",
            "credit_note": note.note_number, "amount": str(note.amount),
            "tax_reversed": str(note.tax_reversed)}


@router.post("/api/payments")
def record_payment(data: PaymentInput, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin"))):
    # Lock the invoice row so two concurrent payments cannot both pass the balance check.
    invoice = db.scalar(select(Invoice).where(Invoice.id == data.invoice_id).with_for_update())
    if not invoice:
        raise DomainError("Invoice not found")
    invoice_order = db.get(Order, invoice.order_id)
    if invoice_order.customer_id != data.customer_id:
        raise DomainError("Payment customer does not match invoice customer")
    prior = _allocated(db, invoice.id) + _credited(db, invoice.id)
    if prior + data.amount > Decimal(invoice.total):
        raise ConflictError(
            f"Payment exceeds invoice outstanding ({Decimal(invoice.total) - prior:.2f})"
        )
    payment = Payment(customer_id=data.customer_id, amount=data.amount, reference=data.reference)
    db.add(payment)
    db.flush()
    db.add(PaymentAllocation(payment_id=payment.id, invoice_id=invoice.id, amount=data.amount))
    log_event(db, user_id=user.id, entity_type="invoice", entity_id=invoice.id,
              action="payment_recorded",
              after={"payment_id": payment.id, "amount": str(data.amount),
                     "outstanding": str(Decimal(invoice.total) - prior - data.amount)})
    db.commit()
    return {"payment_id": payment.id,
            "outstanding": str(Decimal(invoice.total) - prior - data.amount)}


@router.get("/api/invoices")
def list_invoices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Invoice register with customer, tax, settled and outstanding amounts."""
    rows = db.execute(
        select(Invoice, Customer.name, Customer.state)
        .join(Order, Order.id == Invoice.order_id)
        .join(Customer, Customer.id == Order.customer_id)
        .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
    ).all()
    allocated = dict(db.execute(
        select(PaymentAllocation.invoice_id, func.sum(PaymentAllocation.amount))
        .group_by(PaymentAllocation.invoice_id)
    ).all())
    credited = dict(db.execute(
        select(CreditNote.invoice_id, func.sum(CreditNote.amount))
        .group_by(CreditNote.invoice_id)
    ).all())
    result = []
    for invoice, customer_name, customer_state in rows:
        paid = Decimal(str(allocated.get(invoice.id) or 0))
        credited_amount = Decimal(str(credited.get(invoice.id) or 0))
        result.append({
            "id": invoice.id,
            "order_id": invoice.order_id,
            "invoice_number": invoice.invoice_number,
            "invoice_date": str(invoice.invoice_date),
            "customer": customer_name,
            "state": customer_state,
            "place_of_supply": invoice.place_of_supply,
            "gst_type": invoice.gst_type,
            "taxable": str(invoice.taxable_value),
            "cgst": str(invoice.cgst),
            "sgst": str(invoice.sgst),
            "igst": str(invoice.igst),
            "total": str(invoice.total),
            "paid": str(paid),
            "credited": str(credited_amount),
            "outstanding": str(money(Decimal(invoice.total) - paid - credited_amount)),
        })
    return result


@router.get("/api/payments")
def list_payments(db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    """Customer receipts allocated against invoices."""
    rows = db.execute(
        select(Payment, PaymentAllocation, Invoice, Customer.name)
        .join(PaymentAllocation, PaymentAllocation.payment_id == Payment.id)
        .join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
        .join(Customer, Customer.id == Payment.customer_id)
        .order_by(Payment.received_at.desc(), Payment.id.desc())
    ).all()
    return [{
        "payment_id": payment.id,
        "payment_date": payment.received_at.strftime("%Y-%m-%d"),
        "customer": customer_name,
        "amount": str(allocation.amount),
        "reference": payment.reference,
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_date": str(invoice.invoice_date),
        "invoice_total": str(invoice.total),
    } for payment, allocation, invoice, customer_name in rows]


@router.get("/api/sales/my-sales")
def salesman_sales(db: Session = Depends(get_db),
                   user: User = Depends(require_roles("salesman"))):
    rows = db.execute(
        select(Customer.name, Item.name, OrderItem.quantity,
               OrderItem.unit_price, Order.created_at, Order.status)
        .join(Order, Order.customer_id == Customer.id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Item, Item.id == Product.item_id)
        .where(Order.salesman_id == user.id)
        .order_by(Order.created_at.desc())
    ).all()
    return [{"customer": row[0], "product": row[1], "quantity": row[2],
             "unit_price": str(row[3]), "created_at": row[4].isoformat(),
             "status": row[5]} for row in rows]


from app.services.benchmark import next_invoice_number  # noqa: E402  (cycle-free late import)

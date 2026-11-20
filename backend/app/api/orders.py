"""Sales order, invoice, dispatch and payment routes."""
import json
from decimal import Decimal
from datetime import date
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User, Customer, Order, OrderItem, Product, Invoice, InvoiceItem,
    AuditLog, Payment, PaymentAllocation, Item,
)
from app.schemas import OrderCreate, OrderUpdateInput, PaymentInput
from app.core.security import get_current_user, require_roles
from app.services.inventory import balance, record_movement, weighted_average_cost
from app.services.calculations import money, gst_split
from app.services.benchmark import next_invoice_number

router = APIRouter(tags=["sales"])

@router.post("/api/orders")
def create_order(data: OrderCreate, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("salesman", "admin"))):
    if data.client_request_id:
        existing = db.scalar(select(Order).where(Order.client_request_id == data.client_request_id))
        if existing:
            if user.role == "salesman" and existing.salesman_id != user.id:
                raise HTTPException(403, "This idempotency key belongs to another sales user")
            return {"order_id": existing.id, "status": existing.status, "duplicate": True}
    customer = db.get(Customer, data.customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    if user.role == "salesman" and customer.salesman_id not in (None, user.id):
        raise HTTPException(403, "This customer is assigned to another salesman")
    order = Order(customer_id=customer.id, salesman_id=user.id, status="submitted",
                  client_request_id=data.client_request_id)
    db.add(order); db.flush()
    for line in data.lines:
        product = db.get(Product, line.product_id)
        if not product:
            db.rollback(); raise HTTPException(404, "Product not found")
        db.add(OrderItem(order_id=order.id, product_id=product.id,
                         quantity=line.quantity, unit_price=product.selling_price))
    db.commit()
    return {"order_id": order.id, "status": order.status}

@router.get("/api/orders")
def list_orders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Order).order_by(Order.created_at.desc())
    if user.role == "salesman":
        query = query.where(Order.salesman_id == user.id)
    rows = db.scalars(query).all()
    result = []
    for order in rows:
        customer = db.get(Customer, order.customer_id)
        lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
        result.append({
            "id": order.id, "customer_id": order.customer_id,
            "customer_name": customer.name, "status": order.status,
            "salesman_id": order.salesman_id,
            "created_at": order.created_at.isoformat(),
            "lines": [{
                "product_id": line.product_id,
                "product_name": db.get(Product, line.product_id).item.name,
                "quantity": line.quantity, "unit_price": str(line.unit_price),
            } for line in lines],
        })
    return result

@router.put("/api/orders/{order_id}")
def update_order(order_id: int, data: OrderUpdateInput,
                 db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "submitted":
        raise HTTPException(409, "Only submitted orders can be edited")
    before_lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)).all()
    before = [{"product_id": line.product_id, "quantity": line.quantity,
               "unit_price": str(line.unit_price)} for line in before_lines]
    try:
        new_lines = []
        for line in data.lines:
            product = db.get(Product, line.product_id)
            if not product:
                raise ValueError(f"Unknown product {line.product_id}")
            price = product.selling_price if line.unit_price is None else line.unit_price
            new_lines.append(OrderItem(order_id=order.id, product_id=product.id,
                                       quantity=line.quantity, unit_price=money(price)))
        for line in before_lines:
            db.delete(line)
        db.add_all(new_lines)
        order.notes = data.notes
        after = [{"product_id": line.product_id, "quantity": line.quantity,
                  "unit_price": str(line.unit_price)} for line in new_lines]
        db.add(AuditLog(user_id=user.id, entity_type="order", entity_id=order.id,
                        action="edited", before_json=json.dumps({"lines": before}),
                        after_json=json.dumps({"lines": after, "notes": data.notes})))
        db.commit()
        return {"order_id": order.id, "status": order.status, "lines": after}
    except Exception as exc:
        db.rollback()
        raise HTTPException(400, str(exc))

@router.post("/api/orders/{order_id}/approve")
def approve_order(order_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "submitted":
        raise HTTPException(404, "Submitted order not found")
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
    db.add(AuditLog(user_id=user.id, entity_type="order", entity_id=order.id,
                    action="approved", after_json='{"status":"approved"}'))
    db.commit()
    return {"approved": True, "order_id": order.id}


@router.post("/api/orders/{order_id}/reject")
def reject_order(order_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "submitted":
        raise HTTPException(409, "Only submitted orders can be rejected")
    before = order.status
    order.status = "rejected"
    db.add(AuditLog(user_id=user.id, entity_type="order", entity_id=order.id,
                    action="rejected", before_json=f'{{"status":"{before}"}}',
                    after_json='{"status":"rejected"}'))
    db.commit()
    return {"order_id": order.id, "status": order.status}

@router.post("/api/orders/{order_id}/invoice")
def invoice_order(order_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "approved":
        raise HTTPException(409, "Order must be approved before invoicing")
    existing = db.scalar(select(Invoice).where(Invoice.order_id == order.id))
    if existing:
        raise HTTPException(409, "Order already invoiced")
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
                      igst=money(igst), total=money(taxable+cgst+sgst+igst))
    db.add(invoice); db.flush()
    for line in lines:
        db.add(InvoiceItem(invoice_id=invoice.id, product_id=line.product_id,
                           quantity=line.quantity, unit_price=line.unit_price,
                           taxable_value=money(Decimal(line.quantity)*Decimal(line.unit_price))))
    order.status = "invoiced"
    db.add(AuditLog(user_id=user.id, entity_type="invoice", entity_id=invoice.id,
                    action="posted", after_json='{"posted":true}'))
    db.commit()
    share_text = f"SnackFlow tax invoice {invoice.invoice_number}, total Rs. {invoice.total}"
    return {"invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
            "taxable": str(invoice.taxable_value), "cgst": str(invoice.cgst),
            "sgst": str(invoice.sgst), "igst": str(invoice.igst), "total": str(invoice.total),
            "whatsapp_share_url": "https://wa.me/?text=" + quote(share_text)}

@router.post("/api/orders/{order_id}/dispatch")
def dispatch_order(order_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin"))):
    order = db.get(Order, order_id)
    if not order or order.status != "invoiced":
        raise HTTPException(409, "Order must be invoiced before dispatch")
    invoice = db.scalar(select(Invoice).where(Invoice.order_id == order_id))
    # Idempotent state guard plus unique invoice/order relationship.
    lines = db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()
    for line in lines:
        product = db.get(Product, line.product_id)
        if balance(db, product.item_id) < Decimal(line.quantity):
            db.rollback(); raise HTTPException(409, "Insufficient stock at dispatch")
    for line in lines:
        product = db.get(Product, line.product_id)
        record_movement(db, item_id=product.item_id, movement_type="dispatch",
                        quantity=-Decimal(line.quantity), unit_cost=weighted_average_cost(db, product.item_id),
                        source_doc_type="invoice", source_doc_id=invoice.id, created_by=user.id)
    order.status = "dispatched"
    db.commit()
    return {"order_id": order.id, "status": "dispatched"}

@router.post("/api/payments")
def record_payment(data: PaymentInput, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin"))):
    invoice = db.get(Invoice, data.invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    invoice_order = db.get(Order, invoice.order_id)
    if invoice_order.customer_id != data.customer_id:
        raise HTTPException(400, "Payment customer does not match invoice customer")
    allocated = db.scalar(select(PaymentAllocation).where(PaymentAllocation.invoice_id == invoice.id))
    prior = sum((Decimal(x.amount) for x in db.scalars(select(PaymentAllocation).where(
        PaymentAllocation.invoice_id == invoice.id)).all()), Decimal("0"))
    if prior + data.amount > invoice.total:
        raise HTTPException(400, "Payment exceeds invoice outstanding")
    payment = Payment(customer_id=data.customer_id, amount=data.amount, reference=data.reference)
    db.add(payment); db.flush()
    db.add(PaymentAllocation(payment_id=payment.id, invoice_id=invoice.id, amount=data.amount))
    db.commit()
    return {"payment_id": payment.id, "outstanding": str(invoice.total-prior-data.amount)}



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


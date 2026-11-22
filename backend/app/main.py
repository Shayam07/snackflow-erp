"""SnackFlow ERP API: authentication, purchasing, invoicing and reporting."""
import io
import logging
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from time import monotonic

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.audit import router as audit_router
from app.api.inventory import router as inventory_router
from app.api.masters import router as masters_router
from app.api.orders import router as orders_router
from app.api.payables import router as payables_router
from app.api.production import router as production_router
from app.core.config import settings
from app.core.errors import ConflictError, DomainError
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.security import (create_access_token, get_current_user, require_roles,
                               verify_password)
from app.database import Base, engine, get_db
from app.models import (AuditLog, CreditNote, Customer, Invoice, InvoiceItem, Item, MaterialIssue,
                        Order, OrderItem, PaymentAllocation, Product, Purchase, PurchaseItem,
                        StockMovement, Supplier, User)
from app.reporting import (collections_report, customer_sales, filter_date_range, gst_summary,
                           pdf_bytes, product_sales, production_report, purchase_register,
                           xlsx_bytes)
from app.reports import (audit_register, csv_bytes, payables_register, sales_register,
                         stock_ledger, stock_summary)
from app.schemas import CreditNoteInput, LoginInput, PurchaseCreate
from app.services.audit import log_event
from app.services.calculations import money
from app.services.inventory import record_movement
from app.services.payables import payables_summary

logger = logging.getLogger("snackflow")

REPORTS = {
    "sales": sales_register,
    "stock": stock_summary,
    "ledger": stock_ledger,
    "purchases": purchase_register,
    "gst": gst_summary,
    "production": production_report,
    "collections": collections_report,
    "customer-sales": customer_sales,
    "product-sales": product_sales,
    "audit": audit_register,
    "payables": payables_register,
}

# Simple in-process login throttle. A shared store (Redis) would be needed for multi-worker use.
_login_attempts: dict[str, deque[float]] = defaultdict(deque)


def _login_allowed(key: str) -> bool:
    window = _login_attempts[key]
    cutoff = monotonic() - settings.login_window_seconds
    while window and window[0] < cutoff:
        window.popleft()
    return len(window) < settings.login_max_attempts


@asynccontextmanager
async def lifespan(application: FastAPI):
    configure_logging()
    Base.metadata.create_all(bind=engine)
    logger.info("SnackFlow ERP starting in %s mode", settings.app_env)
    yield


app = FastAPI(title="SnackFlow ERP", version="1.1.0",
              description="Order-to-audit ERP for small food manufacturers",
              lifespan=lifespan)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "Content-Disposition", "X-Request-ID"],
)
for router in (production_router, orders_router, masters_router, inventory_router,
               audit_router, payables_router):
    app.include_router(router)


@app.exception_handler(ConflictError)
async def conflict_handler(request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": str(exc), "code": "conflict"})


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=400, content={"detail": str(exc), "code": "invalid_operation"})


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    logger.warning("Database integrity error on %s: %s", request.url.path, exc.orig)
    return JSONResponse(status_code=409,
                        content={"detail": "Operation conflicts with existing records",
                                 "code": "conflict"})


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "application": "SnackFlow ERP", "environment": settings.app_env}


@app.post("/api/auth/login")
def login(data: LoginInput, request: Request, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else '-'}:{data.username.lower()}"
    if not _login_allowed(key):
        logger.warning("Login throttled for %s", data.username)
        raise HTTPException(429, "Too many failed login attempts. Try again shortly.")
    user = db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.password_hash):
        _login_attempts[key].append(monotonic())
        logger.warning("Failed login for %s", data.username)
        raise HTTPException(401, "Incorrect username or password")
    if not user.is_active:
        logger.warning("Disabled account login for %s", data.username)
        raise HTTPException(403, "This account is disabled")
    _login_attempts.pop(key, None)
    logger.info("Login succeeded for %s (%s)", user.username, user.role)
    log_event(db, user_id=user.id, entity_type="session", entity_id=user.id,
              action="login", after={"username": user.username, "role": user.role})
    db.commit()
    return {"access_token": create_access_token(user.id), "token_type": "bearer",
            "role": user.role, "username": user.username}


@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "role": user.role}


@app.post("/api/purchases")
def create_purchase(data: PurchaseCreate, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("admin", "production"))):
    supplier = db.get(Supplier, data.supplier_id)
    if not supplier:
        raise DomainError("Supplier not found")
    if db.scalar(select(Purchase.id).where(Purchase.document_no == data.document_no)):
        raise ConflictError("That supplier document number is already recorded")
    purchase = Purchase(supplier_id=supplier.id, document_no=data.document_no)
    db.add(purchase)
    db.flush()
    purchase_total = Decimal("0")
    for line in data.lines:
        item = db.get(Item, line.item_id)
        if not item or item.item_type == "finished":
            raise DomainError("Purchase line must reference a raw or packaging item")
        db.add(PurchaseItem(purchase_id=purchase.id, item_id=item.id,
                            quantity=line.quantity, unit_cost=line.unit_cost))
        purchase_total += line.quantity * line.unit_cost
        record_movement(db, item_id=item.id, movement_type="purchase",
                        quantity=line.quantity, unit_cost=line.unit_cost,
                        source_doc_type="purchase", source_doc_id=purchase.id,
                        created_by=user.id)
    purchase.total = money(purchase_total)
    log_event(db, user_id=user.id, entity_type="purchase", entity_id=purchase.id,
              action="posted",
              after={"document_no": purchase.document_no, "supplier": supplier.name,
                     "total": str(purchase.total), "lines": len(data.lines)})
    db.commit()
    return {"purchase_id": purchase.id, "total": str(purchase.total), "status": "posted"}


@app.post("/api/invoices/{invoice_id}/credit-note")
def create_credit_note(invoice_id: int, data: CreditNoteInput, db: Session = Depends(get_db),
                       user: User = Depends(require_roles("admin"))):
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    if not invoice:
        raise DomainError("Invoice not found")
    paid = Decimal(str(db.scalar(
        select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
        .where(PaymentAllocation.invoice_id == invoice.id)) or 0))
    credited = Decimal(str(db.scalar(
        select(func.coalesce(func.sum(CreditNote.amount), 0))
        .where(CreditNote.invoice_id == invoice.id)) or 0))
    if credited + data.amount > Decimal(invoice.total):
        raise ConflictError("Credit note amount exceeds invoice value")
    if data.restock and db.scalar(select(CreditNote).where(
            CreditNote.invoice_id == invoice.id, CreditNote.stock_returned.is_(True))):
        raise ConflictError("This invoice has already been restocked")

    stock_returned = False
    if data.restock:
        order = db.get(Order, invoice.order_id)
        if not order or order.status != "dispatched":
            raise ConflictError("Only dispatched orders can be restocked")
        for line in db.scalars(
                select(OrderItem).where(OrderItem.order_id == order.id)).all():
            product = db.get(Product, line.product_id)
            dispatch = db.scalar(select(StockMovement).where(
                StockMovement.source_doc_type == "invoice",
                StockMovement.source_doc_id == invoice.id,
                StockMovement.item_id == product.item_id,
                StockMovement.movement_type == "dispatch",
            ))
            if not dispatch:
                raise DomainError(f"Dispatch movement missing for {product.item.name}")
            record_movement(db, item_id=product.item_id, movement_type="sales_return",
                            quantity=Decimal(line.quantity), unit_cost=Decimal(dispatch.unit_cost),
                            source_doc_type="invoice", source_doc_id=invoice.id,
                            created_by=user.id, note=f"Credit note {invoice.invoice_number}")
        order.status = "returned"
        stock_returned = True

    tax = Decimal(invoice.cgst) + Decimal(invoice.sgst) + Decimal(invoice.igst)
    tax_reversed = (money(tax * Decimal(data.amount) / Decimal(invoice.total))
                    if Decimal(invoice.total) else Decimal("0.00"))
    note_count = db.scalar(select(func.count(CreditNote.id))
                           .where(CreditNote.invoice_id == invoice.id)) or 0
    note = CreditNote(
        invoice_id=invoice.id,
        note_number=f"CN/{date.today().year}/{invoice.id:05d}/{note_count + 1:02d}",
        amount=money(data.amount), reason=data.reason,
        stock_returned=stock_returned, tax_reversed=tax_reversed,
    )
    db.add(note)
    log_event(db, user_id=user.id, entity_type="invoice", entity_id=invoice.id,
              action="credit_note_issued",
              after={"credit_amount": str(data.amount), "reason": data.reason,
                     "tax_reversed": str(tax_reversed), "stock_returned": stock_returned,
                     "net_outstanding": str(Decimal(invoice.total) - paid - credited - data.amount)})
    db.commit()
    return {"credit_note_id": note.id, "amount": str(note.amount),
            "tax_reversed": str(note.tax_reversed), "stock_returned": note.stock_returned,
            "net_outstanding": str(Decimal(invoice.total) - paid - credited - note.amount)}


@app.get("/api/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "auditor", "owner"))):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise DomainError("Invoice not found")
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.setTitle(invoice.invoice_number)
    order = db.get(Order, invoice.order_id)
    customer = db.get(Customer, order.customer_id)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(50, 790, "SnackFlow ERP - Tax Invoice")
    pdf.setFont("Helvetica", 10)
    lines = [f"Supplier GSTIN (demo placeholder): 33AAAAA0000A1Z5",
             f"Invoice: {invoice.invoice_number}", f"Date: {invoice.invoice_date}",
             f"Bill to: {customer.name} | GSTIN: {customer.gstin or 'Unregistered'}",
             f"Place of supply: {invoice.place_of_supply} | Tax type: {invoice.gst_type}"]
    for line in db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all():
        product = db.get(Product, line.product_id)
        lines.append(f"HSN {product.item.hsn_code} | {product.item.name} | Qty {line.quantity} "
                     f"| Rate Rs. {line.unit_price} | Taxable Rs. {line.taxable_value}")
    lines += [f"Taxable value: Rs. {invoice.taxable_value}",
              f"CGST: Rs. {invoice.cgst}", f"SGST: Rs. {invoice.sgst}",
              f"IGST: Rs. {invoice.igst}", f"Total: Rs. {invoice.total}"]
    y = 750
    for line in lines:
        pdf.drawString(50, y, line)
        y -= 25
    pdf.save()
    buffer.seek(0)
    return Response(buffer.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={invoice.invoice_number}.pdf"})


def _report_rows(report_name: str, db: Session, date_from, date_to, user):
    if user.role not in {"admin", "auditor", "owner"}:
        raise HTTPException(403, "Insufficient role permissions")
    if report_name not in REPORTS:
        raise HTTPException(404, "Unknown report")
    return filter_date_range(REPORTS[report_name](db), date_from, date_to)


@app.get("/api/reports/export/{report_name}.csv")
def export_csv(report_name: str, date_from: date | None = Query(default=None),
               date_to: date | None = Query(default=None), db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    rows = _report_rows(report_name, db, date_from, date_to, user)
    return StreamingResponse(iter([csv_bytes(rows)]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={report_name}.csv"})


@app.get("/api/reports/export/{report_name}.xlsx")
def export_xlsx(report_name: str, date_from: date | None = Query(default=None),
                date_to: date | None = Query(default=None), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    rows = _report_rows(report_name, db, date_from, date_to, user)
    return Response(xlsx_bytes(rows),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={report_name}.xlsx"})


@app.get("/api/reports/export/{report_name}.pdf")
def export_report_pdf(report_name: str, date_from: date | None = Query(default=None),
                      date_to: date | None = Query(default=None), db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    rows = _report_rows(report_name, db, date_from, date_to, user)
    return Response(pdf_bytes(report_name.title() + " Report", rows), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={report_name}.pdf"})


@app.get("/api/reports")
def list_reports(user: User = Depends(require_roles("admin", "auditor", "owner"))):
    return [{"key": key, "title": key.replace("-", " ").title()} for key in REPORTS]


@app.get("/api/reports/{report_name}")
def get_report(report_name: str, date_from: date | None = Query(default=None),
               date_to: date | None = Query(default=None), db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    return _report_rows(report_name, db, date_from, date_to, user)


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db),
              user: User = Depends(require_roles("owner", "admin"))):
    today_orders = db.query(Order).filter(Order.created_at >= date.today()).count()
    open_orders = db.query(Order).filter(
        Order.status.in_(["submitted", "approved", "invoiced"])).count()
    payables = payables_summary(db)
    recent = db.execute(
        select(AuditLog, User.username)
        .join(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.id.desc()).limit(8)
    ).all()
    return {
        "today_orders": today_orders,
        "open_orders": open_orders,
        "stock": stock_summary(db),
        "variance_alerts": db.query(MaterialIssue).filter(MaterialIssue.flagged.is_(True)).count(),
        "payables_outstanding": str(sum((Decimal(row["outstanding"]) for row in payables),
                                        Decimal("0.00"))),
        "suppliers_with_dues": sum(1 for row in payables if Decimal(row["outstanding"]) > 0),
        "receivable_outstanding": str(sum(
            (Decimal(row["outstanding"]) for row in sales_register(db)), Decimal("0.00"))),
        "recent_activity": [{
            "id": entry.id,
            "at": entry.created_at.isoformat(),
            "actor": username,
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "action": entry.action,
        } for entry, username in recent],
    }

from datetime import date, datetime
from decimal import Decimal
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from contextlib import asynccontextmanager
from urllib.parse import quote
from sqlalchemy import select
from sqlalchemy.orm import Session
from reportlab.pdfgen import canvas
import io
import json
from app.database import Base, engine, get_db
from app.models import (User, Item, Product, Customer, Supplier, Recipe, RecipeItem,
                        Order, OrderItem, Invoice, InvoiceItem, Payment, PaymentAllocation,
                        Purchase, PurchaseItem, StockMovement, ProductionRun, MaterialIssue,
                        ProductionCost, AuditLog)
from app.schemas import LoginInput, OrderCreate, PaymentInput, PurchaseCreate, ProductionCreate, ProductionCostInput, CreditNoteInput, OrderUpdateInput
from app.core.security import verify_password, create_access_token, get_current_user, require_roles
from app.services.inventory import balance, record_movement, weighted_average_cost
from app.services.calculations import money, gst_split
from app.services.benchmark import next_invoice_number
from app.api.production import router as production_router
from app.api.orders import router as orders_router
from app.reports import stock_summary, stock_ledger, sales_register, csv_bytes
from app.reporting import (purchase_register, gst_summary, production_report, collections_report,
                           customer_sales, product_sales, filter_date_range, xlsx_bytes, pdf_bytes)

@asynccontextmanager
async def lifespan(application: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="SnackFlow ERP", version="1.0.0",
              description="Order-to-Audit ERP for small food manufacturers", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(production_router)
app.include_router(orders_router)

@app.get("/api/health")
def health():
    return {"status": "ok", "application": "SnackFlow ERP"}

@app.post("/api/auth/login")
def login(data: LoginInput, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Incorrect username or password")
    return {"access_token": create_access_token(user.id), "token_type": "bearer",
            "role": user.role, "username": user.username}

@app.get("/api/auth/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "role": user.role}

@app.get("/api/masters")
def masters(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {
        "items": [{"id": x.id, "name": x.name, "type": x.item_type, "unit": x.base_unit}
                  for x in db.scalars(select(Item)).all()],
        "products": [{"id": x.id, "name": x.item.name, "family": x.family,
                      "pack_size_g": x.pack_size_g, "price": str(x.selling_price)}
                     for x in db.scalars(select(Product)).all()],
        "customers": [{"id": x.id, "name": x.name, "state": x.state}
                      for x in db.scalars(select(Customer)).all()],
        "suppliers": [{"id": x.id, "name": x.name, "state": x.state}
                      for x in db.scalars(select(Supplier)).all()],
        "recipes": [{"id": recipe.id, "family": recipe.family,
                     "expected_packets": recipe.expected_packets,
                     "items": [{"item_id": ri.item_id, "name": ri.item.name,
                                "unit": ri.item.base_unit, "planned_quantity": str(ri.quantity)}
                               for ri in db.scalars(select(RecipeItem).where(RecipeItem.recipe_id == recipe.id)).all()]}
                    for recipe in db.scalars(select(Recipe).where(Recipe.active == True)).all()],
    }

@app.post("/api/purchases")
def create_purchase(data: PurchaseCreate, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("admin", "production"))):
    try:
        purchase = Purchase(supplier_id=data.supplier_id, document_no=data.document_no)
        db.add(purchase); db.flush()
        purchase_total = Decimal("0")
        for line in data.lines:
            item = db.get(Item, line.item_id)
            if not item or item.item_type == "finished":
                raise ValueError("Purchase line must reference a raw or packaging item")
            db.add(PurchaseItem(purchase_id=purchase.id, item_id=item.id,
                                quantity=line.quantity, unit_cost=line.unit_cost))
            purchase_total += line.quantity * line.unit_cost
            record_movement(db, item_id=item.id, movement_type="purchase",
                            quantity=line.quantity, unit_cost=line.unit_cost,
                            source_doc_type="purchase", source_doc_id=purchase.id,
                            created_by=user.id)
        purchase.total = money(purchase_total)
        db.commit()
        return {"purchase_id": purchase.id, "total": str(purchase.total), "status": "posted"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(400, str(exc))

@app.get("/api/inventory/summary")
def inventory_summary(db: Session = Depends(get_db),
                      user: User = Depends(require_roles("admin", "production", "auditor", "owner"))):
    return stock_summary(db)

@app.get("/api/inventory/ledger")
def inventory_ledger(db: Session = Depends(get_db),
                     user: User = Depends(require_roles("admin", "production", "auditor", "owner"))):
    return stock_ledger(db)

@app.get("/api/reports/sales")
def sales_report(db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin", "auditor", "owner"))):
    return sales_register(db)

@app.get("/api/reports/stock")
def stock_report(db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin", "auditor", "owner"))):
    return stock_summary(db)

@app.get("/api/reports/export/{report_name}.csv")
def export_csv(report_name: str, date_from: date | None = Query(default=None),
               date_to: date | None = Query(default=None), db: Session = Depends(get_db),
               user: User = Depends(require_roles("admin", "auditor", "owner"))):
    reports = {"sales": sales_register, "stock": stock_summary, "ledger": stock_ledger,
               "purchases": purchase_register, "gst": gst_summary,
               "production": production_report, "collections": collections_report,
               "customer-sales": customer_sales, "product-sales": product_sales}
    if report_name not in reports:
        raise HTTPException(404, "Unknown report")
    data = csv_bytes(filter_date_range(reports[report_name](db), date_from, date_to))
    return StreamingResponse(iter([data]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={report_name}.csv"})


@app.post("/api/invoices/{invoice_id}/credit-note")
def create_credit_note(invoice_id: int, data: CreditNoteInput,
                       db: Session = Depends(get_db),
                       user: User = Depends(require_roles("admin"))):
    from app.models import CreditNote
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    paid = sum((Decimal(x.amount) for x in db.scalars(
        select(PaymentAllocation).where(PaymentAllocation.invoice_id == invoice.id)).all()), Decimal("0"))
    credited = sum((Decimal(x.amount) for x in db.scalars(
        select(CreditNote).where(CreditNote.invoice_id == invoice.id)).all()), Decimal("0"))
    if credited + data.amount > invoice.total:
        raise HTTPException(400, "Credit note amount exceeds invoice value")
    note_count = len(db.scalars(select(CreditNote).where(CreditNote.invoice_id == invoice.id)).all())
    note = CreditNote(invoice_id=invoice.id,
                      note_number=f"CN/{date.today().year}/{invoice.id:05d}/{note_count+1:02d}",
                      amount=money(data.amount), reason=data.reason)
    db.add(note)
    db.add(AuditLog(user_id=user.id, entity_type="invoice", entity_id=invoice.id,
                    action="credit_note_issued", after_json=f'{{"credit_amount":"{data.amount}"}}'))
    db.commit()
    return {"credit_note_id": note.id, "amount": str(note.amount),
            "net_outstanding": str(invoice.total-paid-credited-note.amount)}

@app.get("/api/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "auditor", "owner"))):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.setTitle(invoice.invoice_number)
    order = db.get(Order, invoice.order_id)
    customer = db.get(Customer, order.customer_id)
    pdf.setFont("Helvetica-Bold", 18); pdf.drawString(50, 790, "SnackFlow ERP - Tax Invoice")
    pdf.setFont("Helvetica", 10)
    lines = [f"Supplier GSTIN (demo placeholder): 33AAAAA0000A1Z5",
             f"Invoice: {invoice.invoice_number}", f"Date: {invoice.invoice_date}",
             f"Bill to: {customer.name} | GSTIN: {customer.gstin or 'Unregistered'}",
             f"Place of supply: {invoice.place_of_supply} | Tax type: {invoice.gst_type}"]
    for line in db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all():
        product = db.get(Product, line.product_id)
        lines.append(f"HSN {product.item.hsn_code} | {product.item.name} | Qty {line.quantity} | Rate Rs. {line.unit_price} | Taxable Rs. {line.taxable_value}")
    lines += [f"Taxable value: Rs. {invoice.taxable_value}",
             f"CGST: Rs. {invoice.cgst}", f"SGST: Rs. {invoice.sgst}",
             f"IGST: Rs. {invoice.igst}", f"Total: Rs. {invoice.total}"]
    y = 750
    for line in lines:
        pdf.drawString(50, y, line); y -= 25
    pdf.save(); buffer.seek(0)
    return Response(buffer.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={invoice.invoice_number}.pdf"})


@app.get("/api/reports/{report_name}")
def get_report(report_name: str, date_from: date | None = Query(default=None),
               date_to: date | None = Query(default=None), db: Session = Depends(get_db),
               user: User = Depends(require_roles("admin", "auditor", "owner"))):
    reports = {"sales": sales_register, "stock": stock_summary, "ledger": stock_ledger,
               "purchases": purchase_register, "gst": gst_summary,
               "production": production_report, "collections": collections_report,
               "customer-sales": customer_sales, "product-sales": product_sales}
    if report_name not in reports:
        raise HTTPException(404, "Unknown report")
    return filter_date_range(reports[report_name](db), date_from, date_to)

@app.get("/api/reports/export/{report_name}.xlsx")
def export_xlsx(report_name: str, date_from: date | None = Query(default=None),
                date_to: date | None = Query(default=None), db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "auditor", "owner"))):
    reports = {"sales": sales_register, "stock": stock_summary, "ledger": stock_ledger,
               "purchases": purchase_register, "gst": gst_summary,
               "production": production_report, "collections": collections_report,
               "customer-sales": customer_sales, "product-sales": product_sales}
    if report_name not in reports:
        raise HTTPException(404, "Unknown report")
    rows = filter_date_range(reports[report_name](db), date_from, date_to)
    return Response(xlsx_bytes(rows),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={report_name}.xlsx"})

@app.get("/api/reports/export/{report_name}.pdf")
def export_report_pdf(report_name: str, date_from: date | None = Query(default=None),
                      date_to: date | None = Query(default=None), db: Session = Depends(get_db),
                      user: User = Depends(require_roles("admin", "auditor", "owner"))):
    reports = {"sales": sales_register, "stock": stock_summary, "ledger": stock_ledger,
               "purchases": purchase_register, "gst": gst_summary,
               "production": production_report, "collections": collections_report,
               "customer-sales": customer_sales, "product-sales": product_sales}
    if report_name not in reports:
        raise HTTPException(404, "Unknown report")
    rows = filter_date_range(reports[report_name](db), date_from, date_to)
    return Response(pdf_bytes(report_name.title() + " Report", rows),
                    media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={report_name}.pdf"})

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db),
               user: User = Depends(require_roles("owner", "admin"))):
    today_orders = db.query(Order).filter(Order.created_at >= date.today()).count()
    return {"today_orders": today_orders, "stock": stock_summary(db),
            "variance_alerts": db.query(MaterialIssue).filter(MaterialIssue.flagged == True).count()}



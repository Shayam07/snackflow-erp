from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import select
from app.models import (Invoice, Purchase, ProductionRun, MaterialIssue, ProductionCost,
                        Payment, PaymentAllocation, Customer, Item, StockMovement, Order, CreditNote, Supplier)
from app.services.inventory import balance

def purchase_register(db):
    return [{"purchase_id": p.id, "document_no": p.document_no,
             "supplier": db.get(Supplier, p.supplier_id).name,
             "date": p.purchased_at.isoformat(), "total": str(p.total)}
            for p in db.scalars(select(Purchase)).all()]

def gst_summary(db):
    invoices = db.scalars(select(Invoice).where(Invoice.posted == True)).all()
    return [{"date": str(i.invoice_date), "return_period": i.invoice_date.strftime("%m-%Y"), "invoice": i.invoice_number,
             "place_of_supply": i.place_of_supply, "supply_type": i.gst_type,
             "taxable_value": str(i.taxable_value), "cgst": str(i.cgst),
             "sgst": str(i.sgst), "igst": str(i.igst), "invoice_value": str(i.total)}
            for i in invoices]

def production_report(db):
    result = []
    for run in db.scalars(select(ProductionRun)).all():
        issues = db.scalars(select(MaterialIssue).where(MaterialIssue.run_id == run.id)).all()
        result.append({"date": run.created_at.date().isoformat(), "run": run.run_key,
                       "expected_output": run.expected_output, "actual_output": run.actual_output,
                       "yield_variance_percent": str(run.yield_variance_percent),
                       "capacity_mismatch": run.capacity_mismatch,
                       "material_variances": "; ".join(
                           f"{db.get(Item, x.item_id).name}: {x.variance_percent}%"
                           for x in issues)})
    return result

def collections_report(db):
    rows = []
    invoices = db.scalars(select(Invoice)).all()
    for inv in invoices:
        allocations = db.scalars(select(PaymentAllocation).where(PaymentAllocation.invoice_id == inv.id)).all()
        paid = sum((Decimal(a.amount) for a in allocations), Decimal("0"))
        credited = sum((Decimal(c.amount) for c in db.scalars(
            select(CreditNote).where(CreditNote.invoice_id == inv.id)).all()), Decimal("0"))
        order_customer = db.get(Customer, db.get(Order, inv.order_id).customer_id)
        age = (date.today()-inv.invoice_date).days
        bucket = "0-30" if age <= 30 else "31-60" if age <= 60 else "61-90" if age <= 90 else "90+"
        rows.append({"date": str(inv.invoice_date), "customer": order_customer.name, "invoice": inv.invoice_number,
                     "invoice_total": str(inv.total), "collected": str(paid),
                     "credited": str(credited), "outstanding": str(inv.total-paid-credited),
                     "age_days": age, "age_bucket": bucket})
    return rows

def xlsx_bytes(rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"
    if rows:
        ws.append(list(rows[0].keys()))
        for row in rows:
            ws.append(list(row.values()))
    buf = BytesIO(); wb.save(buf); return buf.getvalue()

def pdf_bytes(title, rows):
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    pdf.setTitle(title)
    y = 800
    pdf.setFont("Helvetica-Bold", 16); pdf.drawString(40, y, title); y -= 30
    if rows:
        keys = list(rows[0].keys())
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(40, y, " | ".join(keys)[:140]); y -= 18
        pdf.setFont("Helvetica", 7)
        for row in rows:
            line = " | ".join(str(v) for v in row.values())
            pdf.drawString(40, y, line[:145]); y -= 14
            if y < 50:
                pdf.showPage(); y = 800; pdf.setFont("Helvetica", 7)
    pdf.save(); buf.seek(0); return buf.getvalue()


def customer_sales(db):
    rows = []
    for invoice in db.scalars(select(Invoice)).all():
        order = db.get(Order, invoice.order_id)
        customer = db.get(Customer, order.customer_id)
        rows.append({"date": str(invoice.invoice_date), "customer": customer.name,
                     "invoice": invoice.invoice_number, "taxable_sales": str(invoice.taxable_value)})
    return rows

def product_sales(db):
    from app.models import InvoiceItem, Product
    rows = []
    for line in db.scalars(select(InvoiceItem)).all():
        invoice = db.get(Invoice, line.invoice_id)
        product = db.get(Product, line.product_id)
        rows.append({"date": str(invoice.invoice_date), "invoice": invoice.invoice_number,
                     "product": product.item.name, "packets_sold": line.quantity,
                     "taxable_sales": str(line.taxable_value)})
    return rows

def filter_date_range(rows, date_from=None, date_to=None):
    if not date_from and not date_to:
        return rows
    filtered = []
    for row in rows:
        raw = row.get("date") or row.get("created_at")
        if not raw:
            # Some aggregate reports do not have a single transaction date.
            filtered.append(row)
            continue
        value = str(raw)[:10]
        if date_from and value < date_from.isoformat():
            continue
        if date_to and value > date_to.isoformat():
            continue
        filtered.append(row)
    return filtered

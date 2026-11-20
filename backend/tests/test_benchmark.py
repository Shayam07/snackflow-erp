from decimal import Decimal
import pytest
from sqlalchemy import select
from fastapi.testclient import TestClient

from app.models import StockMovement, ProductionRun, MaterialIssue, ProductionCost, Invoice, PaymentAllocation
from app.services.inventory import balance, weighted_average_cost, inventory_value
from app.services.calculations import weighted_average, variance_percent, gst_split
from app.services.units import convert
from app.database import get_db
from app.core.security import get_current_user
from scripts.benchmark_scenario import run_scenario

def test_units_conversion():
    assert convert(Decimal("40"), "kg", "g") == Decimal("40000")
    assert convert(Decimal("1.5"), "litre", "ml") == Decimal("1500")
    assert convert(Decimal("3"), "carton", "packet", 20) == Decimal("60")
    with pytest.raises(ValueError):
        convert(Decimal("1"), "kg", "litre")

def test_weighted_average_arithmetic():
    assert weighted_average(Decimal("100"), Decimal("4200"), Decimal("60"), Decimal("45")) == Decimal("43.125")

def test_bom_variance_and_gst():
    assert variance_percent(Decimal("188"), Decimal("200")) == Decimal("-6.000")
    assert variance_percent(Decimal("10.5"), Decimal("10")) == Decimal("5.000")
    assert gst_split(Decimal("7500"), Decimal("5"), True) == {
        "cgst": Decimal("187.50"), "sgst": Decimal("187.50"), "igst": Decimal("0.00")}
    assert gst_split(Decimal("7500"), Decimal("5"), False)["igst"] == Decimal("375.00")

def test_invoice_numbering(db):
    from datetime import date
    from app.services.benchmark import next_invoice_number
    assert next_invoice_number(db, date(2026, 11, 20)).endswith("00001")
    assert next_invoice_number(db, date(2026, 11, 20)).endswith("00002")

def test_benchmark_through_real_api_endpoints(db, seeded):
    from app.main import app
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            result = run_scenario(client)
            admin = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
            client.headers["Authorization"] = f"Bearer {admin['access_token']}"
            duplicate = client.post("/api/production/runs", json={
                "run_key": "BENCH-API-RUN-001", "product_id": seeded["product"].id,
                "actual_output": 188, "damaged_pouches": 6, "cartons_used": 9, "issues": [],
            })
            assert duplicate.status_code == 409
            assert Decimal(result["flour_kg"]) == Decimal("120")
            assert Decimal(result["oil_litres"]) == Decimal("19.5")
            assert Decimal(result["spice_kg"]) == Decimal("3.8")
            assert Decimal(result["pouches"]) == Decimal("306")
            assert Decimal(result["cartons"]) == Decimal("21")
            assert Decimal(result["finished_after_dispatch"]) == Decimal("88")
            assert Decimal(result["shortage"]) == Decimal("32")
            assert Decimal(result["invoice_total"]) == Decimal("7875.00")
            assert Decimal(result["outstanding"]) == Decimal("3875.00")
            assert Decimal(result["total_run_cost"]) == Decimal("5855.00")
            assert Decimal(result["cost_per_packet"]) == Decimal("31.14")
    finally:
        app.dependency_overrides.clear()

    run = db.scalar(select(ProductionRun).where(ProductionRun.run_key == "BENCH-API-RUN-001"))
    assert run.capacity_mismatch is True
    issues = db.scalars(select(MaterialIssue).where(MaterialIssue.run_id == run.id)).all()
    by_name = {db.get(__import__("app.models", fromlist=["Item"]).Item, row.item_id).name: row for row in issues}
    assert by_name["Cooking oil"].flagged and by_name["Cooking oil"].variance_percent == Decimal("5.000")
    assert not by_name["200 g pouch"].flagged and by_name["200 g pouch"].variance_percent == Decimal("-3.000")
    assert by_name["Carton"].flagged and by_name["Carton"].variance_percent == Decimal("-10.000")
    assert db.scalar(select(ProductionCost).where(ProductionCost.run_id == run.id, ProductionCost.category == "labour")).amount == Decimal("1200.00")
    invoice = db.scalar(select(Invoice))
    assert invoice.cgst == Decimal("187.50") and invoice.sgst == Decimal("187.50")
    assert db.scalar(select(PaymentAllocation).where(PaymentAllocation.invoice_id == invoice.id)).amount == Decimal("4000.00")
    finished_id = seeded["items"]["Murukku 200 g"].id
    assert balance(db, finished_id) == Decimal("88")
    # Finished stock now carries production material + overhead value; dispatch writes negative COGS.
    assert inventory_value(db, finished_id) > Decimal("0")
    dispatch = db.scalar(select(StockMovement).where(
        StockMovement.item_id == finished_id, StockMovement.movement_type == "dispatch"))
    assert dispatch.value == Decimal("-3690.13")
    assert inventory_value(db, finished_id) == Decimal("2164.87")
    stock_rows = {row["item"]: row for row in __import__("app.reports", fromlist=["stock_summary"]).stock_summary(db)}
    assert stock_rows["Flour"]["carrying_value"] == "5175.00"
    assert stock_rows["Murukku 200 g"]["carrying_value"] == "2164.87"

def test_moving_average_replays_receipts_and_issues(db, seeded):
    flour = seeded["items"]["Flour"]
    assert weighted_average_cost(db, flour.id) == Decimal("0.042")
    # Receipt at a new rate.
    from app.services.inventory import record_movement
    record_movement(db, item_id=flour.id, movement_type="purchase", quantity=Decimal("60000"),
                    unit_cost=Decimal("0.045"), source_doc_type="test", source_doc_id=1,
                    created_by=seeded["admin"].id)
    db.flush()
    assert weighted_average_cost(db, flour.id) == Decimal("0.043125")
    # Issue 40 kg at the current moving average. The remaining rate is unchanged.
    record_movement(db, item_id=flour.id, movement_type="issue", quantity=Decimal("-40000"),
                    unit_cost=weighted_average_cost(db, flour.id), source_doc_type="test",
                    source_doc_id=2, created_by=seeded["admin"].id)
    db.flush()
    assert balance(db, flour.id) == Decimal("120000")
    assert weighted_average_cost(db, flour.id) == Decimal("0.043125")
    assert inventory_value(db, flour.id) == Decimal("5175.00")

def test_packaging_is_derived_and_always_posted(db, seeded):
    from app.services.production import post_production_run
    from app.schemas import ProductionCreate, ProductionIssueInput
    payload = ProductionCreate(
        run_key="PACKAGING-DERIVE-001", product_id=seeded["product"].id,
        actual_output=188, damaged_pouches=6, cartons_used=9,
        issues=[
            ProductionIssueInput(item_id=seeded["items"]["Flour"].id, actual_quantity=40000),
            ProductionIssueInput(item_id=seeded["items"]["Cooking oil"].id, actual_quantity=10500),
            ProductionIssueInput(item_id=seeded["items"]["Salt and spice mix"].id, actual_quantity=1200),
        ])
    run = post_production_run(db, data=payload, user=seeded["admin"])
    db.flush()
    issues = {db.get(__import__("app.models", fromlist=["Item"]).Item, x.item_id).name: x
              for x in db.scalars(select(MaterialIssue).where(MaterialIssue.run_id == run.id)).all()}
    assert issues["200 g pouch"].actual_quantity == Decimal("194")
    assert issues["Carton"].actual_quantity == Decimal("9")
    assert balance(db, seeded["items"]["200 g pouch"].id) == Decimal("306")
    assert balance(db, seeded["items"]["Carton"].id) == Decimal("21")

def test_add_overhead_after_posting_updates_finished_valuation(db, seeded):
    from app.services.production import post_production_run, add_run_cost
    from app.schemas import ProductionCreate, ProductionIssueInput
    payload = ProductionCreate(
        run_key="LATE-COST-001", product_id=seeded["product"].id, actual_output=188,
        damaged_pouches=6, cartons_used=9,
        issues=[
            ProductionIssueInput(item_id=seeded["items"]["Flour"].id, actual_quantity=40000),
            ProductionIssueInput(item_id=seeded["items"]["Cooking oil"].id, actual_quantity=10500),
            ProductionIssueInput(item_id=seeded["items"]["Salt and spice mix"].id, actual_quantity=1200),
        ])
    run = post_production_run(db, data=payload, user=seeded["admin"])
    db.flush()
    finished_id = seeded["items"]["Murukku 200 g"].id
    value_before = inventory_value(db, finished_id)
    add_run_cost(db, run_id=run.id, category="labour", amount=Decimal("1200"), user=seeded["admin"])
    db.flush()
    assert inventory_value(db, finished_id) == value_before + Decimal("1200")
    assert weighted_average_cost(db, finished_id) > Decimal("0")

def test_duplicate_production_posting_prevented(db, seeded):
    from app.services.production import post_production_run
    from app.schemas import ProductionCreate, ProductionIssueInput
    payload = ProductionCreate(
        run_key="DUPLICATE-RUN-001", product_id=seeded["product"].id,
        actual_output=188, damaged_pouches=6, cartons_used=9,
        issues=[
            ProductionIssueInput(item_id=seeded["items"]["Flour"].id, actual_quantity=40000),
            ProductionIssueInput(item_id=seeded["items"]["Cooking oil"].id, actual_quantity=10500),
            ProductionIssueInput(item_id=seeded["items"]["Salt and spice mix"].id, actual_quantity=1200),
        ])
    post_production_run(db, data=payload, user=seeded["admin"])
    db.flush()
    with pytest.raises(ValueError, match="already posted"):
        post_production_run(db, data=payload, user=seeded["admin"])

def test_insufficient_stock_is_rejected(db, seeded):
    from app.services.production import post_production_run
    from app.schemas import ProductionCreate, ProductionIssueInput
    payload = ProductionCreate(
        run_key="SHORT-MATERIAL-001", product_id=seeded["product"].id,
        actual_output=188, damaged_pouches=6, cartons_used=9,
        issues=[
            ProductionIssueInput(item_id=seeded["items"]["Flour"].id, actual_quantity=400000),
            ProductionIssueInput(item_id=seeded["items"]["Cooking oil"].id, actual_quantity=10500),
            ProductionIssueInput(item_id=seeded["items"]["Salt and spice mix"].id, actual_quantity=1200),
        ])
    with pytest.raises(ValueError, match="Insufficient stock"):
        post_production_run(db, data=payload, user=seeded["admin"])

def test_role_access_enforced():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.security import get_current_user
    from app.database import get_db
    class FakeUser:
        role = "salesman"
        id = 3
    app.dependency_overrides[get_current_user] = lambda: FakeUser()
    app.dependency_overrides[get_db] = lambda: iter([])
    try:
        response = TestClient(app).get("/api/dashboard")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()

def test_stock_movements_are_append_only(db, seeded):
    movement = db.scalars(select(StockMovement)).first()
    movement.quantity = Decimal("1")
    with pytest.raises(ValueError, match="append-only"):
        db.flush()
    db.rollback()


def test_multi_line_invoice_applies_each_products_gst_rate(db, seeded):
    from app.main import app
    from app.models import Item, Product, Invoice
    from app.services.inventory import record_movement
    from app.database import get_db
    def override_db():
        yield db
    extra_item = Item(name="Murukku 500 g", item_type="finished", base_unit="packet")
    db.add(extra_item)
    db.flush()
    extra_product = Product(item_id=extra_item.id, family="Murukku", pack_size_g=500,
                            selling_price=Decimal("100"), gst_rate=Decimal("12"))
    db.add(extra_product)
    db.flush()
    record_movement(db, item_id=extra_item.id, movement_type="opening",
                    quantity=Decimal("10"), unit_cost=Decimal("20"),
                    source_doc_type="opening", source_doc_id=1,
                    created_by=seeded["admin"].id)
    db.commit()
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            login = client.post("/api/auth/login", json={"username":"salesman_a","password":"sales123"}).json()
            client.headers["Authorization"] = f"Bearer {login['access_token']}"
            masters = client.get("/api/masters").json()
            customer_id = next(x["id"] for x in masters["customers"] if x["name"]=="Retailer A")
            product_200 = next(x["id"] for x in masters["products"] if x["name"]=="Murukku 200 g")
            product_500 = next(x["id"] for x in masters["products"] if x["name"]=="Murukku 500 g")
            order = client.post("/api/orders", json={"customer_id":customer_id,"lines":[
                {"product_id":product_200,"quantity":1},
                {"product_id":product_500,"quantity":1},
            ]}).json()
            admin = client.post("/api/auth/login", json={"username":"admin","password":"admin123"}).json()
            client.headers["Authorization"] = f"Bearer {admin['access_token']}"
            assert client.post(f"/api/orders/{order['order_id']}/approve").json()["approved"]
            invoice_data = client.post(f"/api/orders/{order['order_id']}/invoice").json()
            invoice = db.get(Invoice, invoice_data["invoice_id"])
            assert invoice.taxable_value == Decimal("150.00")
            # 5% on ₹50 = ₹2.50; 12% on ₹100 = ₹12.00; total GST ₹14.50.
            assert invoice.cgst == Decimal("7.25")
            assert invoice.sgst == Decimal("7.25")
            assert invoice.total == Decimal("164.50")
    finally:
        app.dependency_overrides.clear()

def test_admin_can_edit_submitted_order_and_audit_change(db, seeded):
    from app.main import app
    from app.database import get_db
    from app.models import AuditLog, OrderItem
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            login = client.post("/api/auth/login", json={"username":"salesman_a","password":"sales123"}).json()
            client.headers["Authorization"] = f"Bearer {login['access_token']}"
            order = client.post("/api/orders", json={"customer_id":1,"lines":[
                {"product_id":seeded["product"].id,"quantity":1}
            ]}).json()
            admin = client.post("/api/auth/login", json={"username":"admin","password":"admin123"}).json()
            client.headers["Authorization"] = f"Bearer {admin['access_token']}"
            response = client.put(f"/api/orders/{order['order_id']}", json={"lines":[
                {"product_id":seeded["product"].id,"quantity":2,"unit_price":"47.50"}
            ],"notes":"Admin verified quantity and price"})
            assert response.status_code == 200, response.text
            line = db.scalar(select(OrderItem).where(OrderItem.order_id == order["order_id"]))
            assert line.quantity == 2 and line.unit_price == Decimal("47.50")
            audit = db.scalar(select(AuditLog).where(AuditLog.entity_type=="order",
                                                      AuditLog.entity_id==order["order_id"],
                                                      AuditLog.action=="edited"))
            assert audit.before_json and audit.after_json
    finally:
        app.dependency_overrides.clear()

def test_salesman_can_view_only_own_sales(db, seeded):
    from app.main import app
    from app.database import get_db
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            result = run_scenario(client)
            login = client.post("/api/auth/login", json={"username":"salesman_a","password":"sales123"}).json()
            client.headers["Authorization"] = f"Bearer {login['access_token']}"
            rows = client.get("/api/sales/my-sales")
            assert rows.status_code == 200, rows.text
            assert any(row["customer"]=="Retailer A" for row in rows.json())
            assert all(row["customer"]!="Distributor B" for row in rows.json())
    finally:
        app.dependency_overrides.clear()


def test_offline_order_request_is_idempotent(db, seeded):
    from app.main import app
    from app.database import get_db
    from app.models import Order
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            login = client.post("/api/auth/login", json={"username":"salesman_a","password":"sales123"}).json()
            client.headers["Authorization"] = f"Bearer {login['access_token']}"
            payload = {
                "customer_id": 1,
                "client_request_id": "offline-client-request-001",
                "lines": [{"product_id": seeded["product"].id, "quantity": 3}],
            }
            first = client.post("/api/orders", json=payload)
            second = client.post("/api/orders", json=payload)
            assert first.status_code == 200 and second.status_code == 200
            assert first.json()["order_id"] == second.json()["order_id"]
            assert second.json()["duplicate"] is True
            assert len(db.scalars(select(Order)).all()) == 1
    finally:
        app.dependency_overrides.clear()


def test_inventory_value_uses_signed_ledger_movements(db, seeded):
    from app.services.inventory import record_movement, inventory_value
    flour = seeded["items"]["Flour"]
    assert inventory_value(db, flour.id) == Decimal("4200.00")
    record_movement(db, item_id=flour.id, movement_type="purchase",
                    quantity=Decimal("1000"), unit_cost=Decimal("0.05"),
                    source_doc_type="test", source_doc_id=11,
                    created_by=seeded["admin"].id)
    db.flush()
    record_movement(db, item_id=flour.id, movement_type="issue",
                    quantity=Decimal("-500"), unit_cost=weighted_average_cost(db, flour.id),
                    source_doc_type="test", source_doc_id=12,
                    created_by=seeded["admin"].id)
    db.flush()
    assert inventory_value(db, flour.id) == Decimal("4228.96")

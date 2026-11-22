"""End-to-end coverage for the workflows added on top of the original benchmark suite."""
from decimal import Decimal

from sqlalchemy import select

from app.models import CreditNote, Order, StockMovement


def _login(client, username="admin", password="admin123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return response.json()


def _masters(client):
    return client.get("/api/masters").json()


def _item_id(client, name):
    return next(item["id"] for item in _masters(client)["items"] if item["name"] == name)


def _customer_id(client, name):
    return next(row["id"] for row in _masters(client)["customers"] if row["name"] == name)


def test_master_crud_and_audit_trail(client, seeded):
    _login(client)

    created = client.post("/api/customers", json={
        "name": "Kirana Nine", "customer_type": "retailer", "state": "Tamil Nadu"})
    assert created.status_code == 201, created.text
    customer_id = created.json()["id"]

    updated = client.put(f"/api/customers/{customer_id}", json={"name": "Kirana Nine Stores"})
    assert updated.status_code == 200, updated.text

    item = client.post("/api/items", json={
        "name": "Murukku 100 g", "item_type": "finished", "base_unit": "packet"})
    assert item.status_code == 201, item.text
    item_id = item.json()["id"]

    product = client.post("/api/products", json={
        "item_id": item_id, "family": "Murukku", "pack_size_g": 100,
        "selling_price": "30", "gst_rate": "5"})
    assert product.status_code == 201, product.text

    recipe = client.post("/api/recipes", json={
        "product_id": product.json()["id"], "family": "Murukku", "expected_packets": 400,
        "tolerance_percent": "3",
        "items": [{"item_id": _item_id(client, "Flour"), "quantity": "40000"}]})
    assert recipe.status_code == 201, recipe.text

    user = client.post("/api/users", json={
        "username": "supervisor_new", "password": "strongpass1", "role": "production"})
    assert user.status_code == 201, user.text

    listed = _masters(client)
    assert any(row["name"] == "Kirana Nine Stores" for row in listed["customers"])
    assert any(row["name"] == "Murukku 100 g" for row in listed["items"])
    assert any(row["username"] == "supervisor_new" for row in listed["users"])

    logs = client.get("/api/audit-logs", params={"entity_type": "customer", "limit": 20})
    assert logs.status_code == 200, logs.text
    actions = {entry["action"] for entry in logs.json()["items"]}
    assert {"created", "updated"} <= actions
    assert all(entry["actor"] == "admin" for entry in logs.json()["items"])


def test_master_writes_are_admin_only(client, seeded):
    _login(client, "salesman_a", "sales123")
    assert client.post("/api/customers", json={
        "name": "Blocked", "state": "Tamil Nadu"}).status_code == 403
    assert client.get("/api/audit-logs").status_code == 403

    _login(client)
    listed = _masters(client)
    assert listed["users"], "admins should see the user directory"
    _login(client, "salesman_a", "sales123")
    assert _masters(client)["users"] == [], "non-admins must not see user records"


def test_stock_adjustment_is_appended_not_edited(client, seeded):
    _login(client)
    flour_id = _item_id(client, "Flour")
    before = next(item for item in _masters(client)["items"] if item["id"] == flour_id)

    response = client.post("/api/inventory/adjustments", json={
        "item_id": flour_id, "quantity": "-1000", "reason": "Physical count variance"})
    assert response.status_code == 201, response.text

    after = next(item for item in _masters(client)["items"] if item["id"] == flour_id)
    assert Decimal(after["balance"]) == Decimal(before["balance"]) - 1000

    ledger = client.get("/api/inventory/ledger", params={"item_id": flour_id, "limit": 1}).json()
    entry = ledger["items"][0]
    assert entry["movement_type"] == "adjustment"
    assert entry["note"] == "Physical count variance"
    assert entry["source"] == "adjustment:0"

    excessive = client.post("/api/inventory/adjustments", json={
        "item_id": flour_id, "quantity": "-999999", "reason": "Typo"})
    assert excessive.status_code == 409
    assert client.post("/api/inventory/adjustments", json={
        "item_id": flour_id, "quantity": "0", "reason": "No-op"}).status_code == 400


def test_supplier_payments_track_payables(client, seeded):
    _login(client)
    supplier_id = _masters(client)["suppliers"][0]["id"]
    flour_id = _item_id(client, "Flour")

    purchase = client.post("/api/purchases", json={
        "supplier_id": supplier_id, "document_no": "PUR-AP-001",
        "lines": [{"item_id": flour_id, "quantity": "1000", "unit_cost": "0.05"}]})
    assert purchase.status_code == 200, purchase.text
    purchase_id = purchase.json()["purchase_id"]
    assert Decimal(purchase.json()["total"]) == Decimal("50.00")

    duplicate = client.post("/api/purchases", json={
        "supplier_id": supplier_id, "document_no": "PUR-AP-001",
        "lines": [{"item_id": flour_id, "quantity": "10", "unit_cost": "0.05"}]})
    assert duplicate.status_code == 409

    payment = client.post("/api/supplier-payments", json={
        "supplier_id": supplier_id, "purchase_id": purchase_id, "amount": "20",
        "method": "upi", "reference": "UPI-77"})
    assert payment.status_code == 201, payment.text

    over = client.post("/api/supplier-payments", json={
        "supplier_id": supplier_id, "purchase_id": purchase_id, "amount": "40"})
    assert over.status_code == 409

    payables = client.get("/api/payables").json()
    row = next(entry for entry in payables if entry["supplier_id"] == supplier_id)
    assert Decimal(row["billed"]) == Decimal("50.00")
    assert Decimal(row["paid"]) == Decimal("20.00")
    assert Decimal(row["outstanding"]) == Decimal("30.00")

    payments = client.get("/api/supplier-payments").json()
    assert payments["total"] == 1 and payments["items"][0]["method"] == "upi"


def test_payment_cannot_exceed_invoice_outstanding(client, seeded):
    _login(client, "salesman_a", "sales123")
    product_id = next(p["id"] for p in _masters(client)["products"])
    order = client.post("/api/orders", json={
        "customer_id": _customer_id(client, "Retailer A"),
        "lines": [{"product_id": product_id, "quantity": 1}]}).json()

    _login(client)
    assert client.post(f"/api/orders/{order['order_id']}/approve").json()["approved"]
    invoice = client.post(f"/api/orders/{order['order_id']}/invoice").json()
    customer_id = _customer_id(client, "Retailer A")

    too_much = client.post("/api/payments", json={
        "customer_id": customer_id, "invoice_id": invoice["invoice_id"], "amount": "100"})
    assert too_much.status_code == 409
    assert "outstanding" in too_much.json()["detail"]

    partial = client.post("/api/payments", json={
        "customer_id": customer_id, "invoice_id": invoice["invoice_id"], "amount": "52.50"})
    assert partial.status_code == 200, partial.text
    assert Decimal(partial.json()["outstanding"]) == Decimal("0.00")


def test_sales_return_restocks_and_raises_credit_note(client, db, seeded):
    _login(client, "salesman_a", "sales123")
    product_id = next(p["id"] for p in _masters(client)["products"])
    customer_id = _customer_id(client, "Retailer A")
    order = client.post("/api/orders", json={
        "customer_id": customer_id,
        "lines": [{"product_id": product_id, "quantity": 5}]}).json()

    _login(client)
    client.post(f"/api/orders/{order['order_id']}/approve")
    invoice = client.post(f"/api/orders/{order['order_id']}/invoice").json()
    client.post(f"/api/orders/{order['order_id']}/dispatch")

    finished = next(item for item in _masters(client)["items"] if item["name"] == "Murukku 200 g")
    assert Decimal(finished["balance"]) == Decimal("45")

    returned = client.post(f"/api/orders/{order['order_id']}/return")
    assert returned.status_code == 200, returned.text
    body = returned.json()
    assert body["status"] == "returned"
    assert Decimal(body["amount"]) == Decimal(invoice["total"])
    assert Decimal(body["tax_reversed"]) == Decimal("12.50")

    restored = next(item for item in _masters(client)["items"] if item["name"] == "Murukku 200 g")
    assert Decimal(restored["balance"]) == Decimal("50")

    note = db.scalar(select(CreditNote))
    assert note.stock_returned is True
    assert db.scalar(select(Order).where(Order.id == order["order_id"])).status == "returned"
    restock = db.scalars(select(StockMovement).where(
        StockMovement.movement_type == "sales_return")).all()
    assert len(restock) == 1 and restock[0].note.startswith("Sales return")

    assert client.post(f"/api/orders/{order['order_id']}/return").status_code == 409


def test_order_cancel_and_illegal_transitions(client, seeded):
    _login(client, "salesman_a", "sales123")
    product_id = next(p["id"] for p in _masters(client)["products"])
    order = client.post("/api/orders", json={
        "customer_id": _customer_id(client, "Retailer A"),
        "lines": [{"product_id": product_id, "quantity": 1}]}).json()

    assert client.post(f"/api/orders/{order['order_id']}/cancel").status_code == 403

    _login(client)
    cancelled = client.post(f"/api/orders/{order['order_id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert client.post(f"/api/orders/{order['order_id']}/approve").status_code == 400
    assert client.post(f"/api/orders/{order['order_id']}/dispatch").status_code == 409


def test_lists_are_paginated_with_total_header(client, seeded):
    _login(client, "salesman_a", "sales123")
    product_id = next(p["id"] for p in _masters(client)["products"])
    customer_id = _customer_id(client, "Retailer A")
    for _ in range(3):
        assert client.post("/api/orders", json={
            "customer_id": customer_id,
            "lines": [{"product_id": product_id, "quantity": 1}]}).status_code == 200

    page = client.get("/api/orders", params={"limit": 2})
    assert page.status_code == 200
    assert len(page.json()) == 2
    assert page.headers["X-Total-Count"] == "3"

    second = client.get("/api/orders", params={"limit": 2, "offset": 2})
    assert len(second.json()) == 1
    assert client.get("/api/orders", params={"limit": 0}).status_code == 422


def test_password_change_and_login(client, seeded):
    _login(client)
    wrong = client.post("/api/auth/password", json={
        "current_password": "nope", "new_password": "brandnew123"})
    assert wrong.status_code == 400

    changed = client.post("/api/auth/password", json={
        "current_password": "admin123", "new_password": "brandnew123"})
    assert changed.status_code == 200

    client.headers.pop("Authorization", None)
    assert client.post("/api/auth/login", json={
        "username": "admin", "password": "admin123"}).status_code == 401
    _login(client, "admin", "brandnew123")


def test_login_throttle_blocks_repeated_failures(client, seeded):
    for _ in range(8):
        assert client.post("/api/auth/login", json={
            "username": "ghost-user", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={
        "username": "ghost-user", "password": "wrong"}).status_code == 429


def test_audit_export_and_report_access(client, seeded):
    _login(client)
    export = client.get("/api/reports/export/audit.csv")
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "actor" in export.text
    assert client.get("/api/reports/export/nope.csv").status_code == 404

    _login(client, "salesman_a", "sales123")
    assert client.get("/api/reports/export/audit.csv").status_code == 403


def test_valuation_many_matches_single_item_reads(db, seeded):
    from app.services.inventory import inventory_valuation, valuation_many

    ids = [item.id for item in seeded["items"].values()]
    bulk = valuation_many(db, ids)
    for item_id in ids:
        assert bulk[item_id] == inventory_valuation(db, item_id)


def test_dashboard_reports_payables_and_activity(client, seeded):
    _login(client)
    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    for key in ("today_orders", "open_orders", "variance_alerts", "payables_outstanding",
                "receivable_outstanding", "recent_activity"):
        assert key in body
    assert isinstance(body["recent_activity"], list)

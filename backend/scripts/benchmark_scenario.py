"""Execute the supplied SnackFlow benchmark through public HTTP API endpoints.

Run against a seeded backend:
    python -m scripts.benchmark_scenario --base-url http://localhost:8000

The same `run_scenario(client)` function is used by the pytest end-to-end test.
"""
import argparse
from decimal import Decimal
import httpx

def _request(client, method, path, **kwargs):
    response = client.request(method, path, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path}: {response.status_code} {response.text}")
    return response.json()

def _login(client, username, password):
    data = _request(client, "POST", "/api/auth/login",
                    json={"username": username, "password": password})
    client.headers["Authorization"] = f"Bearer {data['access_token']}"
    return data

def run_scenario(client):
    """Run purchase -> production -> order -> approval -> invoice -> dispatch -> payment."""
    admin = _login(client, "admin", "admin123")
    masters = _request(client, "GET", "/api/masters")
    item_ids = {item["name"]: item["id"] for item in masters["items"]}
    product_id = masters["products"][0]["id"]
    customer_ids = {customer["name"]: customer["id"] for customer in masters["customers"]}
    supplier_id = masters["suppliers"][0]["id"]

    purchase = _request(client, "POST", "/api/purchases", json={
        "supplier_id": supplier_id,
        "document_no": "PUR-BENCH-API-001",
        "lines": [{"item_id": item_ids["Flour"], "quantity": "60000", "unit_cost": "0.045"}],
    })

    production = _request(client, "POST", "/api/production/runs", json={
        "run_key": "BENCH-API-RUN-001",
        "product_id": product_id,
        "batch_count": 1,
        "actual_output": 188,
        "damaged_pouches": 6,
        "cartons_used": 9,
        "issues": [
            {"item_id": item_ids["Flour"], "actual_quantity": "40000"},
            {"item_id": item_ids["Cooking oil"], "actual_quantity": "10500"},
            {"item_id": item_ids["Salt and spice mix"], "actual_quantity": "1200"},
        ],
    })
    _request(client, "POST", f"/api/production/runs/{production['run_id']}/costs",
             json={"category": "labour", "amount": "1200"})
    _request(client, "POST", f"/api/production/runs/{production['run_id']}/costs",
             json={"category": "gas_power", "amount": "600"})

    _login(client, "salesman_a", "sales123")
    order_a = _request(client, "POST", "/api/orders", json={
        "customer_id": customer_ids["Retailer A"],
        "lines": [{"product_id": product_id, "quantity": 150}],
    })

    _login(client, "admin", "admin123")
    approval_a = _request(client, "POST", f"/api/orders/{order_a['order_id']}/approve")
    if not approval_a.get("approved"):
        raise RuntimeError(f"Retailer A should be approvable: {approval_a}")
    invoice = _request(client, "POST", f"/api/orders/{order_a['order_id']}/invoice")
    _request(client, "POST", f"/api/orders/{order_a['order_id']}/dispatch")

    _login(client, "salesman_b", "sales123")
    order_b = _request(client, "POST", "/api/orders", json={
        "customer_id": customer_ids["Distributor B"],
        "lines": [{"product_id": product_id, "quantity": 120}],
    })
    _login(client, "admin", "admin123")
    approval_b = _request(client, "POST", f"/api/orders/{order_b['order_id']}/approve")
    shortage = approval_b.get("shortage", {})
    if approval_b.get("approved") or Decimal(shortage.get("Murukku 200 g", "0")) != Decimal("32"):
        raise RuntimeError(f"Expected 32-packet shortage for Distributor B, got {approval_b}")

    payment = _request(client, "POST", "/api/payments", json={
        "customer_id": customer_ids["Retailer A"],
        "invoice_id": invoice["invoice_id"],
        "amount": "4000",
        "reference": "BENCH-PAY-API-001",
    })

    stock = _request(client, "GET", "/api/inventory/summary")
    stock_by_name = {row["item"]: row for row in stock}
    cost = _request(client, "GET", f"/api/production/runs/{production['run_id']}/cost")
    return {
        "purchase_id": purchase["purchase_id"],
        "production_run_id": production["run_id"],
        "order_a_id": order_a["order_id"],
        "order_b_id": order_b["order_id"],
        "invoice_id": invoice["invoice_id"],
        "invoice_total": invoice["total"],
        "payment_id": payment["payment_id"],
        "outstanding": payment["outstanding"],
        "shortage": shortage["Murukku 200 g"],
        "flour_kg": stock_by_name["Flour"]["balance"],
        "oil_litres": stock_by_name["Cooking oil"]["balance"],
        "spice_kg": stock_by_name["Salt and spice mix"]["balance"],
        "pouches": stock_by_name["200 g pouch"]["balance"],
        "cartons": stock_by_name["Carton"]["balance"],
        "finished_after_dispatch": stock_by_name["Murukku 200 g"]["balance"],
        "cost_per_packet": cost["cost_per_packet"],
        "total_run_cost": cost["total_run_cost"],
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url, timeout=30) as client:
        result = run_scenario(client)
    for key, value in result.items():
        print(f"{key}: {value}")

if __name__ == "__main__":
    main()

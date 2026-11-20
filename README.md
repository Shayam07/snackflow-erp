# SnackFlow ERP

**Order-to-Audit Management System for a small packaged-snacks manufacturer.** This repository is an individual internship prototype for the NIT Tiruchirappalli problem statement. It demonstrates a transaction-ledger design linking purchasing, production, finished-goods inventory, sales, GST billing, collections and audit reports.

## Run locally

### Recommended: Docker Compose

Prerequisites: Docker Desktop / Docker Engine with the Compose plugin.

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Swagger API docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health

The first backend start runs the Alembic migration and benchmark seed script. PostgreSQL data is stored in the `snackflow_pgdata` volume.

To reset the demo database and rerun the seed:

```bash
docker compose down -v
docker compose up --build
```

### Run backend without Docker

Python 3.11+ is recommended.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
# Set DATABASE_URL in the environment. SQLite is the default for local development.
PYTHONPATH=.:.. alembic upgrade head
PYTHONPATH=.:.. python -m database.seed
PYTHONPATH=.:.. uvicorn app.main:app --reload
```

Run backend tests:

```bash
cd backend
PYTHONPATH=.:.. pytest -q
```

### Frontend without Docker

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` if the API is not running at `http://localhost:8000`.

## Stack and rationale

The backend uses FastAPI, SQLAlchemy 2.0, Alembic and PostgreSQL because typed APIs, relational transactions and explicit migrations suit an ERP workflow with stock and financial invariants. The frontend uses React, TypeScript, Vite and Tailwind CSS for a responsive role-oriented interface; ReportLab and openpyxl produce PDF and spreadsheet exports.

## Demo logins

| Role | Username | Password |
|---|---|---|
| Factory admin | `admin` | `admin123` |
| Production supervisor | `production` | `prod123` |
| Salesman A | `salesman_a` | `sales123` |
| Salesman B | `salesman_b` | `sales123` |
| Auditor (read-only reports) | `auditor` | `audit123` |
| Owner | `owner` | `owner123` |

These are demonstration credentials only. Change them and `SECRET_KEY` before any public deployment.

## Benchmark demo

1. Start the API and seed the database.
2. From a terminal, run `cd backend && python -m scripts.benchmark_scenario` (or run it inside the backend container with `docker compose exec backend python -m scripts.benchmark_scenario`).
3. The script authenticates as admin and salesman users, then calls the same HTTP endpoints as the UI: purchase, production, add costs, create orders, approve, invoice, dispatch and payment.
4. Open **Inventory** and **Reports** to inspect the resulting ledger and exports.
5. The scenario uses stable document/run keys and fails clearly if it has already been run. Individual production runs and offline order submissions also have idempotency guards.

The seeded benchmark master data is in `database/seed.py`. The same setup is recreated by deleting the Docker volume and starting again.

### Expected benchmark results

| Check | Result |
|---|---:|
| Flour closing | 120 kg |
| Cooking oil closing | 19.5 L |
| Spice mix closing | 3.8 kg |
| Pouches closing | 306 pieces |
| Cartons closing | 21 pieces |
| Finished goods after production | 238 packets |
| Finished goods after Retailer A dispatch | 88 packets |
| Yield variance | -6% (flagged) |
| Oil variance | +5% (flagged) |
| Pouch variance | -3% (reported; exactly at tolerance, not flagged) |
| Carton variance | -10% (flagged) |
| Retailer A taxable value | ₹7,500 |
| CGST / SGST | ₹187.50 / ₹187.50 |
| Invoice total | ₹7,875 |
| Payment | ₹4,000 |
| Retailer A outstanding | ₹3,875 |
| Distributor B shortage | 32 packets |
| Weighted-average flour rate | ₹43.125/kg |
| Production run cost | ₹5,855 |
| Cost per good packet | ₹31.14 |

### Benchmark assumptions and explanations

- The database stores quantities in base units: grams, millilitres, pieces and packets. The stock summary converts grams to kg and millilitres to litres for display. Ledger quantities remain in base units.
- Purchase and stock movement `unit_cost` is expressed per base unit. The ₹45/kg flour purchase is stored as ₹0.045/g; the opening flour rate ₹42/kg is ₹0.042/g. Weighted-average flour valuation is therefore ₹0.043125/g or ₹43.125/kg.
- Yield and material variance compare actual consumption/output against the full one-batch BOM standard. Variance is not rescaled to actual good output.
- The 194 pouch consumption includes 188 good packets plus 6 damaged pouches. This produces a -3% pouch variance against 200 planned. The tolerance comparison is strictly `abs(variance) > 3`; exactly -3% is shown but not flagged.
- Nine cartons hold 180 packets, while the recorded good output is 188. The system records the actual nine cartons as supplied and flags the 8-packet capacity mismatch; it does not invent an extra carton.
- The benchmark does not provide a scrap weight for the 12-packet yield loss. The system reports the yield variance and does not invent a scrap quantity.
- Overheads are appended after production through `/api/production/runs/{id}/costs`; each overhead also creates a zero-quantity, positive-value stock movement that capitalizes the cost into finished goods. Run cost per packet is (material cost + labour + gas/power) / 188 good packets.
- Finished-goods output is initially valued at the run's direct material cost. Later overhead entries increase its carrying value. Dispatch reduces finished-goods quantity and carrying value at the current moving-average rate and records negative COGS value in the stock ledger.
- The 50 opening finished packets have no supplied opening valuation, so their opening ledger value is zero in the benchmark. The finished-goods average cost after production is therefore blended with those unvalued opening units; the run-specific ₹31.14 cost is calculated from that run's material and overhead costs. Dispatch COGS uses the blended moving average (₹3,690.13 for 150 packets in this scenario), not the run-specific cost per packet.
- Distributor B's order remains unapproved because only 88 finished packets remain. The shortage is 32. IGST would apply if an interstate invoice were later issued.
- The demo invoice PDF contains a clearly labelled placeholder supplier GSTIN (`33AAAAA0000A1Z5`). Replace it with the manufacturer's real GSTIN for a real deployment; this prototype uses dummy data only.

## Feature coverage

### Must-have

- [x] Login and server-side role checks for admin, salesman, production, auditor and owner.
- [x] Product, customer, supplier, raw-material and BOM seed masters.
- [x] Mobile-responsive order creation and salesman-specific order listing.
- [x] Admin approval with a server-side finished-stock check and shortage response.
- [x] GST invoice calculation, financial-year invoice sequence, PDF invoice and WhatsApp share URL.
- [x] Production posting with BOM planned/actual consumption, yield variance and stock movements.
- [x] Ledger-derived stock summary and source-linked stock ledger.
- [x] Sales, stock, purchase, GST, production and collection report exports in CSV, XLSX and PDF.

### Should-have

- [x] Purchase receipts and supplier master.
- [x] Payment allocation and outstanding calculation.
- [x] Weighted-average raw-material valuation and per-run overhead capture.
- [x] Cost per packet and gross margin endpoint.
- [x] Owner dashboard and variance alerts.
- [x] Audit log entries for order approval/rejection, invoice posting and production posting.

### Stretch

- [x] PWA manifest and basic app-shell service worker.
- [x] Batch number and expiry fields on stock movements.
- [x] IndexedDB offline order queue with reconnect sync and client-request idempotency key.
- [x] Admin can edit submitted order lines and prices before approval; changes are audit logged.
- [x] Multi-line sales orders and per-line GST rate calculation.
- [x] Salesman-only customer/product sales history endpoint and view.
- [ ] Service-worker background sync while the app is closed.
- [ ] FEFO dispatch and expiry dashboard.
- [ ] Reorder alerts and production planning.
- [ ] Tally-compatible export and e-Invoice / e-Way Bill integration.

## Design and integrity decisions

- `stock_movements` is the inventory source of truth. Each posted purchase, production issue, production output and dispatch adds a signed movement. There is no API for overwriting balances, and ORM update/delete events reject mutation of posted ledger rows.
- Every production run has a unique `run_key`; the benchmark service rejects a second posting of that key. Dispatch requires an `invoiced` order and changes it to `dispatched`, preventing repeat dispatch.
- Money uses Python `Decimal` and SQL `NUMERIC`. Stock quantities and costs are also Decimal-backed.
- Production and purchase posting use database transactions; exceptions roll back the transaction.
- Invoice numbering is stored in `invoice_sequences` by financial year and uses `SELECT ... FOR UPDATE` for sequence updates on PostgreSQL.
- Invoice records are not deleted. A credit-note endpoint records a separate credit note and audit event.
- Product family and pack size are separate. BOM lookup uses `Recipe.family`, allowing another pack-size product in the same family to reuse the family recipe.
- The current API accepts purchase and production quantities in each item's base unit. Unit conversion helpers are available in `app/services/units.py`.

## Known gaps / prototype boundaries

- This is an evaluation prototype, not certified accounting or GST filing software. Validate GST treatment, invoice format, HSN and statutory requirements with a qualified accountant before production use.
- GST calculation supports the supplied single-rate, single-place-of-supply scenario. Mixed GST rates within one invoice and discounts/cess are not implemented.
- The invoice sequence uses an insert-on-conflict guard for first use and row locking for increments on PostgreSQL. The automated suite currently runs on SQLite, which ignores `FOR UPDATE`; concurrent sequence allocation still needs an integration test with a real PostgreSQL service.
- Date-range filters are supported for reports with transaction dates; current stock is a point-in-time balance, not a historical as-of snapshot. Customer-wise and product-wise sales reports are included. Collections exports include age in days and ageing buckets.
- Credit notes are recorded, but automated tax reversal and stock-return handling are not implemented.
- Background sync while the app is closed, FEFO dispatch, supplier payment workflows, editable master screens, and production planning remain future work. Offline orders sync when the authenticated app reconnects; they are not guaranteed to sync if the app is closed.
- Role permissions are enforced at API endpoints; UI navigation is not a security boundary.
- The owner dashboard is intentionally small and does not yet surface per-product cost cards or low-stock alerts. Detailed analytics can be added after transaction correctness.
- The app uses a demo supplier GSTIN placeholder in the generated invoice PDF; configure a real seller profile before real use.

## Tests

The backend test suite covers unit conversions, weighted-average arithmetic, BOM/yield variance, GST split, invoice sequencing, full benchmark posting, duplicate production prevention, shortage calculation, payment allocation and role access.

```text
17 passed
```

## Repository map

```text
snackflow-erp/
├── backend/
│   ├── app/
│   │   ├── api/                 # sales and production routers
│   │   ├── core/                # settings and auth
│   │   ├── models.py            # SQLAlchemy schema
│   │   ├── reports.py           # ledger/report queries
│   │   ├── reporting.py         # PDF/XLSX report helpers
│   │   ├── schemas.py           # request validation
│   │   ├── services/            # inventory valuation, production posting, units and costing
│   │   └── main.py              # app setup, masters, purchases and reports
│   ├── alembic/                 # schema migration
│   ├── tests/
│   └── requirements.txt
├── database/seed.py
├── docs/design-note.md
├── frontend/
│   └── src/
├── docker-compose.yml
└── .env.example
```

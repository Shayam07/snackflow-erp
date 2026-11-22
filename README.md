# SnackFlow ERP

**Order-to-Audit Management System for a small packaged-snacks manufacturer.** This repository is an individual internship prototype for the NIT Tiruchirappalli problem statement. It demonstrates a transaction-ledger design linking purchasing, production, finished-goods inventory, sales, GST billing, collections and audit reports.

---

## 📊 Executive Project Report & System Architecture

A comprehensive technical and domain report is documented in [`docs/project-report.md`](docs/project-report.md). Below is the executive synthesis of the system's architecture, mathematical invariants, and operational capabilities:

### 1. Problem Statement & Domain Solution
Packaged snack manufacturing SMEs suffer from margin erosion caused by unaccounted recipe variances, static raw-material costing that misses ingredient inflation, GST invoice mismatches, and untracked field-sales orders. **SnackFlow ERP** resolves these through:
- **Append-Only Stock Ledger**: Stock levels are dynamically derived as $\sum (\text{movements})$ from signed, immutable entries. No mutable on-hand balance fields exist.
- **Moving Weighted-Average Costing**: Real-time recalculation of base-unit valuation (g, ml, pieces) whenever new purchases arrive, ensuring batch production costs reflect actual market spend.
- **BOM Explosion & Real-Time Variance Guard**: Batch ingredients are measured against standard recipes. Yields outside $\pm 3\%$ tolerance are automatically flagged.
- **Atomic GST Sequence**: Concurrency-safe financial-year numbering (`INV/2026-27/0001`) with automatic CGST (2.5%) + SGST (2.5%) or IGST (5%) allocation.
- **Offline-First Field Sales**: Sales representatives can book orders offline via an IndexedDB queue that auto-syncs when reconnecting.

### 2. Verified Benchmark Evaluation Results
The system includes an automated benchmark scenario (`backend/scripts/benchmark_scenario.py`) executing a complete multi-step business cycle. All calculated outcomes match benchmark standards exactly:

| Metric / Check | Standard Benchmark | System Observed Result | Verification Status |
|---|---:|---:|:---:|
| **Flour Closing Stock** | 120.0 kg | 120.0 kg | ✅ Verified |
| **Cooking Oil Closing Stock** | 19.5 L | 19.5 L | ✅ Verified |
| **Spice Mix Closing Stock** | 3.8 kg | 3.8 kg | ✅ Verified |
| **200g Pouches Closing Stock** | 306 pieces | 306 pieces | ✅ Verified |
| **Cartons Closing Stock** | 21 pieces | 21 pieces | ✅ Verified |
| **Finished Goods Post-Production** | 238 packets | 238 packets | ✅ Verified |
| **Finished Goods Post-Dispatch** | 88 packets | 88 packets | ✅ Verified |
| **Production Yield Variance** | -6.0% | -6.0% (Flagged) | ✅ Verified |
| **Cooking Oil Material Variance** | +5.0% | +5.0% (Flagged) | ✅ Verified |
| **Pouch Variance** | -3.0% | -3.0% (Within tolerance) | ✅ Verified |
| **Carton Packaging Variance** | -10.0% | -10.0% (Flagged) | ✅ Verified |
| **Retailer A Taxable Amount** | ₹7,500.00 | ₹7,500.00 | ✅ Verified |
| **CGST / SGST (2.5% each)** | ₹187.50 / ₹187.50 | ₹187.50 / ₹187.50 | ✅ Verified |
| **Invoice Total Amount** | ₹7,875.00 | ₹7,875.00 | ✅ Verified |
| **Recorded Payment** | ₹4,000.00 | ₹4,000.00 | ✅ Verified |
| **Retailer A Outstanding Balance** | ₹3,875.00 | ₹3,875.00 | ✅ Verified |
| **Distributor B Shortage Block** | 32 packets | 32 packets (Shortage flagged) | ✅ Verified |
| **Weighted Average Flour Rate** | ₹43.125 / kg | ₹43.125 / kg | ✅ Verified |
| **Total Production Run Cost** | ₹5,855.00 | ₹5,855.00 | ✅ Verified |
| **True Cost per Good Packet** | ₹31.14 | ₹31.14 | ✅ Verified |

### 3. UI/UX Modernization Highlights
- **1-Click Demo Persona Switcher**: Rapid authentication switcher on the login screen for `admin`, `production`, `salesman_a`, `auditor`, and `owner`.
- **Interactive BOM Variance Inspector**: Live yield % and tolerance warning indicators calculate dynamically as operators input floor metrics.
- **Built-in Unit Conversion Helper**: Instant translation from bulk units (kg, L) to base units (g, ml) with automatic rate derivation.
- **Order Pipeline Stepper & Financial Preview**: Multi-line order builder with real-time total unit tallies and estimated price calculators.
- **Multi-Format Export Suite**: 1-click streaming exports in CSV, Microsoft Excel (`.xlsx`), and formatted PDF documents.

---

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
# PYTHONPATH must separate paths with ';' on Windows and ':' on macOS/Linux.
# macOS/Linux: PYTHONPATH=.:..   Windows: PYTHONPATH=".;.."
PYTHONPATH=.:.. alembic upgrade head
PYTHONPATH=.:.. python -m database.seed
PYTHONPATH=.:.. uvicorn app.main:app --reload
```

Run backend tests. `pyproject.toml` configures the import path, so no environment setup is needed:

```bash
pytest -q
```

PostgreSQL-only concurrency tests (invoice numbering under row locks) are skipped unless a
disposable database is provided:

```bash
TEST_POSTGRES_URL=postgresql+psycopg://snackflow:snackflow@localhost:5432/snackflow_test pytest -q -m postgres
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
- GST calculation supports the supplied single-rate, single-place-of-supply scenario. Mixed GST rates within one invoice (supported per line) and discounts/cess are not implemented.
- The invoice sequence uses an insert-on-conflict guard for first use and row locking for increments on PostgreSQL. The SQLite suite ignores `FOR UPDATE`; the claim is covered by `tests/test_postgres_concurrency.py`, which runs in CI against a real PostgreSQL service.
- Date-range filters are supported for reports with transaction dates; current stock is a point-in-time balance, not a historical as-of snapshot.
- Sales returns are full-order only: a returned order restocks every dispatched line and raises one credit note. Partial returns and partial restock are not implemented.
- Stock adjustments are append-only corrections with a mandatory reason; there is no approval workflow for them beyond the admin role check.
- Background sync while the app is closed is not implemented. Offline orders sync when the authenticated app reconnects, and the service worker caches the app shell and static assets (not API responses).
- Role permissions are enforced at API endpoints; UI navigation is not a security boundary.
- Login throttling is per-process and in-memory, so it does not coordinate across multiple workers. Use a shared store before scaling out.
- The app uses a demo supplier GSTIN placeholder in the generated invoice PDF; configure a real seller profile before real use.

## Revision 3 capabilities

Added on top of the original order-to-audit flow:

- **Master data CRUD** for customers, suppliers, items (with opening stock), products, BOM recipes and users, including password change and account disabling. Every write is audit logged.
- **Audit log viewer** (`GET /api/audit-logs`, `#/audit` in the UI) with entity/action filters, expandable before/after snapshots and CSV/XLSX/PDF export. Successful logins are audited too.
- **Accounts payable**: supplier payments against a specific bill (over-payment blocked) and a payables register; the owner dashboard shows payables, receivables and suppliers with dues.
- **Stock adjustments** (`POST /api/inventory/adjustments`): appended ledger movements with a reason, so count corrections never mutate history.
- **Sales returns and cancellations**: cancelling before invoicing, or returning a dispatched order to restock goods and raise a credit note with tax reversal (`stock_returned`, `tax_reversed`).
- **Pagination** on orders, ledger, production runs, purchases, payments and audit logs (bounded `limit`/`offset`, `X-Total-Count` for the order list).
- **Integrity**: `CHECK` constraints for status/item-type/unit/GST/cost enums, indexes on foreign keys and hot filters, `FOR UPDATE` locking on invoice and payment reads, and database integrity errors mapped to 409.
- **Operations**: request-id logging middleware, structured domain errors (400/409), configurable CORS allowlist, login throttling, environment-aware settings, and `/api/health` that touches the database.
- **Single-pass valuation**: `valuation_many()` replays the ledger once per request for all items instead of three times per item, so the stock summary is one query instead of `3 × items`.
- **UI**: hash routing with deep links and back/forward, role-aware navigation, mobile drawer, Masters/Payables/Audit pages, stock adjustment and return workflows, loading skeletons, toasts, pagination controls, low-stock alerts and a real cached PWA shell with an app icon.

## Tests

The backend test suite covers unit conversions, weighted-average arithmetic, BOM/yield variance, GST split, invoice sequencing, full benchmark posting, duplicate production prevention, shortage calculation, payment allocation, role access, master-data CRUD and audit logging, stock adjustments, supplier payments and payables, sales returns, cancellation, pagination, login throttling, password change and report RBAC.

```text
30 passed, 2 skipped        # skips are PostgreSQL-only concurrency tests
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

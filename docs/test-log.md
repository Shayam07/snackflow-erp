# Verification log — revision 3

Executed on Windows (project host) with Python 3.12 and Node 20.

```text
$ pytest -q
..............................                            [100%]
30 passed, 2 skipped, 1 warning in 16.80s
```

The two skips are the PostgreSQL-only concurrency tests in
`tests/test_postgres_concurrency.py`; they run in CI against a `postgres:16` service
(`TEST_POSTGRES_URL` set, `-m postgres`) and assert that six concurrent invoice-number
allocations produce six distinct numbers and that a `FOR UPDATE` read serialises
competing transactions.

Migration checks (both executed, both passed):

```text
$ DATABASE_URL=sqlite:///./mig_fresh.db alembic upgrade head     # fresh database
$ DATABASE_URL=sqlite:///./mig_copy.db  alembic upgrade head     # copy of the seeded dev database
```

Verified afterwards: `supplier_payments` exists, `credit_notes.stock_returned` and
`credit_notes.tax_reversed` exist, `stock_movements.note` exists, and the new indexes
(`ix_orders_status`, `ix_audit_logs_entity`, `ix_stock_movements_item_chrono`, …) are present.

Frontend:

```text
$ cd frontend
$ npm run build
✓ 1594 modules transformed
dist/index.html                   0.90 kB │ gzip:  0.46 kB
dist/assets/index-BDWHNMW_.css   30.92 kB │ gzip:  7.35 kB
dist/assets/index-CVNZkwLV.js   268.21 kB │ gzip: 75.70 kB
✓ built in 7.38s
```

Manual browser check (Chromium preview, API on :8000, Vite on :5174):

- Login page renders and signs in as `admin` against the live API.
- Dashboard loads role-aware KPIs, receivables/payables and recent audited activity.
- Masters, Audit Log, Payables, Inventory and Orders pages load live data with no console errors.
- Stock adjustment modal opens centred with the backdrop applied.
- Desktop layout measured: 256px fixed sidebar, main column offset 256px, no horizontal overflow
  (`scrollWidth 1434` at `innerWidth 1440`).

Environment limitations:

- Docker is not installed on this host, so `docker compose up --build` was not executed.
- The PostgreSQL concurrency tests were skipped locally (no local PostgreSQL), so that claim is
  currently evidenced by CI configuration rather than a local run.
- Frontend behaviour was exercised by hand in one browser; there is no automated frontend test suite.

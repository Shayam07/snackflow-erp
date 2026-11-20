# Verification log — revision 2

Executed in the project generation environment.

```text
$ cd backend
$ PYTHONPATH=.:.. pytest -q
...............                                                        [100%]
17 passed
```

The benchmark end-to-end test now runs the public FastAPI routes with authenticated demo users. The scenario client performs purchase, production, post-run overheads, order creation, admin approval, invoice posting, dispatch, shortage detection and payment allocation. It does not call a private benchmark data-writing function.

Additional verified cases:

- Packaging issues are derived from actual output + damaged pouches and the entered carton count, even when packaging rows are omitted from the client request.
- Moving-average costing replays receipts and issues.
- Finished goods receive material value and later overhead capitalization.
- Dispatch records negative stock value / COGS and decreases finished-goods carrying value.
- Mixed-GST invoice lines calculate tax at each product's GST rate.
- Admin order edits record before/after audit snapshots.
- Salesman sales history is restricted to that salesperson's orders.
- Duplicate production run keys are rejected through the production API.
- Repeated offline order client request IDs return the original order rather than creating duplicates.
- Stock summary exposes ledger-derived carrying value and moving-average cost.

Migration/seed checks:

```text
alembic upgrade head (fresh SQLite database): passed
python -m database.seed: passed
python -m compileall -q app scripts ../database: passed
```

Environment limitations:

- Docker is not installed in the generation environment, so `docker compose up --build` could not be executed.
- `npm install --offline` could not run because the npm cache does not contain the React type packages; therefore the frontend production build remains unverified here.
- Tests use SQLite. SQLite ignores `SELECT ... FOR UPDATE`; concurrent invoice-number allocation still needs a PostgreSQL integration test.
- Offline orders use IndexedDB and sync when the signed-in page detects a reconnect. Background sync while the app is closed is not implemented.

"""PostgreSQL-only checks for the concurrency guarantees the design claims.

Skipped unless TEST_POSTGRES_URL points at a disposable database (CI sets it).
"""
import os
import threading
from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

PG_URL = os.getenv("TEST_POSTGRES_URL")

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(not PG_URL, reason="TEST_POSTGRES_URL not set"),
]


@pytest.fixture
def pg_session_factory():
    from app.database import Base
    from app import models  # noqa: F401 - registers metadata

    engine = create_engine(PG_URL, future=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        engine.dispose()


def test_concurrent_invoice_numbers_are_unique(pg_session_factory):
    from app.services.benchmark import next_invoice_number

    numbers: list[str] = []
    errors: list[Exception] = []
    barrier = threading.Barrier(6)
    lock = threading.Lock()

    def worker():
        session = pg_session_factory()
        try:
            barrier.wait(timeout=10)
            number = next_invoice_number(session, date(2026, 5, 1))
            session.commit()
            with lock:
                numbers.append(number)
        except Exception as exc:  # noqa: BLE001 - surfaced by the assertion below
            with lock:
                errors.append(exc)
        finally:
            session.close()

    threads = [threading.Thread(target=worker) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert not errors, f"concurrent numbering failed: {errors}"
    assert len(numbers) == 6
    assert len(set(numbers)) == 6
    assert sorted(numbers)[0].endswith("00001")
    assert sorted(numbers)[-1].endswith("00006")


def test_row_lock_serialises_invoice_sequence(pg_session_factory):
    """The FOR UPDATE read must block a competing transaction, not read a stale value."""
    from app.models import InvoiceSequence
    from app.services.benchmark import next_invoice_number

    first = pg_session_factory()
    second = pg_session_factory()
    try:
        first_number = next_invoice_number(first, date(2026, 5, 1))
        # The first transaction holds the row lock until it commits.
        held = first.scalar(select(InvoiceSequence).with_for_update())
        assert held is not None
        first.commit()  # releases the lock

        second_number = next_invoice_number(second, date(2026, 5, 1))
        second.commit()
        assert first_number != second_number
    finally:
        first.close()
        second.close()

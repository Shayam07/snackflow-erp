
from datetime import date
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session
from app.models import InvoiceSequence

def next_invoice_number(db: Session, on_date: date) -> str:
    """Allocate the next number in an April-March FY under a row lock.

    The first insert uses ON CONFLICT DO NOTHING so two concurrent transactions
    creating a new FY sequence cannot both try to create the same unique row.
    The subsequent SELECT FOR UPDATE serializes increments on PostgreSQL.
    """
    year = on_date.year if on_date.month >= 4 else on_date.year - 1
    financial_year = f"{year}-{str(year + 1)[-2:]}"
    bind = db.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        insert_statement = pg_insert(InvoiceSequence).values(
            financial_year=financial_year, last_number=0
        ).on_conflict_do_nothing(index_elements=[InvoiceSequence.financial_year])
        db.execute(insert_statement)
    elif dialect == "sqlite":
        insert_statement = sqlite_insert(InvoiceSequence).values(
            financial_year=financial_year, last_number=0
        ).on_conflict_do_nothing(index_elements=[InvoiceSequence.financial_year])
        db.execute(insert_statement)
    else:
        existing = db.scalar(select(InvoiceSequence).where(
            InvoiceSequence.financial_year == financial_year
        ))
        if existing is None:
            db.add(InvoiceSequence(financial_year=financial_year, last_number=0))
            db.flush()

    sequence = db.scalar(
        select(InvoiceSequence)
        .where(InvoiceSequence.financial_year == financial_year)
        .with_for_update()
    )
    if sequence is None:
        raise RuntimeError("Unable to initialize invoice sequence")
    sequence.last_number += 1
    return f"SFE/{financial_year}/{sequence.last_number:05d}"

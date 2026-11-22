"""Bounded pagination shared by every list endpoint."""
from dataclasses import dataclass

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.config import settings


@dataclass(frozen=True)
class Page:
    limit: int
    offset: int


def page_params(
    limit: int | None = Query(default=None, ge=1, le=settings.max_page_size),
    offset: int = Query(default=0, ge=0),
) -> Page:
    return Page(limit=limit or settings.default_page_size, offset=offset)


def paginate(db: Session, query: Select, page: Page) -> tuple[list, int]:
    """Return one page of result rows plus the unpaginated row count."""
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = db.execute(query.limit(page.limit).offset(page.offset)).all()
    return rows, total

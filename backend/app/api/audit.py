"""Read side of the audit trail: who changed what, when."""
import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pagination import Page, page_params, paginate
from app.core.security import require_roles
from app.database import get_db
from app.models import AuditLog, User

router = APIRouter(tags=["audit"])

READERS = require_roles("admin", "auditor", "owner")


def _loads(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


@router.get("/api/audit-logs")
def list_audit_logs(
    entity_type: str | None = None,
    action: str | None = None,
    entity_id: int | None = None,
    page: Page = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(READERS),
):
    query = (
        select(AuditLog, User.username)
        .join(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    )
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if action:
        query = query.where(AuditLog.action == action)
    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)

    rows, total = paginate(db, query, page)
    return {
        "items": [{
            "id": entry.id,
            "created_at": entry.created_at.isoformat(),
            "actor": username,
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "action": entry.action,
            "before": _loads(entry.before_json),
            "after": _loads(entry.after_json),
        } for entry, username in rows],
        "total": total,
        "limit": page.limit,
        "offset": page.offset,
    }

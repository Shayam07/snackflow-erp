"""Single place that writes audit events, with structured before/after snapshots."""
import json

from sqlalchemy.orm import Session

from app.models import AuditLog


def log_event(db: Session, *, user_id: int, entity_type: str, entity_id: int,
              action: str, before=None, after=None) -> AuditLog:
    entry = AuditLog(
        user_id=user_id, entity_type=entity_type, entity_id=entity_id, action=action,
        before_json=json.dumps(before, default=str, sort_keys=True) if before is not None else None,
        after_json=json.dumps(after, default=str, sort_keys=True) if after is not None else None,
    )
    db.add(entry)
    return entry

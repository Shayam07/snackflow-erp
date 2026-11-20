"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}

def upgrade():
    from app.database import Base
    from app import models
    Base.metadata.create_all(bind=op.get_bind())

def downgrade():
    from app.database import Base
    from app import models
    Base.metadata.drop_all(bind=op.get_bind())

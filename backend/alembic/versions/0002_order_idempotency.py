"""Add idempotency key for offline order retries.

Revision ID: 0002_order_idempotency
Revises: 0001_initial
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0002_order_idempotency"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

def upgrade():
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("orders")}
    if "client_request_id" not in columns:
        op.add_column("orders", sa.Column("client_request_id", sa.String(length=80), nullable=True))
    indexes = {index["name"] for index in inspect(op.get_bind()).get_indexes("orders")}
    if "ix_orders_client_request_id" not in indexes:
        op.create_index("ix_orders_client_request_id", "orders", ["client_request_id"], unique=True)

def downgrade():
    indexes = {index["name"] for index in inspect(op.get_bind()).get_indexes("orders")}
    if "ix_orders_client_request_id" in indexes:
        op.drop_index("ix_orders_client_request_id", table_name="orders")
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("orders")}
    if "client_request_id" in columns:
        op.drop_column("orders", "client_request_id")

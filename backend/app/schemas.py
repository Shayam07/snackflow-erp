from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field

class LoginInput(BaseModel):
    username: str
    password: str

class OrderLineInput(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)

class OrderCreate(BaseModel):
    customer_id: int
    lines: list[OrderLineInput] = Field(min_length=1)
    client_request_id: str | None = Field(default=None, max_length=80)

class PaymentInput(BaseModel):
    customer_id: int
    invoice_id: int
    amount: Decimal = Field(gt=0)
    reference: str | None = None

class PurchaseLineInput(BaseModel):
    item_id: int
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)

class PurchaseCreate(BaseModel):
    supplier_id: int
    document_no: str
    lines: list[PurchaseLineInput]

class ProductionIssueInput(BaseModel):
    item_id: int
    actual_quantity: Decimal = Field(gt=0)

class ProductionCreate(BaseModel):
    run_key: str
    product_id: int
    batch_count: int = Field(default=1, gt=0)
    actual_output: int = Field(gt=0)
    damaged_pouches: int = Field(default=0, ge=0)
    cartons_used: int = Field(default=0, ge=0)
    issues: list[ProductionIssueInput] = Field(default_factory=list)

class ProductionCostInput(BaseModel):
    category: str
    amount: Decimal = Field(gt=0)


class CreditNoteInput(BaseModel):
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=3, max_length=255)


class OrderLineUpdateInput(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)

class OrderUpdateInput(BaseModel):
    lines: list[OrderLineUpdateInput] = Field(min_length=1)
    notes: str | None = None

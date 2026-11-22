from datetime import date  # noqa: F401 - kept for symmetry with request payloads
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

RoleName = Literal["admin", "salesman", "production", "auditor", "owner"]
ItemType = Literal["raw", "packaging", "finished"]
BaseUnit = Literal["g", "ml", "piece", "packet"]
CustomerType = Literal["retailer", "distributor", "wholesale"]
CostCategory = Literal["labour", "gas_power", "other"]
PaymentMethod = Literal["bank", "upi", "cash", "cheque"]


# ---------------------------------------------------------------- authentication
class LoginInput(BaseModel):
    username: str
    password: str


class PasswordChangeInput(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ---------------------------------------------------------------- sales
class OrderLineInput(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    customer_id: int
    lines: list[OrderLineInput] = Field(min_length=1)
    client_request_id: str | None = Field(default=None, max_length=80)


class OrderLineUpdateInput(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)


class OrderUpdateInput(BaseModel):
    lines: list[OrderLineUpdateInput] = Field(min_length=1)
    notes: str | None = None


class PaymentInput(BaseModel):
    customer_id: int
    invoice_id: int
    amount: Decimal = Field(gt=0)
    reference: str | None = None


class CreditNoteInput(BaseModel):
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=3, max_length=255)
    restock: bool = False


# ---------------------------------------------------------------- purchasing
class PurchaseLineInput(BaseModel):
    item_id: int
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)


class PurchaseCreate(BaseModel):
    supplier_id: int
    document_no: str = Field(min_length=1, max_length=60)
    lines: list[PurchaseLineInput] = Field(min_length=1)


class SupplierPaymentInput(BaseModel):
    supplier_id: int
    purchase_id: int | None = None
    amount: Decimal = Field(gt=0)
    method: PaymentMethod = "bank"
    reference: str | None = Field(default=None, max_length=100)


# ---------------------------------------------------------------- production
class ProductionIssueInput(BaseModel):
    item_id: int
    actual_quantity: Decimal = Field(gt=0)


class ProductionCreate(BaseModel):
    run_key: str = Field(min_length=1, max_length=80)
    product_id: int
    batch_count: int = Field(default=1, gt=0)
    actual_output: int = Field(gt=0)
    damaged_pouches: int = Field(default=0, ge=0)
    cartons_used: int = Field(default=0, ge=0)
    issues: list[ProductionIssueInput] = Field(default_factory=list)


class ProductionCostInput(BaseModel):
    category: CostCategory
    amount: Decimal = Field(gt=0)


# ---------------------------------------------------------------- inventory
class StockAdjustmentInput(BaseModel):
    item_id: int
    quantity: Decimal
    reason: str = Field(min_length=3, max_length=255)
    unit_cost: Decimal | None = Field(default=None, ge=0)


# ---------------------------------------------------------------- masters
class CustomerInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    customer_type: CustomerType = "retailer"
    state: str = Field(min_length=2, max_length=80)
    gstin: str | None = Field(default=None, max_length=20)
    salesman_id: int | None = None


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    customer_type: CustomerType | None = None
    state: str | None = Field(default=None, min_length=2, max_length=80)
    gstin: str | None = Field(default=None, max_length=20)
    salesman_id: int | None = None


class SupplierInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    state: str = Field(default="Tamil Nadu", min_length=2, max_length=80)


class SupplierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    state: str | None = Field(default=None, min_length=2, max_length=80)


class ItemInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    item_type: ItemType
    base_unit: BaseUnit
    hsn_code: str = Field(default="2106", max_length=20)
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0)
    conversion_factor: Decimal = Field(default=Decimal("1"), gt=0)
    opening_quantity: Decimal | None = Field(default=None, ge=0)
    opening_unit_cost: Decimal | None = Field(default=None, ge=0)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    hsn_code: str | None = Field(default=None, max_length=20)
    reorder_level: Decimal | None = Field(default=None, ge=0)
    conversion_factor: Decimal | None = Field(default=None, gt=0)
    active: bool | None = None


class ProductInput(BaseModel):
    item_id: int
    family: str = Field(min_length=2, max_length=100)
    pack_size_g: int = Field(gt=0)
    selling_price: Decimal = Field(ge=0)
    gst_rate: Decimal = Field(default=Decimal("5"), ge=0, le=50)


class ProductUpdate(BaseModel):
    family: str | None = Field(default=None, min_length=2, max_length=100)
    pack_size_g: int | None = Field(default=None, gt=0)
    selling_price: Decimal | None = Field(default=None, ge=0)
    gst_rate: Decimal | None = Field(default=None, ge=0, le=50)


class RecipeItemInput(BaseModel):
    item_id: int
    quantity: Decimal = Field(gt=0)


class RecipeInput(BaseModel):
    product_id: int
    family: str = Field(min_length=2, max_length=100)
    version: int = Field(default=1, ge=1)
    expected_packets: int = Field(gt=0)
    tolerance_percent: Decimal = Field(default=Decimal("3"), ge=0, le=100)
    items: list[RecipeItemInput] = Field(min_length=1)
    active: bool = True


class RecipeUpdate(BaseModel):
    expected_packets: int | None = Field(default=None, gt=0)
    tolerance_percent: Decimal | None = Field(default=None, ge=0, le=100)
    items: list[RecipeItemInput] | None = None
    active: bool | None = None


class UserCreateInput(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,80}$")
    password: str = Field(min_length=8, max_length=128)
    role: RoleName


class UserUpdateInput(BaseModel):
    role: RoleName | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

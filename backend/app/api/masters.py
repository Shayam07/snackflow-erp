"""Master data: read the combined reference data and maintain each master record."""
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, DomainError
from app.core.security import (get_current_user, hash_password, require_roles,
                              verify_password)
from app.database import get_db
from app.models import (Customer, InvoiceItem, Item, Order, OrderItem, Product, Purchase,
                        Recipe, RecipeItem, Role, StockMovement, Supplier, User)
from app.schemas import (CustomerInput, CustomerUpdate, ItemInput, ItemUpdate,
                         PasswordChangeInput, ProductInput, ProductUpdate, RecipeInput,
                         RecipeUpdate, SupplierInput, SupplierUpdate, UserCreateInput,
                         UserUpdateInput)
from app.services.audit import log_event
from app.services.inventory import record_movement, valuation_many

router = APIRouter(tags=["masters"])

ADMIN = require_roles("admin")


def _snapshot(obj, fields) -> dict:
    return {field: str(getattr(obj, field)) for field in fields if hasattr(obj, field)}


# ------------------------------------------------------------------ read
@router.get("/api/masters")
def masters(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.scalars(select(Item).order_by(Item.name)).all()
    valuations = valuation_many(db, [item.id for item in items])
    recipes = db.scalars(select(Recipe).where(Recipe.active.is_(True)).order_by(Recipe.family)).all()
    is_admin = user.role == "admin"
    return {
        "items": [{
            "id": item.id, "name": item.name, "type": item.item_type, "unit": item.base_unit,
            "hsn_code": item.hsn_code, "active": item.active,
            "reorder_level": str(item.reorder_level),
            "conversion_factor": str(item.conversion_factor),
            "balance": str(valuations[item.id][0]),
            "average_cost": str(valuations[item.id][2]),
        } for item in items],
        "products": [{
            "id": product.id, "item_id": product.item_id, "name": product.item.name,
            "family": product.family, "pack_size_g": product.pack_size_g,
            "price": str(product.selling_price), "gst_rate": str(product.gst_rate),
        } for product in db.scalars(select(Product).order_by(Product.family)).all()],
        "customers": [{
            "id": customer.id, "name": customer.name, "state": customer.state,
            "type": customer.customer_type, "gstin": customer.gstin,
            "salesman_id": customer.salesman_id,
        } for customer in db.scalars(select(Customer).order_by(Customer.name)).all()],
        "suppliers": [{
            "id": supplier.id, "name": supplier.name, "state": supplier.state,
        } for supplier in db.scalars(select(Supplier).order_by(Supplier.name)).all()],
        "recipes": [{
            "id": recipe.id, "family": recipe.family, "product_id": recipe.product_id,
            "version": recipe.version, "expected_packets": recipe.expected_packets,
            "tolerance_percent": str(recipe.tolerance_percent),
            "items": [{
                "item_id": line.item_id, "name": line.item.name,
                "unit": line.item.base_unit, "planned_quantity": str(line.quantity),
            } for line in db.scalars(
                select(RecipeItem).where(RecipeItem.recipe_id == recipe.id)
            ).all()],
        } for recipe in recipes],
        "users": [{
            "id": member.id, "username": member.username, "role": member.role,
            "is_active": member.is_active,
        } for member in db.scalars(select(User).order_by(User.username)).all()] if is_admin else [],
        "roles": [{"name": role.name, "description": role.description}
                  for role in db.scalars(select(Role).order_by(Role.name)).all()] if is_admin else [],
    }


# ------------------------------------------------------------------ customers
@router.post("/api/customers", status_code=201)
def create_customer(data: CustomerInput, db: Session = Depends(get_db),
                    user: User = Depends(ADMIN)):
    customer = Customer(**data.model_dump())
    db.add(customer)
    db.flush()
    log_event(db, user_id=user.id, entity_type="customer", entity_id=customer.id,
              action="created", after={"name": customer.name, "state": customer.state})
    db.commit()
    return {"id": customer.id}


@router.put("/api/customers/{customer_id}")
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db),
                    user: User = Depends(ADMIN)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise DomainError("Customer not found")
    before = {"name": customer.name, "type": customer.customer_type, "state": customer.state,
              "gstin": customer.gstin, "salesman_id": customer.salesman_id}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    log_event(db, user_id=user.id, entity_type="customer", entity_id=customer.id,
              action="updated", before=before,
              after={"name": customer.name, "type": customer.customer_type,
                     "state": customer.state, "gstin": customer.gstin,
                     "salesman_id": customer.salesman_id})
    db.commit()
    return {"id": customer.id}


@router.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db),
                    user: User = Depends(ADMIN)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise DomainError("Customer not found")
    if db.scalar(select(Order.id).where(Order.customer_id == customer.id).limit(1)):
        raise ConflictError("Customer has orders and cannot be deleted")
    log_event(db, user_id=user.id, entity_type="customer", entity_id=customer.id,
              action="deleted", before={"name": customer.name})
    db.delete(customer)
    db.commit()
    return {"deleted": customer_id}


# ------------------------------------------------------------------ suppliers
@router.post("/api/suppliers", status_code=201)
def create_supplier(data: SupplierInput, db: Session = Depends(get_db),
                    user: User = Depends(ADMIN)):
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    db.flush()
    log_event(db, user_id=user.id, entity_type="supplier", entity_id=supplier.id,
              action="created", after={"name": supplier.name, "state": supplier.state})
    db.commit()
    return {"id": supplier.id}


@router.put("/api/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, data: SupplierUpdate, db: Session = Depends(get_db),
                    user: User = Depends(ADMIN)):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise DomainError("Supplier not found")
    before = {"name": supplier.name, "state": supplier.state}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    log_event(db, user_id=user.id, entity_type="supplier", entity_id=supplier.id,
              action="updated", before=before,
              after={"name": supplier.name, "state": supplier.state})
    db.commit()
    return {"id": supplier.id}


@router.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db),
                    user: User = Depends(ADMIN)):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise DomainError("Supplier not found")
    if db.scalar(select(Purchase.id).where(Purchase.supplier_id == supplier.id).limit(1)):
        raise ConflictError("Supplier has purchase bills and cannot be deleted")
    log_event(db, user_id=user.id, entity_type="supplier", entity_id=supplier.id,
              action="deleted", before={"name": supplier.name})
    db.delete(supplier)
    db.commit()
    return {"deleted": supplier_id}


# ------------------------------------------------------------------ items
@router.post("/api/items", status_code=201)
def create_item(data: ItemInput, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    if db.scalar(select(Item.id).where(Item.name == data.name)):
        raise ConflictError("An item with that name already exists")
    payload = data.model_dump(exclude={"opening_quantity", "opening_unit_cost"})
    item = Item(**payload)
    db.add(item)
    db.flush()
    if data.opening_quantity and Decimal(data.opening_quantity) > 0:
        cost = Decimal(data.opening_unit_cost or 0)
        record_movement(db, item_id=item.id, movement_type="opening",
                        quantity=Decimal(data.opening_quantity), unit_cost=cost,
                        source_doc_type="opening_balance", source_doc_id=item.id,
                        created_by=user.id, note="Opening balance")
    log_event(db, user_id=user.id, entity_type="item", entity_id=item.id, action="created",
              after={"name": item.name, "type": item.item_type, "unit": item.base_unit,
                     "opening_quantity": str(data.opening_quantity or 0)})
    db.commit()
    return {"id": item.id}


@router.put("/api/items/{item_id}")
def update_item(item_id: int, data: ItemUpdate, db: Session = Depends(get_db),
                user: User = Depends(ADMIN)):
    item = db.get(Item, item_id)
    if not item:
        raise DomainError("Item not found")
    before = _snapshot(item, ["name", "hsn_code", "reorder_level", "conversion_factor", "active"])
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    log_event(db, user_id=user.id, entity_type="item", entity_id=item.id, action="updated",
              before=before,
              after=_snapshot(item, ["name", "hsn_code", "reorder_level",
                                     "conversion_factor", "active"]))
    db.commit()
    return {"id": item.id}


@router.delete("/api/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    item = db.get(Item, item_id)
    if not item:
        raise DomainError("Item not found")
    if db.scalar(select(StockMovement.id).where(StockMovement.item_id == item.id).limit(1)):
        raise ConflictError("Item has ledger movements; deactivate it instead of deleting")
    log_event(db, user_id=user.id, entity_type="item", entity_id=item.id, action="deleted",
              before={"name": item.name})
    db.delete(item)
    db.commit()
    return {"deleted": item_id}


# ------------------------------------------------------------------ products
@router.post("/api/products", status_code=201)
def create_product(data: ProductInput, db: Session = Depends(get_db),
                   user: User = Depends(ADMIN)):
    item = db.get(Item, data.item_id)
    if not item:
        raise DomainError("Item not found")
    if item.item_type != "finished":
        raise DomainError("Only finished-goods items can be sold as products")
    if db.scalar(select(Product.id).where(Product.item_id == item.id)):
        raise ConflictError("That item is already sold as a product")
    product = Product(**data.model_dump())
    db.add(product)
    db.flush()
    log_event(db, user_id=user.id, entity_type="product", entity_id=product.id,
              action="created",
              after={"name": item.name, "family": product.family,
                     "price": str(product.selling_price), "gst_rate": str(product.gst_rate)})
    db.commit()
    return {"id": product.id}


@router.put("/api/products/{product_id}")
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db),
                   user: User = Depends(ADMIN)):
    product = db.get(Product, product_id)
    if not product:
        raise DomainError("Product not found")
    before = {"family": product.family, "pack_size_g": product.pack_size_g,
              "price": str(product.selling_price), "gst_rate": str(product.gst_rate)}
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    log_event(db, user_id=user.id, entity_type="product", entity_id=product.id,
              action="updated", before=before,
              after={"family": product.family, "pack_size_g": product.pack_size_g,
                     "price": str(product.selling_price), "gst_rate": str(product.gst_rate)})
    db.commit()
    return {"id": product.id}


@router.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    product = db.get(Product, product_id)
    if not product:
        raise DomainError("Product not found")
    if db.scalar(select(OrderItem.id).where(OrderItem.product_id == product.id).limit(1)):
        raise ConflictError("Product appears on orders and cannot be deleted")
    if db.scalar(select(InvoiceItem.id).where(InvoiceItem.product_id == product.id).limit(1)):
        raise ConflictError("Product appears on invoices and cannot be deleted")
    for recipe in db.scalars(select(Recipe).where(Recipe.product_id == product.id)).all():
        for line in db.scalars(select(RecipeItem).where(RecipeItem.recipe_id == recipe.id)).all():
            db.delete(line)
        db.delete(recipe)
    log_event(db, user_id=user.id, entity_type="product", entity_id=product.id,
              action="deleted", before={"name": product.item.name})
    db.delete(product)
    db.commit()
    return {"deleted": product_id}


# ------------------------------------------------------------------ recipes
def _replace_recipe_items(db: Session, recipe: Recipe, lines) -> None:
    for existing in db.scalars(select(RecipeItem).where(RecipeItem.recipe_id == recipe.id)).all():
        db.delete(existing)
    db.flush()
    for line in lines:
        item = db.get(Item, line.item_id)
        if not item:
            raise DomainError(f"Unknown item {line.item_id}")
        db.add(RecipeItem(recipe_id=recipe.id, item_id=item.id,
                          quantity=Decimal(line.quantity), unit=item.base_unit))


@router.post("/api/recipes", status_code=201)
def create_recipe(data: RecipeInput, db: Session = Depends(get_db),
                  user: User = Depends(ADMIN)):
    product = db.get(Product, data.product_id)
    if not product:
        raise DomainError("Product not found")
    recipe = Recipe(product_id=product.id, family=data.family, version=data.version,
                    expected_packets=data.expected_packets,
                    tolerance_percent=data.tolerance_percent, active=data.active)
    db.add(recipe)
    db.flush()
    _replace_recipe_items(db, recipe, data.items)
    log_event(db, user_id=user.id, entity_type="recipe", entity_id=recipe.id,
              action="created",
              after={"family": recipe.family, "expected_packets": recipe.expected_packets,
                     "components": len(data.items)})
    db.commit()
    return {"id": recipe.id}


@router.put("/api/recipes/{recipe_id}")
def update_recipe(recipe_id: int, data: RecipeUpdate, db: Session = Depends(get_db),
                  user: User = Depends(ADMIN)):
    recipe = db.get(Recipe, recipe_id)
    if not recipe:
        raise DomainError("Recipe not found")
    before = {"expected_packets": recipe.expected_packets,
              "tolerance_percent": str(recipe.tolerance_percent), "active": recipe.active}
    values = data.model_dump(exclude_unset=True)
    lines = values.pop("items", None)
    for field, value in values.items():
        setattr(recipe, field, value)
    if lines is not None:
        _replace_recipe_items(db, recipe, [type("Line", (), line)() if isinstance(line, dict)
                                          else line for line in lines])
    log_event(db, user_id=user.id, entity_type="recipe", entity_id=recipe.id,
              action="updated", before=before,
              after={"expected_packets": recipe.expected_packets,
                     "tolerance_percent": str(recipe.tolerance_percent),
                     "active": recipe.active,
                     "components": len(lines) if lines is not None else "unchanged"})
    db.commit()
    return {"id": recipe.id}


# ------------------------------------------------------------------ users / auth
@router.post("/api/users", status_code=201)
def create_user(data: UserCreateInput, db: Session = Depends(get_db),
                user: User = Depends(ADMIN)):
    if db.scalar(select(User.id).where(User.username == data.username)):
        raise ConflictError("That username already exists")
    if not db.get(Role, data.role):
        raise DomainError("Unknown role")
    member = User(username=data.username, role=data.role,
                  password_hash=hash_password(data.password))
    db.add(member)
    db.flush()
    log_event(db, user_id=user.id, entity_type="user", entity_id=member.id, action="created",
              after={"username": member.username, "role": member.role})
    db.commit()
    return {"id": member.id}


@router.put("/api/users/{user_id}")
def update_user(user_id: int, data: UserUpdateInput, db: Session = Depends(get_db),
                user: User = Depends(ADMIN)):
    member = db.get(User, user_id)
    if not member:
        raise DomainError("User not found")
    values = data.model_dump(exclude_unset=True)
    password = values.pop("password", None)
    before = {"role": member.role, "is_active": member.is_active}
    if "role" in values and not db.get(Role, values["role"]):
        raise DomainError("Unknown role")
    for field, value in values.items():
        setattr(member, field, value)
    if password:
        member.password_hash = hash_password(password)
    log_event(db, user_id=user.id, entity_type="user", entity_id=member.id, action="updated",
              before=before,
              after={"role": member.role, "is_active": member.is_active,
                     "password_reset": bool(password)})
    db.commit()
    return {"id": member.id}


@router.post("/api/auth/password")
def change_password(data: PasswordChangeInput, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if not verify_password(data.current_password, user.password_hash):
        raise DomainError("Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    log_event(db, user_id=user.id, entity_type="user", entity_id=user.id,
              action="password_changed")
    db.commit()
    return {"changed": True}

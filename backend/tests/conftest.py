import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password
from app.database import Base
from app.models import User


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=__import__("sqlalchemy").pool.StaticPool)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                                 expire_on_commit=False)
    Base.metadata.create_all(engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def seeded(db):
    from decimal import Decimal

    from app.models import (Customer, Item, Product, Recipe, RecipeItem, Role, StockMovement,
                            Supplier)

    db.add_all([Role(name="admin"), Role(name="salesman"), Role(name="production"),
                Role(name="auditor"), Role(name="owner")])
    db.flush()
    admin = User(username="admin", password_hash=hash_password("admin123"), role="admin")
    prod_user = User(username="production", password_hash=hash_password("prod123"),
                     role="production")
    sa = User(username="salesman_a", password_hash=hash_password("sales123"), role="salesman")
    sb = User(username="salesman_b", password_hash=hash_password("sales123"), role="salesman")
    auditor = User(username="auditor", password_hash=hash_password("audit123"), role="auditor")
    owner = User(username="owner", password_hash=hash_password("owner123"), role="owner")
    db.add_all([admin, prod_user, sa, sb, auditor, owner])
    db.flush()
    data = [
        ("Flour", "raw", "g", "100000", "0.042"),
        ("Cooking oil", "raw", "ml", "30000", "0.14"),
        ("Salt and spice mix", "raw", "g", "5000", "0.2"),
        ("200 g pouch", "packaging", "piece", "500", "2.50"),
        ("Carton", "packaging", "piece", "30", "15"),
        ("Murukku 200 g", "finished", "packet", "50", "0"),
    ]
    items = {}
    for name, item_type, unit, qty, cost in data:
        item = Item(name=name, item_type=item_type, base_unit=unit,
                    conversion_factor=Decimal("20") if name == "Carton" else Decimal("1"))
        db.add(item)
        db.flush()
        items[name] = item
        db.add(StockMovement(item_id=item.id, movement_type="opening",
                             quantity=Decimal(qty), unit_cost=Decimal(cost),
                             value=Decimal(qty) * Decimal(cost), source_doc_type="opening",
                             source_doc_id=1, created_by=admin.id))
    product = Product(item_id=items["Murukku 200 g"].id, family="Murukku", pack_size_g=200,
                      selling_price=Decimal("50"), gst_rate=Decimal("5"))
    db.add(product)
    db.flush()
    customers = [
        Customer(name="Retailer A", customer_type="retailer", state="Tamil Nadu",
                 salesman_id=sa.id),
        Customer(name="Distributor B", customer_type="distributor", state="Karnataka",
                 salesman_id=sb.id),
    ]
    db.add_all(customers)
    supplier = Supplier(name="Benchmark Supplier", state="Tamil Nadu")
    db.add(supplier)
    db.flush()
    recipe = Recipe(product_id=product.id, family="Murukku", version=1, expected_packets=200,
                    tolerance_percent=Decimal("3"))
    db.add(recipe)
    db.flush()
    for name, qty in [("Flour", "40000"), ("Cooking oil", "10000"), ("Salt and spice mix", "1200"),
                      ("200 g pouch", "200"), ("Carton", "10")]:
        db.add(RecipeItem(recipe_id=recipe.id, item_id=items[name].id,
                          quantity=Decimal(qty), unit=items[name].base_unit))
    db.commit()
    return {"admin": admin, "production": prod_user, "salesman_a": sa, "salesman_b": sb,
            "auditor": auditor, "owner": owner, "items": items, "product": product,
            "recipe": recipe, "supplier": supplier, "customers": customers}


@pytest.fixture
def client(db):
    """TestClient bound to the isolated in-memory session."""
    from fastapi.testclient import TestClient

    from app.database import get_db
    from app.main import app

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def login(client, username="admin", password="admin123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return response.json()

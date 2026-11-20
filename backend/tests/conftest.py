import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User
from app.core.security import hash_password

@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=__import__("sqlalchemy").pool.StaticPool)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
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
    from database.seed import seed
    # Seed function uses configured engine; populate test session directly instead.
    from app.models import Role, Item, Product, Customer, Supplier, Recipe, RecipeItem, StockMovement
    from decimal import Decimal
    db.add_all([Role(name="admin"), Role(name="salesman"), Role(name="production"),
                Role(name="auditor"), Role(name="owner")]); db.flush()
    admin = User(username="admin", password_hash=hash_password("admin123"), role="admin")
    prod_user = User(username="production", password_hash=hash_password("prod123"), role="production")
    sa = User(username="salesman_a", password_hash=hash_password("sales123"), role="salesman")
    sb = User(username="salesman_b", password_hash=hash_password("sales123"), role="salesman")
    auditor = User(username="auditor", password_hash=hash_password("audit123"), role="auditor")
    owner = User(username="owner", password_hash=hash_password("owner123"), role="owner")
    db.add_all([admin, prod_user, sa, sb, auditor, owner]); db.flush()
    data = [
        ("Flour","raw","g","100000","0.042"),("Cooking oil","raw","ml","30000","0.14"),
        ("Salt and spice mix","raw","g","5000","0.2"),("200 g pouch","packaging","piece","500","2.50"),
        ("Carton","packaging","piece","30","15"),("Murukku 200 g","finished","packet","50","0")
    ]
    items={}
    for n,t,u,q,c in data:
        x=Item(name=n,item_type=t,base_unit=u,
               conversion_factor=Decimal("20") if n=="Carton" else Decimal("1"))
        db.add(x); db.flush(); items[n]=x
        db.add(StockMovement(item_id=x.id,movement_type="opening",quantity=Decimal(q),
            unit_cost=Decimal(c),value=Decimal(q)*Decimal(c),source_doc_type="opening",source_doc_id=1,created_by=admin.id))
    p=Product(item_id=items["Murukku 200 g"].id,family="Murukku",pack_size_g=200,
              selling_price=Decimal("50"),gst_rate=Decimal("5")); db.add(p); db.flush()
    db.add_all([Customer(name="Retailer A",customer_type="retailer",state="Tamil Nadu",salesman_id=sa.id),
                Customer(name="Distributor B",customer_type="distributor",state="Karnataka",salesman_id=sb.id)])
    sup=Supplier(name="Benchmark Supplier",state="Tamil Nadu"); db.add(sup); db.flush()
    recipe=Recipe(product_id=p.id,family="Murukku",version=1,expected_packets=200,tolerance_percent=Decimal("3")); db.add(recipe); db.flush()
    for n,q in [("Flour","40000"),("Cooking oil","10000"),("Salt and spice mix","1200"),("200 g pouch","200"),("Carton","10")]:
        db.add(RecipeItem(recipe_id=recipe.id,item_id=items[n].id,quantity=Decimal(q),unit=items[n].base_unit))
    db.commit()
    return {"admin":admin,"production":prod_user,"salesman_a":sa,"salesman_b":sb,
            "auditor":auditor,"owner":owner,"items":items,"product":p,"recipe":recipe}

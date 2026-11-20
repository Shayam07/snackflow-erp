from decimal import Decimal
from sqlalchemy import select
from app.database import Base, engine, SessionLocal
from app.models import Role, User, Item, Product, Customer, Supplier, Recipe, RecipeItem, StockMovement
from app.core.security import hash_password

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(User).where(User.username == "admin")):
            print("Seed data already present.")
            return
        db.add_all([Role(name="admin", description="Factory administration"),
                    Role(name="salesman", description="Field sales"),
                    Role(name="production", description="Production floor"),
                    Role(name="auditor", description="Read-only audit"),
                    Role(name="owner", description="Business owner")])
        db.flush()
        users = [
            User(username="admin", password_hash=hash_password("admin123"), role="admin"),
            User(username="production", password_hash=hash_password("prod123"), role="production"),
            User(username="salesman_a", password_hash=hash_password("sales123"), role="salesman"),
            User(username="salesman_b", password_hash=hash_password("sales123"), role="salesman"),
            User(username="auditor", password_hash=hash_password("audit123"), role="auditor"),
            User(username="owner", password_hash=hash_password("owner123"), role="owner"),
        ]
        db.add_all(users); db.flush()
        admin = users[0]
        specs = [
            ("Flour", "raw", "g", "100000", "0.042"),
            ("Cooking oil", "raw", "ml", "30000", "0.14"),
            ("Salt and spice mix", "raw", "g", "5000", "0.2"),
            ("200 g pouch", "packaging", "piece", "500", "2.50"),
            ("Carton", "packaging", "piece", "30", "15"),
            ("Murukku 200 g", "finished", "packet", "50", "0"),
        ]
        items = {}
        for name, typ, unit, qty, cost in specs:
            item = Item(name=name, item_type=typ, base_unit=unit,
                        hsn_code="2106", reorder_level=Decimal("0"),
                        conversion_factor=Decimal("20") if name == "Carton" else Decimal("1"))
            db.add(item); db.flush(); items[name] = item
            db.add(StockMovement(item_id=item.id, movement_type="opening",
                                 quantity=Decimal(qty), unit_cost=Decimal(cost),
                                 value=Decimal(qty)*Decimal(cost),
                                 source_doc_type="opening_balance", source_doc_id=1,
                                 created_by=admin.id))
        product = Product(item_id=items["Murukku 200 g"].id, family="Murukku",
                          pack_size_g=200, selling_price=Decimal("50"),
                          gst_rate=Decimal("5"))
        db.add(product); db.flush()
        customers = [
            Customer(name="Retailer A", customer_type="retailer", state="Tamil Nadu",
                     gstin="33ABCDE1234F1Z5", salesman_id=users[2].id),
            Customer(name="Distributor B", customer_type="distributor", state="Karnataka",
                     gstin="29ABCDE1234F1Z5", salesman_id=users[3].id),
        ]
        db.add_all(customers)
        supplier = Supplier(name="Benchmark Supplier", state="Tamil Nadu")
        db.add(supplier); db.flush()
        recipe = Recipe(product_id=product.id, family="Murukku", version=1, expected_packets=200,
                        tolerance_percent=Decimal("3"))
        db.add(recipe); db.flush()
        bom = [
            ("Flour", "40000"), ("Cooking oil", "10000"),
            ("Salt and spice mix", "1200"), ("200 g pouch", "200"), ("Carton", "10"),
        ]
        for name, qty in bom:
            db.add(RecipeItem(recipe_id=recipe.id, item_id=items[name].id,
                              quantity=Decimal(qty), unit=items[name].base_unit))
        db.commit()
        print("Seeded SnackFlow benchmark data.")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

"""Initialize the local SQLite database and seed default data."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import app
from db import db
from models import Category, Product, Staff


def init_db():
    with app.app_context():
        db.create_all()
        print("Tables created.")

        # Seed default categories if none exist
        if Category.query.count() == 0:
            defaults = [
                Category(name='General', tax_class='standard'),
                Category(name='Food & Beverage', tax_class='reduced'),
                Category(name='Electronics', tax_class='standard'),
                Category(name='Produce', tax_class='exempt'),
            ]
            db.session.add_all(defaults)
            db.session.commit()
            print(f"Seeded {len(defaults)} default categories.")

        # Seed a default admin if no staff exist
        if Staff.query.count() == 0:
            admin = Staff(name='Admin', pin='0000', role='admin')
            db.session.add(admin)
            db.session.commit()
            print("Seeded default admin (PIN: 0000). Change this immediately.")

        # Seed sample products for development
        if Product.query.count() == 0:
            cat = Category.query.filter_by(name='General').first()
            samples = [
                Product(name='Sample Item A', barcode='1234567890123', price=9.99, tax_rate=0.16, stock_qty=50, category_id=cat.id if cat else None),
                Product(name='Sample Item B', barcode='9876543210987', price=4.50, tax_rate=0.16, stock_qty=100, category_id=cat.id if cat else None),
                Product(name='Sample Item C', barcode='5555555555555', price=19.99, tax_rate=0.16, stock_qty=25, category_id=cat.id if cat else None),
            ]
            db.session.add_all(samples)
            db.session.commit()
            print(f"Seeded {len(samples)} sample products.")

        print("Database initialization complete.")


if __name__ == '__main__':
    init_db()

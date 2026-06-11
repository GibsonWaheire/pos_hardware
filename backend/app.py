from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_migrate import Migrate
from dotenv import load_dotenv
import os

from db import db

load_dotenv()

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///pos_hardware.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-change-in-production')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

db.init_app(app)
migrate = Migrate(app, db)

from models import *  # noqa: F401,F403 — registers models with SQLAlchemy

from routes.products import bp as products_bp
from routes.sales import bp as sales_bp
from routes.payments import bp as payments_bp
from routes.staff import bp as staff_bp
from routes.reports import bp as reports_bp
from routes.suppliers import bp as suppliers_bp
from routes.purchase_orders import bp as purchase_orders_bp
from routes.returns import bp as returns_bp
from routes.shifts import bp as shifts_bp
from routes.inventory import bp as inventory_bp
from routes.customers import bp as customers_bp
from routes.loyalty import bp as loyalty_bp
from routes.terminals import bp as terminals_bp
from routes.voids import bp as voids_bp
from routes.services import bp as services_bp
from routes.appointments import bp as appointments_bp
from routes.dashboard import bp as dashboard_bp
from routes.stores import bp as stores_bp
from routes.sync import bp as sync_bp
from routes.accounts import bp as accounts_bp
from routes.quotes import bp as quotes_bp
from routes.auth import bp as auth_bp
from routes.audit import bp as audit_bp
from routes.purchaser_limits import bp as purchaser_limits_bp
from routes.hardware import bp as hardware_bp

app.register_blueprint(products_bp)
app.register_blueprint(sales_bp)
app.register_blueprint(payments_bp)
app.register_blueprint(staff_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(suppliers_bp)
app.register_blueprint(purchase_orders_bp)
app.register_blueprint(returns_bp)
app.register_blueprint(shifts_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(customers_bp)
app.register_blueprint(loyalty_bp)
app.register_blueprint(terminals_bp)
app.register_blueprint(voids_bp)
app.register_blueprint(services_bp)
app.register_blueprint(appointments_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(stores_bp)
app.register_blueprint(sync_bp)
app.register_blueprint(accounts_bp)
app.register_blueprint(quotes_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(audit_bp)
app.register_blueprint(purchaser_limits_bp)
app.register_blueprint(hardware_bp)


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'POS Hardware API'})


# CORS
allowed_origins_raw = os.getenv('CORS_ORIGINS', '')
allowed_origins = [o.strip() for o in allowed_origins_raw.split(',') if o.strip()] or [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

CORS(app,
     origins=allowed_origins,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     supports_credentials=True,
     max_age=3600)


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin and (origin in allowed_origins or '*' in allowed_origins):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    return response


@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


def _start_auto_sync():
    """Background thread: sync to cloud every SYNC_INTERVAL_MINUTES minutes."""
    import threading, time
    from routes.sync import _do_sync

    interval = int(os.getenv('SYNC_INTERVAL_MINUTES', 15)) * 60

    def _loop():
        time.sleep(30)   # wait for app to fully start
        while True:
            try:
                _do_sync(app)
            except Exception as e:
                print(f'[auto-sync] error: {e}')
            time.sleep(interval)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    print(f'[auto-sync] started — every {os.getenv("SYNC_INTERVAL_MINUTES", 15)} min')


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5002))
    host = os.getenv('HOST', '0.0.0.0')

    if os.getenv('CLOUD_SYNC_AUTO', '0') == '1' and os.getenv('CLOUD_DB_URL'):
        _start_auto_sync()

    print(f"\n POS Hardware API on http://{host}:{port}/api")
    app.run(debug=True, port=port, host=host)

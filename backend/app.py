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

app.register_blueprint(products_bp)
app.register_blueprint(sales_bp)
app.register_blueprint(payments_bp)
app.register_blueprint(staff_bp)
app.register_blueprint(reports_bp)


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


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5002))
    host = os.getenv('HOST', '0.0.0.0')
    print(f"\n POS Hardware API on http://{host}:{port}/api")
    app.run(debug=True, port=port, host=host)

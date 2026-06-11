from flask import Blueprint, jsonify, request
from db import db
from models import Sale, SaleItem, Product
from datetime import datetime, date, timedelta
from sqlalchemy import func

bp = Blueprint('reports', __name__, url_prefix='/api/reports')


@bp.route('/sales', methods=['GET'])
def sales_report():
    """Sales summary grouped by day for a date range."""
    date_from = request.args.get('date_from', (date.today() - timedelta(days=30)).isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())

    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    sales = Sale.query.filter(
        Sale.status == 'completed',
        Sale.created_at >= start,
        Sale.created_at <= end,
    ).all()

    # Group by day
    by_day = {}
    for s in sales:
        day = s.created_at.date().isoformat()
        if day not in by_day:
            by_day[day] = {'date': day, 'transactions': 0, 'revenue': 0.0, 'tax': 0.0}
        by_day[day]['transactions'] += 1
        by_day[day]['revenue'] += s.total
        by_day[day]['tax'] += s.tax_amount

    rows = sorted(by_day.values(), key=lambda r: r['date'])
    for r in rows:
        r['revenue'] = round(r['revenue'], 2)
        r['tax'] = round(r['tax'], 2)

    return jsonify({
        'date_from': date_from,
        'date_to': date_to,
        'total_revenue': round(sum(r['revenue'] for r in rows), 2),
        'total_transactions': sum(r['transactions'] for r in rows),
        'rows': rows,
    })


@bp.route('/top-products', methods=['GET'])
def top_products():
    """Top-selling products by quantity and revenue."""
    date_from = request.args.get('date_from', (date.today() - timedelta(days=30)).isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())
    limit = min(int(request.args.get('limit', 20)), 100)

    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    rows = (
        db.session.query(
            SaleItem.product_id,
            SaleItem.product_name,
            func.sum(SaleItem.qty).label('total_qty'),
            func.sum(SaleItem.line_total).label('total_revenue'),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.status == 'completed', Sale.created_at >= start, Sale.created_at <= end)
        .group_by(SaleItem.product_id, SaleItem.product_name)
        .order_by(func.sum(SaleItem.line_total).desc())
        .limit(limit)
        .all()
    )

    return jsonify([
        {
            'product_id': r.product_id,
            'product_name': r.product_name,
            'total_qty': int(r.total_qty),
            'total_revenue': round(float(r.total_revenue), 2),
        }
        for r in rows
    ])


@bp.route('/payment-methods', methods=['GET'])
def payment_methods_breakdown():
    """Revenue breakdown by payment method."""
    date_from = request.args.get('date_from', date.today().isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())

    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    rows = (
        db.session.query(
            Sale.payment_method,
            func.count(Sale.id).label('count'),
            func.sum(Sale.total).label('total'),
        )
        .filter(Sale.status == 'completed', Sale.created_at >= start, Sale.created_at <= end)
        .group_by(Sale.payment_method)
        .all()
    )

    return jsonify([
        {'method': r.payment_method, 'count': r.count, 'total': round(float(r.total), 2)}
        for r in rows
    ])

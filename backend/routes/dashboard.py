from flask import Blueprint, jsonify
from db import db
from models import Sale, SaleItem, Customer, Product, PurchaseOrder, CustomerAccount
from datetime import datetime, date, timedelta
from sqlalchemy import func

bp = Blueprint('dashboard', __name__)


@bp.route('/api/dashboard')
def dashboard():
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    week_start = datetime.combine(today - timedelta(days=6), datetime.min.time())
    month_start = datetime.combine(today.replace(day=1), datetime.min.time())

    def sale_stats(start, end):
        rows = Sale.query.filter(
            Sale.status == 'completed',
            Sale.created_at >= start,
            Sale.created_at <= end,
        ).all()
        revenue = sum(s.total for s in rows)
        tips = sum(s.tip_amount or 0 for s in rows)
        return {
            'transactions': len(rows),
            'revenue': round(revenue, 2),
            'tips': round(tips, 2),
            'avg_sale': round(revenue / len(rows), 2) if rows else 0,
        }

    today_stats = sale_stats(today_start, today_end)
    week_stats = sale_stats(week_start, today_end)
    month_stats = sale_stats(month_start, today_end)

    # New customers today
    new_customers = Customer.query.filter(
        Customer.created_at >= today_start,
        Customer.created_at <= today_end,
    ).count()

    # Low stock products
    low_stock_count = Product.query.filter(
        Product.is_active == True,
        Product.stock_qty <= Product.low_stock_threshold,
        Product.stock_qty > 0,
    ).count()
    out_of_stock_count = Product.query.filter(
        Product.is_active == True,
        Product.stock_qty == 0,
    ).count()

    # Pending purchase orders
    pending_po_count = PurchaseOrder.query.filter(
        PurchaseOrder.status.in_(['draft', 'ordered'])
    ).count()

    # Customer accounts overview
    accounts = CustomerAccount.query.filter_by(is_active=True).all()
    total_account_balance = sum(a.balance for a in accounts)
    accounts_in_debt = sum(1 for a in accounts if a.balance < 0)
    total_debt = sum(-a.balance for a in accounts if a.balance < 0)
    total_credit = sum(a.balance for a in accounts if a.balance > 0)

    # Hourly breakdown (today, hours 0-23)
    today_sales = Sale.query.filter(
        Sale.status == 'completed',
        Sale.created_at >= today_start,
        Sale.created_at <= today_end,
    ).all()
    hourly = {}
    for s in today_sales:
        h = s.created_at.hour
        if h not in hourly:
            hourly[h] = {'hour': h, 'transactions': 0, 'revenue': 0.0}
        hourly[h]['transactions'] += 1
        hourly[h]['revenue'] += s.total
    hourly_list = [
        {**hourly.get(h, {'hour': h, 'transactions': 0, 'revenue': 0.0}),
         'revenue': round(hourly.get(h, {}).get('revenue', 0), 2)}
        for h in range(24)
    ]

    # Daily trend — last 14 days
    trend_start = datetime.combine(today - timedelta(days=13), datetime.min.time())
    trend_sales = Sale.query.filter(
        Sale.status == 'completed',
        Sale.created_at >= trend_start,
        Sale.created_at <= today_end,
    ).all()
    by_day = {}
    for s in trend_sales:
        d = s.created_at.date().isoformat()
        if d not in by_day:
            by_day[d] = {'date': d, 'transactions': 0, 'revenue': 0.0}
        by_day[d]['transactions'] += 1
        by_day[d]['revenue'] += s.total
    daily_trend = []
    for i in range(14):
        d = (today - timedelta(days=13 - i)).isoformat()
        entry = by_day.get(d, {'date': d, 'transactions': 0, 'revenue': 0.0})
        daily_trend.append({**entry, 'revenue': round(entry['revenue'], 2)})

    # Top items (products + services combined) — last 30 days
    top_start = datetime.combine(today - timedelta(days=29), datetime.min.time())
    top_rows = (
        db.session.query(
            SaleItem.product_name,
            func.sum(SaleItem.qty).label('total_qty'),
            func.sum(SaleItem.line_total).label('total_revenue'),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.status == 'completed', Sale.created_at >= top_start)
        .group_by(SaleItem.product_name)
        .order_by(func.sum(SaleItem.line_total).desc())
        .limit(8)
        .all()
    )
    top_items = [{'name': r.product_name, 'qty': int(r.total_qty), 'revenue': round(float(r.total_revenue), 2)} for r in top_rows]

    # Payment split — today
    payment_rows = (
        db.session.query(Sale.payment_method, func.count(Sale.id), func.sum(Sale.total))
        .filter(Sale.status == 'completed', Sale.created_at >= today_start, Sale.created_at <= today_end)
        .group_by(Sale.payment_method)
        .all()
    )
    payment_split = [{'method': r[0], 'count': r[1], 'total': round(float(r[2] or 0), 2)} for r in payment_rows]

    return jsonify({
        'today': {**today_stats, 'new_customers': new_customers},
        'week': week_stats,
        'month': month_stats,
        'hourly': hourly_list,
        'daily_trend': daily_trend,
        'top_items': top_items,
        'payment_split': payment_split,
        'inventory': {
            'low_stock': low_stock_count,
            'out_of_stock': out_of_stock_count,
        },
        'purchase_orders': {
            'pending': pending_po_count,
        },
        'accounts': {
            'count': len(accounts),
            'total_balance': round(total_account_balance, 2),
            'total_credit': round(total_credit, 2),
            'total_debt': round(total_debt, 2),
            'accounts_in_debt': accounts_in_debt,
        },
    })

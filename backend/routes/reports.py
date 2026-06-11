from flask import Blueprint, jsonify, request, Response
from db import db
from models import Sale, SaleItem, Product, Category
from datetime import datetime, date, timedelta
from sqlalchemy import func
import csv
import io

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


@bp.route('/by-cashier', methods=['GET'])
def by_cashier():
    """Revenue and transaction count grouped by cashier."""
    date_from = request.args.get('date_from', (date.today() - timedelta(days=30)).isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())
    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    rows = (
        db.session.query(
            Sale.cashier_name,
            func.count(Sale.id).label('transactions'),
            func.sum(Sale.total).label('revenue'),
            func.sum(Sale.tax_amount).label('tax'),
            func.avg(Sale.total).label('avg_sale'),
        )
        .filter(Sale.status == 'completed', Sale.created_at >= start, Sale.created_at <= end)
        .group_by(Sale.cashier_name)
        .order_by(func.sum(Sale.total).desc())
        .all()
    )

    return jsonify([{
        'cashier_name': r.cashier_name or 'Unknown',
        'transactions': r.transactions,
        'revenue': round(float(r.revenue or 0), 2),
        'tax': round(float(r.tax or 0), 2),
        'avg_sale': round(float(r.avg_sale or 0), 2),
    } for r in rows])


@bp.route('/by-category', methods=['GET'])
def by_category():
    """Revenue grouped by product category."""
    date_from = request.args.get('date_from', (date.today() - timedelta(days=30)).isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())
    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    rows = (
        db.session.query(
            Category.name.label('category_name'),
            func.count(SaleItem.id).label('line_items'),
            func.sum(SaleItem.qty).label('total_qty'),
            func.sum(SaleItem.line_total).label('revenue'),
        )
        .join(Product, Product.id == SaleItem.product_id)
        .join(Category, Category.id == Product.category_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.status == 'completed', Sale.created_at >= start, Sale.created_at <= end)
        .group_by(Category.name)
        .order_by(func.sum(SaleItem.line_total).desc())
        .all()
    )

    # Also capture uncategorised items
    uncategorised = (
        db.session.query(
            func.sum(SaleItem.line_total).label('revenue'),
            func.sum(SaleItem.qty).label('total_qty'),
            func.count(SaleItem.id).label('line_items'),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .outerjoin(Product, Product.id == SaleItem.product_id)
        .filter(
            Sale.status == 'completed',
            Sale.created_at >= start,
            Sale.created_at <= end,
            (Product.category_id == None) | (SaleItem.product_id == None),
        )
        .first()
    )

    result = [{
        'category_name': r.category_name,
        'line_items': r.line_items,
        'total_qty': int(r.total_qty or 0),
        'revenue': round(float(r.revenue or 0), 2),
    } for r in rows]

    if uncategorised and uncategorised.revenue:
        result.append({
            'category_name': 'Uncategorised / Services',
            'line_items': uncategorised.line_items,
            'total_qty': int(uncategorised.total_qty or 0),
            'revenue': round(float(uncategorised.revenue or 0), 2),
        })

    return jsonify(result)


@bp.route('/inventory', methods=['GET'])
def inventory_report():
    """Stock value, low-stock items, and top turnover products."""
    from models import StockAdjustment
    products = Product.query.filter_by(is_active=True).all()

    total_value = sum(p.price * p.stock_qty for p in products)
    out_of_stock = [p for p in products if p.stock_qty == 0]
    low_stock = [p for p in products if 0 < p.stock_qty <= p.low_stock_threshold]
    healthy = [p for p in products if p.stock_qty > p.low_stock_threshold]

    # Top 10 by stock value
    by_value = sorted(products, key=lambda p: p.price * p.stock_qty, reverse=True)[:10]

    return jsonify({
        'summary': {
            'total_products': len(products),
            'total_stock_value': round(total_value, 2),
            'out_of_stock_count': len(out_of_stock),
            'low_stock_count': len(low_stock),
            'healthy_count': len(healthy),
        },
        'out_of_stock': [{'id': p.id, 'name': p.name, 'price': p.price} for p in out_of_stock[:20]],
        'low_stock': [{'id': p.id, 'name': p.name, 'stock_qty': p.stock_qty, 'threshold': p.low_stock_threshold, 'price': p.price} for p in low_stock[:20]],
        'top_by_value': [{'id': p.id, 'name': p.name, 'stock_qty': p.stock_qty, 'price': p.price, 'value': round(p.price * p.stock_qty, 2)} for p in by_value],
    })


@bp.route('/export/csv', methods=['GET'])
def export_csv():
    """Download sales data as CSV for the given date range."""
    date_from = request.args.get('date_from', (date.today() - timedelta(days=30)).isoformat())
    date_to = request.args.get('date_to', date.today().isoformat())
    report_type = request.args.get('type', 'sales')  # sales | items | cashier

    start = datetime.fromisoformat(date_from)
    end = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)

    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == 'items':
        writer.writerow(['Date', 'Receipt', 'Product', 'Qty', 'Unit Price', 'Discount', 'Line Total', 'Item Type'])
        rows = (
            db.session.query(SaleItem, Sale)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .filter(Sale.status == 'completed', Sale.created_at >= start, Sale.created_at <= end)
            .order_by(Sale.created_at.desc())
            .all()
        )
        for item, sale in rows:
            writer.writerow([
                sale.created_at.strftime('%Y-%m-%d %H:%M'),
                sale.receipt_number,
                item.product_name,
                item.qty,
                item.unit_price,
                item.discount,
                item.line_total,
                item.item_type or 'product',
            ])
    elif report_type == 'cashier':
        writer.writerow(['Cashier', 'Transactions', 'Revenue', 'Tax', 'Avg Sale'])
        rows = (
            db.session.query(
                Sale.cashier_name,
                func.count(Sale.id),
                func.sum(Sale.total),
                func.sum(Sale.tax_amount),
                func.avg(Sale.total),
            )
            .filter(Sale.status == 'completed', Sale.created_at >= start, Sale.created_at <= end)
            .group_by(Sale.cashier_name)
            .all()
        )
        for r in rows:
            writer.writerow([r[0] or 'Unknown', r[1], round(float(r[2] or 0), 2), round(float(r[3] or 0), 2), round(float(r[4] or 0), 2)])
    else:
        writer.writerow(['Date', 'Receipt', 'Cashier', 'Payment Method', 'Subtotal', 'Discount', 'Tax', 'Tip', 'Total', 'Customer'])
        sales = Sale.query.filter(
            Sale.status == 'completed',
            Sale.created_at >= start,
            Sale.created_at <= end,
        ).order_by(Sale.created_at.desc()).all()
        for s in sales:
            writer.writerow([
                s.created_at.strftime('%Y-%m-%d %H:%M'),
                s.receipt_number,
                s.cashier_name or '',
                s.payment_method,
                s.subtotal,
                s.discount_total,
                s.tax_amount,
                s.tip_amount or 0,
                s.total,
                s.customer_name or '',
            ])

    output.seek(0)
    filename = f'pos_export_{report_type}_{date_from}_{date_to}.csv'
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )

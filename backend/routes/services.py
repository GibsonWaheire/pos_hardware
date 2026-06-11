from flask import Blueprint, request, jsonify
from db import db
from models import Service, ServiceCategory

bp = Blueprint('services', __name__)


# --- Service Categories ---

@bp.route('/api/service-categories', methods=['GET'])
def get_service_categories():
    cats = ServiceCategory.query.order_by(ServiceCategory.name).all()
    return jsonify([{
        'id': c.id, 'name': c.name, 'color': c.color,
    } for c in cats])


@bp.route('/api/service-categories', methods=['POST'])
def create_service_category():
    d = request.json or {}
    if not d.get('name'):
        return jsonify({'error': 'name is required'}), 400
    cat = ServiceCategory(name=d['name'], color=d.get('color', '#4f6ef7'))
    db.session.add(cat)
    db.session.commit()
    return jsonify({'id': cat.id, 'name': cat.name, 'color': cat.color}), 201


@bp.route('/api/service-categories/<int:cid>', methods=['PUT'])
def update_service_category(cid):
    cat = ServiceCategory.query.get_or_404(cid)
    d = request.json or {}
    if 'name' in d:
        cat.name = d['name']
    if 'color' in d:
        cat.color = d['color']
    db.session.commit()
    return jsonify({'id': cat.id, 'name': cat.name, 'color': cat.color})


@bp.route('/api/service-categories/<int:cid>', methods=['DELETE'])
def delete_service_category(cid):
    cat = ServiceCategory.query.get_or_404(cid)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'ok': True})


# --- Services ---

def _service_dict(s):
    return {
        'id': s.id,
        'name': s.name,
        'description': s.description,
        'price': s.price,
        'duration_minutes': s.duration_minutes,
        'category_id': s.category_id,
        'category_name': s.category.name if s.category else None,
        'category_color': s.category.color if s.category else None,
        'is_active': s.is_active,
    }


@bp.route('/api/services', methods=['GET'])
def get_services():
    q = Service.query
    if request.args.get('active_only') == '1':
        q = q.filter_by(is_active=True)
    if request.args.get('category_id'):
        q = q.filter_by(category_id=int(request.args['category_id']))
    services = q.order_by(Service.name).all()
    return jsonify([_service_dict(s) for s in services])


@bp.route('/api/services/<int:sid>', methods=['GET'])
def get_service(sid):
    s = Service.query.get_or_404(sid)
    return jsonify(_service_dict(s))


@bp.route('/api/services', methods=['POST'])
def create_service():
    d = request.json or {}
    if not d.get('name') or d.get('price') is None:
        return jsonify({'error': 'name and price are required'}), 400
    s = Service(
        name=d['name'],
        description=d.get('description', ''),
        price=float(d['price']),
        duration_minutes=int(d.get('duration_minutes', 30)),
        category_id=d.get('category_id'),
        is_active=d.get('is_active', True),
    )
    db.session.add(s)
    db.session.commit()
    return jsonify(_service_dict(s)), 201


@bp.route('/api/services/<int:sid>', methods=['PUT'])
def update_service(sid):
    s = Service.query.get_or_404(sid)
    d = request.json or {}
    for field in ('name', 'description', 'is_active'):
        if field in d:
            setattr(s, field, d[field])
    if 'price' in d:
        s.price = float(d['price'])
    if 'duration_minutes' in d:
        s.duration_minutes = int(d['duration_minutes'])
    if 'category_id' in d:
        s.category_id = d['category_id']
    db.session.commit()
    return jsonify(_service_dict(s))


@bp.route('/api/services/<int:sid>', methods=['DELETE'])
def delete_service(sid):
    s = Service.query.get_or_404(sid)
    s.is_active = False  # soft delete
    db.session.commit()
    return jsonify({'ok': True})

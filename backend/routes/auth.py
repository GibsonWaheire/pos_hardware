from flask import Blueprint, jsonify, request, session
from db import db
from models import Staff

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@bp.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    pin = str(data.get('pin', '')).strip()
    staff_id = data.get('staff_id')

    if not pin:
        return jsonify({'error': 'PIN is required'}), 400

    query = Staff.query.filter_by(pin=pin, is_active=True)
    if staff_id:
        query = query.filter_by(id=int(staff_id))

    member = query.first()
    if not member:
        return jsonify({'error': 'Invalid PIN'}), 401

    session.permanent = True
    session['staff_id'] = member.id
    session['role'] = member.role

    return jsonify({'staff': member.to_dict()})


@bp.route('/me', methods=['GET'])
def me():
    staff_id = session.get('staff_id')
    if not staff_id:
        return jsonify({'error': 'Not authenticated'}), 401

    member = Staff.query.get(staff_id)
    if not member or not member.is_active:
        session.clear()
        return jsonify({'error': 'Not authenticated'}), 401

    return jsonify({'staff': member.to_dict()})


@bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

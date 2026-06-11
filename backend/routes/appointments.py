from flask import Blueprint, request, jsonify
from datetime import datetime
from db import db
from models import Appointment, AppointmentService, Service, Staff, Customer

bp = Blueprint('appointments', __name__)

VALID_STATUSES = ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show')


def _appt_dict(a, include_services=True):
    d = {
        'id': a.id,
        'client_id': a.client_id,
        'client_name': a.client_name,
        'client_phone': a.client_phone,
        'staff_id': a.staff_id,
        'staff_name': a.staff_name,
        'start_time': a.start_time.isoformat() if a.start_time else None,
        'end_time': a.end_time.isoformat() if a.end_time else None,
        'status': a.status,
        'notes': a.notes,
        'total_price': a.total_price,
        'sale_id': a.sale_id,
        'created_at': a.created_at.isoformat() if a.created_at else None,
    }
    if include_services:
        d['services'] = [{
            'id': s.id,
            'service_id': s.service_id,
            'service_name': s.service_name,
            'staff_id': s.staff_id,
            'staff_name': s.staff_name,
            'price': s.price,
            'duration_minutes': s.duration_minutes,
        } for s in a.services]
    return d


@bp.route('/api/appointments', methods=['GET'])
def get_appointments():
    q = Appointment.query
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    staff_id = request.args.get('staff_id')
    status = request.args.get('status')

    if date_from:
        q = q.filter(Appointment.start_time >= datetime.fromisoformat(date_from))
    if date_to:
        # include full day
        dt = datetime.fromisoformat(date_to)
        from datetime import timedelta
        q = q.filter(Appointment.start_time < dt + timedelta(days=1))
    if staff_id:
        q = q.filter_by(staff_id=int(staff_id))
    if status:
        q = q.filter_by(status=status)

    appts = q.order_by(Appointment.start_time).all()
    return jsonify([_appt_dict(a) for a in appts])


@bp.route('/api/appointments/<int:aid>', methods=['GET'])
def get_appointment(aid):
    a = Appointment.query.get_or_404(aid)
    return jsonify(_appt_dict(a))


@bp.route('/api/appointments', methods=['POST'])
def create_appointment():
    d = request.json or {}
    if not d.get('start_time'):
        return jsonify({'error': 'start_time is required'}), 400
    if not d.get('services'):
        return jsonify({'error': 'at least one service is required'}), 400

    # Resolve client name
    client_name = d.get('client_name', '')
    client_phone = d.get('client_phone', '')
    if d.get('client_id'):
        c = Customer.query.get(d['client_id'])
        if c:
            client_name = client_name or c.name
            client_phone = client_phone or c.phone

    # Resolve staff name
    staff_name = d.get('staff_name', '')
    if d.get('staff_id') and not staff_name:
        st = Staff.query.get(d['staff_id'])
        if st:
            staff_name = st.name

    start_time = datetime.fromisoformat(d['start_time'])

    # Calculate end_time from services if not provided
    total_duration = sum(s.get('duration_minutes', 30) for s in d['services'])
    end_time = datetime.fromisoformat(d['end_time']) if d.get('end_time') else \
        start_time.replace(second=0, microsecond=0).__class__(
            *start_time.timetuple()[:5]
        )
    if not d.get('end_time'):
        from datetime import timedelta
        end_time = start_time + timedelta(minutes=total_duration)

    total_price = sum(float(s.get('price', 0)) for s in d['services'])

    appt = Appointment(
        client_id=d.get('client_id'),
        client_name=client_name,
        client_phone=client_phone,
        staff_id=d.get('staff_id'),
        staff_name=staff_name,
        start_time=start_time,
        end_time=end_time,
        status=d.get('status', 'scheduled'),
        notes=d.get('notes', ''),
        total_price=total_price,
    )
    db.session.add(appt)
    db.session.flush()

    for svc_d in d['services']:
        svc_name = svc_d.get('service_name', '')
        svc_staff_name = svc_d.get('staff_name', staff_name)
        if svc_d.get('service_id') and not svc_name:
            svc = Service.query.get(svc_d['service_id'])
            if svc:
                svc_name = svc.name
        if svc_d.get('staff_id') and not svc_staff_name:
            st2 = Staff.query.get(svc_d['staff_id'])
            if st2:
                svc_staff_name = st2.name

        appt_svc = AppointmentService(
            appointment_id=appt.id,
            service_id=svc_d.get('service_id'),
            service_name=svc_name,
            staff_id=svc_d.get('staff_id') or d.get('staff_id'),
            staff_name=svc_staff_name,
            price=float(svc_d.get('price', 0)),
            duration_minutes=int(svc_d.get('duration_minutes', 30)),
        )
        db.session.add(appt_svc)

    db.session.commit()
    return jsonify(_appt_dict(appt)), 201


@bp.route('/api/appointments/<int:aid>', methods=['PUT'])
def update_appointment(aid):
    a = Appointment.query.get_or_404(aid)
    d = request.json or {}

    for field in ('client_name', 'client_phone', 'notes', 'status', 'sale_id'):
        if field in d:
            setattr(a, field, d[field])
    if 'staff_id' in d:
        a.staff_id = d['staff_id']
        if d['staff_id']:
            st = Staff.query.get(d['staff_id'])
            if st:
                a.staff_name = st.name
    if 'start_time' in d:
        a.start_time = datetime.fromisoformat(d['start_time'])
    if 'end_time' in d:
        a.end_time = datetime.fromisoformat(d['end_time'])
    if 'total_price' in d:
        a.total_price = float(d['total_price'])
    if d.get('status') and d['status'] not in VALID_STATUSES:
        return jsonify({'error': f'invalid status, must be one of {VALID_STATUSES}'}), 400

    db.session.commit()
    return jsonify(_appt_dict(a))


@bp.route('/api/appointments/<int:aid>/status', methods=['POST'])
def update_status(aid):
    a = Appointment.query.get_or_404(aid)
    d = request.json or {}
    new_status = d.get('status')
    if not new_status or new_status not in VALID_STATUSES:
        return jsonify({'error': f'status must be one of {VALID_STATUSES}'}), 400
    a.status = new_status
    db.session.commit()
    return jsonify(_appt_dict(a))


@bp.route('/api/appointments/<int:aid>', methods=['DELETE'])
def delete_appointment(aid):
    a = Appointment.query.get_or_404(aid)
    a.status = 'cancelled'
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/appointments/by-client/<int:client_id>', methods=['GET'])
def get_client_appointments(client_id):
    appts = Appointment.query.filter_by(client_id=client_id)\
        .order_by(Appointment.start_time.desc()).limit(20).all()
    return jsonify([_appt_dict(a) for a in appts])

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate, login, logout
from django.utils import timezone
from django.db.models import Q, Count
from django.db.models.functions import TruncDate
from django.middleware.csrf import get_token
from .models import (
    Outlet, ChecklistInstance, InstanceItem, FlaggedItem, GroupOutletScope,
)


def get_user_outlets(user):
    """Return queryset of Outlets the user can access based on group scopes."""
    groups = user.groups.all()
    if not groups.exists():
        return Outlet.objects.none()

    # If any group has zero scope rows → global access
    for group in groups:
        if not group.outlet_scopes.exists():
            return Outlet.objects.all()

    # Union of scoped outlets across all groups
    outlet_ids = GroupOutletScope.objects.filter(
        group__in=groups
    ).values_list('outlet_id', flat=True)
    return Outlet.objects.filter(id__in=outlet_ids)


def _user_info(user, outlets):
    return {
        'id': user.id,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'outlets': [
            {'id': str(o.id), 'name': o.name}
            for o in outlets
        ],
    }


def _parse_filters(request, outlets):
    """Parse common query params and return filtered outlet queryset + date range."""
    outlet_id = request.query_params.get('outlet')
    date_from = request.query_params.get('date_from')
    date_to = request.query_params.get('date_to')

    if outlet_id:
        outlets = outlets.filter(id=outlet_id)

    return outlets, date_from, date_to


# ─── Auth endpoints ─────────────────────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def reports_login(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
    login(request, user)
    outlets = get_user_outlets(user)
    return Response({
        'user': _user_info(user, outlets),
        'csrfToken': get_token(request),
    })


@api_view(['POST'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def reports_logout(request):
    logout(request)
    return Response({'success': True})


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def reports_me(request):
    outlets = get_user_outlets(request.user)
    return Response({
        'user': _user_info(request.user, outlets),
        'csrfToken': get_token(request),
    })


# ─── Reporting data endpoints ───────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def report_summary(request):
    outlets = get_user_outlets(request.user)
    outlets, date_from, date_to = _parse_filters(request, outlets)

    flags_qs = FlaggedItem.objects.filter(
        instance_item__instance__team__outlet__in=outlets
    )
    instances_qs = ChecklistInstance.objects.filter(team__outlet__in=outlets)

    if date_from:
        flags_qs = flags_qs.filter(flagged_at__date__gte=date_from)
        instances_qs = instances_qs.filter(date_label__gte=date_from)
    if date_to:
        flags_qs = flags_qs.filter(flagged_at__date__lte=date_to)
        instances_qs = instances_qs.filter(date_label__lte=date_to)

    active_flags = flags_qs.filter(acknowledged_at__isnull=True).count()
    total_flags = flags_qs.count()
    expired_checklists = instances_qs.filter(status='expired').count()
    open_reworks = instances_qs.filter(status='rejected').count()
    total_completed = instances_qs.filter(status__in=['completed', 'verified']).count()
    total_instances = instances_qs.count()

    # On-time completion rate, grouped by outlet or team
    # If a single outlet is selected, break down by team; otherwise by outlet
    outlet_filter = request.query_params.get('outlet')
    completed_instances = instances_qs.filter(
        status__in=['completed', 'verified']
    ).select_related('template', 'team__outlet')

    on_time_buckets = {}  # key → {on_time, with_deadline, label}
    on_time_total = 0
    with_deadline_total = 0

    for inst in completed_instances:
        deadline = inst.get_deadline()
        if deadline is None:
            continue

        if outlet_filter:
            key = str(inst.team_id)
            label = inst.team.name if inst.team else 'Unknown'
        else:
            key = str(inst.team.outlet_id) if inst.team and inst.team.outlet else 'unknown'
            label = inst.team.outlet.name if inst.team and inst.team.outlet else 'Unknown'

        if key not in on_time_buckets:
            on_time_buckets[key] = {'label': label, 'on_time': 0, 'with_deadline': 0}

        on_time_buckets[key]['with_deadline'] += 1
        with_deadline_total += 1

        completion_time = inst.synced_at or inst.created_at
        if completion_time and completion_time <= deadline:
            on_time_buckets[key]['on_time'] += 1
            on_time_total += 1

    on_time_breakdown = [
        {
            'label': b['label'],
            'on_time': b['on_time'],
            'with_deadline': b['with_deadline'],
        }
        for b in sorted(on_time_buckets.values(), key=lambda x: x['label'])
    ]

    return Response({
        'active_flags': active_flags,
        'total_flags': total_flags,
        'expired_checklists': expired_checklists,
        'open_reworks': open_reworks,
        'total_completed': total_completed,
        'total_instances': total_instances,
        'on_time': on_time_total,
        'with_deadline': with_deadline_total,
        'on_time_breakdown': on_time_breakdown,
    })


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def report_flagged_items(request):
    outlets = get_user_outlets(request.user)
    outlets, date_from, date_to = _parse_filters(request, outlets)
    flag_status = request.query_params.get('status')

    qs = FlaggedItem.objects.filter(
        instance_item__instance__team__outlet__in=outlets
    ).select_related(
        'instance_item__instance__team__outlet',
        'instance_item__instance__template',
    )

    if date_from:
        qs = qs.filter(flagged_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(flagged_at__date__lte=date_to)
    if flag_status == 'active':
        qs = qs.filter(acknowledged_at__isnull=True)
    elif flag_status == 'acknowledged':
        qs = qs.filter(acknowledged_at__isnull=False)

    results = []
    for flag in qs.order_by('-flagged_at'):
        item = flag.instance_item
        inst = item.instance
        photo_url = None
        if flag.photo:
            try:
                photo_url = request.build_absolute_uri(flag.photo.url)
            except Exception:
                pass
        results.append({
            'id': str(flag.id),
            'item_text': item.item_text,
            'description': flag.description,
            'photo_url': photo_url,
            'flagged_at': flag.flagged_at,
            'acknowledged_at': flag.acknowledged_at,
            'acknowledged_by': flag.acknowledged_by,
            'status': flag.status,
            'checklist_title': inst.template.title if inst.template else '',
            'date_label': inst.date_label,
            'team_name': inst.team.name if inst.team else '',
            'outlet_name': inst.team.outlet.name if inst.team and inst.team.outlet else '',
        })

    return Response(results)


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def report_expired_checklists(request):
    outlets = get_user_outlets(request.user)
    outlets, date_from, date_to = _parse_filters(request, outlets)

    qs = ChecklistInstance.objects.filter(
        team__outlet__in=outlets,
        status='expired',
    ).select_related('team__outlet', 'template')

    if date_from:
        qs = qs.filter(date_label__gte=date_from)
    if date_to:
        qs = qs.filter(date_label__lte=date_to)

    results = []
    for inst in qs.order_by('-created_at'):
        deadline = inst.get_deadline()
        results.append({
            'id': str(inst.id),
            'checklist_title': inst.template.title if inst.template else '',
            'date_label': inst.date_label,
            'team_name': inst.team.name if inst.team else '',
            'outlet_name': inst.team.outlet.name if inst.team and inst.team.outlet else '',
            'created_at': inst.created_at,
            'deadline': deadline,
        })

    return Response(results)


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def report_expired_supervisor(request):
    outlets = get_user_outlets(request.user)
    outlets, date_from, date_to = _parse_filters(request, outlets)

    qs = ChecklistInstance.objects.filter(
        team__outlet__in=outlets,
        status__in=['completed', 'resubmitted'],
        supervisor_signed_off=False,
    ).select_related('team__outlet', 'template')

    if date_from:
        qs = qs.filter(date_label__gte=date_from)
    if date_to:
        qs = qs.filter(date_label__lte=date_to)

    # Python-side filter for expired supervisor deadlines
    now = timezone.now()
    results = []
    for inst in qs.order_by('-created_at'):
        deadline = inst.get_supervisor_deadline()
        if deadline and now > deadline:
            results.append({
                'id': str(inst.id),
                'checklist_title': inst.template.title if inst.template else '',
                'date_label': inst.date_label,
                'team_name': inst.team.name if inst.team else '',
                'outlet_name': inst.team.outlet.name if inst.team and inst.team.outlet else '',
                'completed_at': inst.synced_at or inst.created_at,
                'supervisor_deadline': deadline,
            })

    return Response(results)


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def report_open_reworks(request):
    outlets = get_user_outlets(request.user)
    outlets, date_from, date_to = _parse_filters(request, outlets)

    qs = ChecklistInstance.objects.filter(
        team__outlet__in=outlets,
        status='rejected',
    ).select_related('team__outlet', 'template').prefetch_related('items')

    if date_from:
        qs = qs.filter(date_label__gte=date_from)
    if date_to:
        qs = qs.filter(date_label__lte=date_to)

    results = []
    for inst in qs.order_by('-created_at'):
        rejected_items = [
            {
                'item_text': item.item_text,
                'supervisor_comment': item.supervisor_comment,
            }
            for item in inst.items.all()
            if item.supervisor_confirmed is False
        ]
        results.append({
            'id': str(inst.id),
            'checklist_title': inst.template.title if inst.template else '',
            'date_label': inst.date_label,
            'team_name': inst.team.name if inst.team else '',
            'outlet_name': inst.team.outlet.name if inst.team and inst.team.outlet else '',
            'supervisor_name': inst.supervisor_name,
            'rejected_at': inst.supervisor_signed_at,
            'rejected_items': rejected_items,
        })

    return Response(results)


@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([IsAuthenticated])
def report_flag_trends(request):
    outlets = get_user_outlets(request.user)
    outlets, date_from, date_to = _parse_filters(request, outlets)

    qs = FlaggedItem.objects.filter(
        instance_item__instance__team__outlet__in=outlets
    )

    if date_from:
        qs = qs.filter(flagged_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(flagged_at__date__lte=date_to)

    trends = (
        qs.annotate(date=TruncDate('flagged_at'))
        .values('date', 'instance_item__instance__team__outlet__name')
        .annotate(count=Count('id'))
        .order_by('date')
    )

    results = [
        {
            'date': row['date'].isoformat(),
            'outlet': row['instance_item__instance__team__outlet__name'],
            'count': row['count'],
        }
        for row in trends
    ]

    return Response(results)

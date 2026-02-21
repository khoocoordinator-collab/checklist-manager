from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
from django.db import transaction
from django.db.models import Prefetch
from .models import Team, ChecklistTemplate, TemplateItem, Schedule, ChecklistInstance, InstanceItem, Signature, FlaggedItem
from .serializers import (
    TeamSerializer, ChecklistTemplateSerializer, ChecklistTemplateCreateSerializer,
    ScheduleSerializer, ChecklistInstanceSerializer, InstanceItemSerializer,
    SignatureSerializer, FlaggedItemSerializer
)


class ChecklistTemplateViewSet(viewsets.ModelViewSet):
    queryset = ChecklistTemplate.objects.filter(is_hidden=False).select_related(
        'team', 'schedule'
    ).prefetch_related('items')
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.action == 'create':
            return ChecklistTemplateCreateSerializer
        return ChecklistTemplateSerializer

    def perform_create(self, serializer):
        from django.contrib.auth.models import User
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
            serializer.save(created_by=admin_user)


class ScheduleViewSet(viewsets.ModelViewSet):
    queryset = Schedule.objects.filter(is_active=True)
    serializer_class = ScheduleSerializer
    permission_classes = [AllowAny]


class ChecklistInstanceViewSet(viewsets.ModelViewSet):
    queryset = ChecklistInstance.objects.all()
    serializer_class = ChecklistInstanceSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = ChecklistInstance.objects.select_related(
            'template__schedule', 'team__outlet', 'supervisor_team'
        ).prefetch_related(
            'signature',
            Prefetch(
                'items',
                queryset=InstanceItem.objects.prefetch_related(
                    Prefetch(
                        'flags',
                        queryset=FlaggedItem.objects.filter(resolved_at__isnull=True),
                        to_attr='active_flags'
                    )
                )
            ),
        )

        team_id = self.request.query_params.get('team')
        supervisor_team_id = self.request.query_params.get('supervisor_team')
        status_param = self.request.query_params.get('status')

        if team_id:
            queryset = queryset.filter(team_id=team_id)

        if supervisor_team_id:
            queryset = queryset.filter(supervisor_team_id=supervisor_team_id)

        if status_param:
            # Support comma-separated statuses: ?status=completed,verified,resubmitted
            statuses = [s.strip() for s in status_param.split(',') if s.strip()]
            if len(statuses) == 1:
                queryset = queryset.filter(status=statuses[0])
            else:
                queryset = queryset.filter(status__in=statuses)

        return queryset

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def sync(self, request):
        import logging
        logger = logging.getLogger(__name__)
        
        data = request.data
        team_id = data.get('team')
        
        logger.info(f"Sync request for team: {team_id}")
        logger.info(f"Request data: {data}")

        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            logger.error(f"Team not found: {team_id}")
            return Response({'error': 'Team not found', 'code': 'TEAM_NOT_FOUND'}, status=status.HTTP_404_NOT_FOUND)

        instances_data = data.get('instances', [])
        if not instances_data:
            logger.warning("No instances provided in sync request")
            return Response({'error': 'No instances provided', 'code': 'NO_INSTANCES'}, status=status.HTTP_400_BAD_REQUEST)

        processed_instances = []
        errors = []

        for idx, instance_data in enumerate(instances_data):
            try:
                items_data = instance_data.pop('items', [])
                signature_data = instance_data.pop('signature_data', None)
                instance_id = instance_data.get('id')
                instance_data['team'] = team.id
                instance_data['synced_at'] = timezone.now()

                # Try to update existing instance, or create new
                original_status = None
                try:
                    existing = ChecklistInstance.objects.get(id=instance_id)
                    original_status = existing.status
                    serializer = self.get_serializer(existing, data=instance_data, partial=True)
                    action = 'updated'
                except ChecklistInstance.DoesNotExist:
                    serializer = self.get_serializer(data=instance_data)
                    action = 'created'

                if serializer.is_valid():
                    instance = serializer.save()
                    all_checked = True

                    # Update/create items — bulk-fetch existing items first
                    item_ids = [item_data.get('id') for item_data in items_data if item_data.get('id')]
                    existing_items_map = {
                        str(item.pk): item
                        for item in InstanceItem.objects.filter(id__in=item_ids)
                    } if item_ids else {}

                    for item_data in items_data:
                        item_id = item_data.get('id')
                        item_data['instance'] = instance.id

                        # Set checked_at if checked but no timestamp
                        if item_data.get('is_checked') and not item_data.get('checked_at'):
                            item_data['checked_at'] = timezone.now()

                        if not item_data.get('is_checked'):
                            all_checked = False

                        existing_item = existing_items_map.get(str(item_id)) if item_id else None
                        if existing_item:
                            item_serializer = InstanceItemSerializer(existing_item, data=item_data, partial=True)
                        else:
                            item_serializer = InstanceItemSerializer(data=item_data)

                        if item_serializer.is_valid():
                            item_serializer.save()
                        else:
                            all_checked = False

                    # Handle signature if provided
                    has_signature = False
                    if signature_data and signature_data.get('image_data'):
                        try:
                            # Delete existing signature if present
                            Signature.objects.filter(instance=instance).delete()
                            # Create new signature
                            Signature.objects.create(
                                instance=instance,
                                image_data=signature_data['image_data'],
                                signed_by=signature_data.get('signed_by', instance.completed_by)
                            )
                            has_signature = True
                        except Exception as e:
                            logger.error(f"Error saving signature: {e}")

                    # Mark instance as completed/resubmitted if all items checked and signed off
                    if all_checked and items_data and has_signature:
                        if original_status == 'rejected':
                            instance.status = 'resubmitted'
                            # Clear supervisor review so supervisor gets a fresh slate
                            instance.items.all().update(supervisor_confirmed=None, supervisor_comment='')
                        else:
                            instance.status = 'completed'
                        instance.save()

                    processed_instances.append({'id': str(instance.id), 'action': action, 'status': instance.status})
                else:
                    logger.error(f"Instance {idx} validation errors: {serializer.errors}")
                    errors.append({'index': idx, 'errors': serializer.errors, 'data': instance_data})
            except Exception as e:
                logger.exception(f"Error processing instance {idx}: {e}")
                errors.append({'index': idx, 'error': str(e), 'data': instance_data})

        if errors:
            return Response({
                'error': 'Some instances failed to sync',
                'code': 'SYNC_PARTIAL_FAILURE',
                'processed': len(processed_instances),
                'failed': len(errors),
                'errors': errors
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'synced': len(processed_instances),
            'instances': processed_instances
        })


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def list_outlets(request):
    from .models import Outlet
    outlets = Outlet.objects.all().order_by('name')
    from .serializers import OutletSerializer
    return Response(OutletSerializer(outlets, many=True).data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def list_outlet_teams(request, outlet_id):
    teams = Team.objects.filter(outlet_id=outlet_id).order_by('name')
    data = [{'id': str(t.id), 'name': t.name} for t in teams]
    return Response(data)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def team_login(request):
    outlet_id = request.data.get('outlet_id')
    team_id = request.data.get('team_id')
    pin = request.data.get('pin')

    if not outlet_id or not team_id or not pin:
        return Response({
            'success': False,
            'error': 'Outlet, team, and PIN are required'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        team = Team.objects.select_related('outlet').get(id=team_id, outlet_id=outlet_id)
    except Team.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Team not found'
        }, status=status.HTTP_404_NOT_FOUND)

    # Determine role from PIN match
    if team.staff_pin and pin == team.staff_pin:
        role = 'staff'
    elif team.supervisor_pin and pin == team.supervisor_pin:
        role = 'supervisor'
    else:
        return Response({
            'success': False,
            'error': 'Invalid PIN'
        }, status=status.HTTP_401_UNAUTHORIZED)

    return Response({
        'success': True,
        'team': TeamSerializer(team).data,
        'role': role
    })


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def pending_checklists(request):
    team_id = request.query_params.get('team')
    if not team_id:
        return Response({'error': 'Team required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        team = Team.objects.get(id=team_id)
    except Team.DoesNotExist:
        return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

    instance_prefetch = Prefetch(
        'items',
        queryset=InstanceItem.objects.prefetch_related(
            Prefetch(
                'flags',
                queryset=FlaggedItem.objects.filter(resolved_at__isnull=True),
                to_attr='active_flags'
            )
        )
    )

    # Check role from query param (set by client based on login PIN)
    role = request.query_params.get('role', 'staff')

    # For supervisor role, return completed/resubmitted checklists awaiting verification
    # scoped to the same outlet as the team
    if role == 'supervisor':
        awaiting = ChecklistInstance.objects.filter(
            status__in=['completed', 'resubmitted'],
            supervisor_signed_off=False,
            team__outlet=team.outlet
        ).select_related(
            'template__schedule', 'team__outlet', 'supervisor_team'
        ).prefetch_related('signature', instance_prefetch)
        serializer = ChecklistInstanceSerializer(awaiting, many=True, context={'request': request})
        return Response(serializer.data)

    # For staff teams, return pending/rejected instances for this team
    pending = ChecklistInstance.objects.filter(
        team_id=team_id,
        status__in=['draft', 'pending', 'rejected']
    ).select_related(
        'template__schedule', 'team__outlet', 'supervisor_team'
    ).prefetch_related('signature', instance_prefetch)
    serializer = ChecklistInstanceSerializer(pending, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def upload_photo(request):
    """
    Upload a photo for a checklist item.
    Expected: multipart/form-data with 'photo' file and 'item_id'
    """
    item_id = request.data.get('item_id')
    photo = request.FILES.get('photo')

    if not item_id:
        return Response({'error': 'item_id required'}, status=status.HTTP_400_BAD_REQUEST)
    if not photo:
        return Response({'error': 'photo file required'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/webp']
    if photo.content_type not in allowed_types:
        return Response({
            'error': 'Invalid file type. Allowed: JPEG, PNG, WebP'
        }, status=status.HTTP_400_BAD_REQUEST)

    # Validate file size (max 10MB before compression)
    if photo.size > 10 * 1024 * 1024:
        return Response({
            'error': 'File too large. Max 10MB before compression.'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        item = InstanceItem.objects.get(id=item_id)
    except InstanceItem.DoesNotExist:
        return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)

    # Delete old photo if exists
    if item.photo:
        item.photo.delete(save=False)

    # Save new photo
    item.photo = photo
    item.photo_uploaded_at = timezone.now()
    item.is_checked = True
    item.checked_at = timezone.now()
    item.save()

    return Response({
        'success': True,
        'photo_url': request.build_absolute_uri(item.photo.url),
        'photo_uploaded_at': item.photo_uploaded_at
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def supervisor_verify(request):
    """
    Supervisor verification endpoint.
    Expected payload:
    {
        'instance_id': '<uuid>',
        'supervisor_team_id': '<uuid>',
        'supervisor_name': 'Supervisor Name',
        'supervisor_signature': '<base64_image>'
    }
    """
    instance_id = request.data.get('instance_id')
    supervisor_team_id = request.data.get('supervisor_team_id')
    supervisor_name = request.data.get('supervisor_name')
    supervisor_signature = request.data.get('supervisor_signature')

    if not all([instance_id, supervisor_team_id, supervisor_name, supervisor_signature]):
        return Response({
            'error': 'Missing required fields',
            'required': ['instance_id', 'supervisor_team_id', 'supervisor_name', 'supervisor_signature']
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        instance = ChecklistInstance.objects.get(id=instance_id)
    except ChecklistInstance.DoesNotExist:
        return Response({'error': 'Checklist instance not found'}, status=status.HTTP_404_NOT_FOUND)

    if instance.status != 'completed':
        return Response({
            'error': 'Checklist must be completed before supervisor verification',
            'current_status': instance.status
        }, status=status.HTTP_400_BAD_REQUEST)

    if instance.supervisor_signed_off:
        return Response({'error': 'Checklist already verified by supervisor'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        supervisor_team = Team.objects.get(id=supervisor_team_id)
    except Team.DoesNotExist:
        return Response({'error': 'Supervisor team not found'}, status=status.HTTP_404_NOT_FOUND)

    if not supervisor_team.supervisor_pin:
        return Response({'error': 'Team does not have supervisor privileges'}, status=status.HTTP_403_FORBIDDEN)

    # Update instance with supervisor verification
    instance.supervisor_team = supervisor_team
    instance.supervisor_name = supervisor_name
    instance.supervisor_signature = supervisor_signature
    instance.supervisor_signed_off = True
    instance.supervisor_signed_at = timezone.now()
    instance.status = 'verified'
    instance.save()

    return Response({
        'success': True,
        'message': 'Checklist verified successfully',
        'instance': ChecklistInstanceSerializer(instance).data
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def supervisor_review(request):
    """
    Supervisor item-by-item review endpoint.
    Expected payload:
    {
        'instance_id': '<uuid>',
        'supervisor_team_id': '<uuid>',
        'supervisor_name': 'Supervisor Name',
        'supervisor_signature': '<base64_image>',
        'items': [
            {'item_id': '<uuid>', 'supervisor_confirmed': true/false, 'supervisor_comment': '...'},
            ...
        ]
    }
    """
    instance_id = request.data.get('instance_id')
    supervisor_team_id = request.data.get('supervisor_team_id')
    supervisor_name = request.data.get('supervisor_name')
    supervisor_signature = request.data.get('supervisor_signature')
    items_data = request.data.get('items', [])

    if not all([instance_id, supervisor_team_id, supervisor_name, supervisor_signature]):
        return Response({
            'error': 'Missing required fields',
            'required': ['instance_id', 'supervisor_team_id', 'supervisor_name', 'supervisor_signature', 'items']
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        instance = ChecklistInstance.objects.get(id=instance_id)
    except (ChecklistInstance.DoesNotExist, Exception):
        return Response({'error': 'Checklist instance not found'}, status=status.HTTP_404_NOT_FOUND)

    if instance.status not in ('completed', 'resubmitted'):
        return Response({
            'error': 'Checklist must be completed or resubmitted before supervisor review',
            'current_status': instance.status
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        supervisor_team = Team.objects.get(id=supervisor_team_id)
    except (Team.DoesNotExist, Exception):
        return Response({'error': 'Supervisor team not found'}, status=status.HTTP_404_NOT_FOUND)

    if not supervisor_team.supervisor_pin:
        return Response({'error': 'Team does not have supervisor privileges'}, status=status.HTTP_403_FORBIDDEN)

    if not items_data:
        return Response({'error': 'No items provided'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate all items have been actioned
    for item_decision in items_data:
        if item_decision.get('supervisor_confirmed') is None:
            return Response(
                {'error': 'All items must be actioned (confirmed or rejected)'},
                status=status.HTTP_400_BAD_REQUEST
            )

    # Process item decisions in bulk
    item_ids = [d.get('item_id') for d in items_data]
    existing_items = {
        str(item.pk): item
        for item in InstanceItem.objects.filter(id__in=item_ids, instance=instance)
    }

    # Verify all items exist
    for item_id in item_ids:
        if str(item_id) not in existing_items:
            return Response({'error': f'Item {item_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    any_rejected = False
    items_to_update = []
    for item_decision in items_data:
        item = existing_items[str(item_decision.get('item_id'))]
        confirmed = item_decision.get('supervisor_confirmed')
        comment = item_decision.get('supervisor_comment', '')

        item.supervisor_confirmed = confirmed
        item.supervisor_comment = comment
        items_to_update.append(item)

        if not confirmed:
            any_rejected = True

    InstanceItem.objects.bulk_update(items_to_update, ['supervisor_confirmed', 'supervisor_comment'])

    # Update instance based on review outcome
    instance.supervisor_team = supervisor_team
    instance.supervisor_name = supervisor_name
    instance.supervisor_signature = supervisor_signature
    instance.supervisor_signed_at = timezone.now()

    if any_rejected:
        instance.status = 'rejected'
        instance.supervisor_signed_off = False
    else:
        instance.status = 'verified'
        instance.supervisor_signed_off = True

    instance.save()

    return Response({
        'success': True,
        'status': instance.status,
        'instance': ChecklistInstanceSerializer(instance).data
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def supervisor_rework(request):
    """
    Send a checklist back for rework (no signature required).
    Saves item decisions and sets instance status to rejected.
    Expected payload:
    {
        'instance_id': '<uuid>',
        'supervisor_team_id': '<uuid>',
        'supervisor_name': 'Supervisor Name',
        'items': [
            {'item_id': '<uuid>', 'supervisor_confirmed': true/false, 'supervisor_comment': '...'},
            ...
        ]
    }
    """
    instance_id = request.data.get('instance_id')
    supervisor_team_id = request.data.get('supervisor_team_id')
    supervisor_name = request.data.get('supervisor_name')
    items_data = request.data.get('items', [])

    if not all([instance_id, supervisor_team_id, supervisor_name]):
        return Response({
            'error': 'Missing required fields',
            'required': ['instance_id', 'supervisor_team_id', 'supervisor_name', 'items']
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        instance = ChecklistInstance.objects.get(id=instance_id)
    except (ChecklistInstance.DoesNotExist, Exception):
        return Response({'error': 'Checklist instance not found'}, status=status.HTTP_404_NOT_FOUND)

    if instance.status not in ('completed', 'resubmitted'):
        return Response({
            'error': 'Checklist must be completed or resubmitted before review',
            'current_status': instance.status
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        supervisor_team = Team.objects.get(id=supervisor_team_id)
    except (Team.DoesNotExist, Exception):
        return Response({'error': 'Supervisor team not found'}, status=status.HTTP_404_NOT_FOUND)

    if not supervisor_team.supervisor_pin:
        return Response({'error': 'Team does not have supervisor privileges'}, status=status.HTTP_403_FORBIDDEN)

    if not items_data:
        return Response({'error': 'No items provided'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate all items have been actioned
    for item_decision in items_data:
        if item_decision.get('supervisor_confirmed') is None:
            return Response(
                {'error': 'All items must be actioned before sending for rework'},
                status=status.HTTP_400_BAD_REQUEST
            )

    # Save item decisions in bulk
    item_ids = [d.get('item_id') for d in items_data]
    existing_items = {
        str(item.pk): item
        for item in InstanceItem.objects.filter(id__in=item_ids, instance=instance)
    }

    for item_id in item_ids:
        if str(item_id) not in existing_items:
            return Response({'error': f'Item {item_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    items_to_update = []
    for item_decision in items_data:
        item = existing_items[str(item_decision.get('item_id'))]
        item.supervisor_confirmed = item_decision.get('supervisor_confirmed')
        item.supervisor_comment = item_decision.get('supervisor_comment', '')
        items_to_update.append(item)

    InstanceItem.objects.bulk_update(items_to_update, ['supervisor_confirmed', 'supervisor_comment'])

    # Reject and return to staff queue
    instance.supervisor_team = supervisor_team
    instance.supervisor_name = supervisor_name
    instance.supervisor_signed_at = timezone.now()
    instance.status = 'rejected'
    instance.supervisor_signed_off = False
    instance.save()

    return Response({'success': True, 'status': 'rejected'})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def flags_view(request):
    """
    GET /api/flags/?team=<supervisor_team_id>
    Returns:
    - All active (unacknowledged) flags regardless of date
    - Acknowledged flags from today only
    """
    team_id = request.query_params.get('team')
    if not team_id:
        return Response({'error': 'team parameter required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        team = Team.objects.get(id=team_id)
    except (Team.DoesNotExist, Exception):
        return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

    today = timezone.now().date()

    from django.db.models import Q
    flags = FlaggedItem.objects.filter(
        resolved_at__isnull=True,
        instance_item__instance__team__outlet=team.outlet
    ).filter(
        Q(acknowledged_at__isnull=True) |
        Q(acknowledged_at__date=today)
    ).select_related(
        'instance_item__instance__team',
        'instance_item__instance__template'
    ).order_by('-flagged_at')

    result = []
    for flag in flags:
        item = flag.instance_item
        instance = item.instance
        photo_url = None
        if flag.photo:
            photo_url = request.build_absolute_uri(flag.photo.url)
        result.append({
            'flag_id': str(flag.id),
            'description': flag.description,
            'photo_url': photo_url,
            'photo_uploaded_at': flag.photo_uploaded_at,
            'flagged_at': flag.flagged_at,
            'acknowledged_at': flag.acknowledged_at,
            'acknowledged_by': flag.acknowledged_by,
            'status': flag.status,
            'item_text': item.item_text,
            'instance_id': str(instance.id),
            'checklist_title': instance.template.title if instance.template else '',
            'date_label': instance.date_label,
            'team_name': instance.team.name if instance.team else '',
        })

    return Response(result)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def flag_item(request):
    """
    POST /api/flag-item/
    Body: { item_id, description }
    Creates or updates the active FlaggedItem for an InstanceItem.
    """
    item_id = request.data.get('item_id')
    description = request.data.get('description', '')

    if not item_id:
        return Response({'error': 'item_id required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        item = InstanceItem.objects.get(id=item_id)
    except InstanceItem.DoesNotExist:
        return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)

    # Find or create active flag
    flag = item.flags.filter(resolved_at__isnull=True).first()
    if flag:
        flag.description = description
        flag.save(update_fields=['description'])
    else:
        flag = FlaggedItem.objects.create(
            instance_item=item,
            description=description,
        )

    photo_url = None
    if flag.photo:
        photo_url = request.build_absolute_uri(flag.photo.url)

    return Response({
        'flag_id': str(flag.id),
        'description': flag.description,
        'flagged_at': flag.flagged_at,
        'photo_url': photo_url,
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def upload_flag_photo(request):
    """
    POST /api/upload-flag-photo/
    Expected: multipart/form-data with 'photo' file and 'item_id'
    Attaches the photo to the active FlaggedItem for the given item.
    """
    item_id = request.data.get('item_id')
    photo = request.FILES.get('photo')

    if not item_id:
        return Response({'error': 'item_id required'}, status=status.HTTP_400_BAD_REQUEST)
    if not photo:
        return Response({'error': 'photo file required'}, status=status.HTTP_400_BAD_REQUEST)

    allowed_types = ['image/jpeg', 'image/png', 'image/webp']
    if photo.content_type not in allowed_types:
        return Response({'error': 'Invalid file type. Allowed: JPEG, PNG, WebP'}, status=status.HTTP_400_BAD_REQUEST)

    if photo.size > 10 * 1024 * 1024:
        return Response({'error': 'File too large. Max 10MB.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        item = InstanceItem.objects.get(id=item_id)
    except InstanceItem.DoesNotExist:
        return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)

    # Find or create active flag
    flag = item.flags.filter(resolved_at__isnull=True).first()
    if not flag:
        flag = FlaggedItem.objects.create(instance_item=item)

    # Delete old flag photo if exists
    if flag.photo:
        flag.photo.delete(save=False)

    flag.photo = photo
    flag.photo_uploaded_at = timezone.now()
    flag.save(update_fields=['photo', 'photo_uploaded_at'])

    return Response({
        'success': True,
        'flag_photo_url': request.build_absolute_uri(flag.photo.url),
        'flag_photo_uploaded_at': flag.photo_uploaded_at,
        'flag_id': str(flag.id),
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def acknowledge_flag(request):
    """
    POST /api/acknowledge-flag/
    Body: { flag_id, acknowledged_by, acknowledgement_signature }
    Marks a FlaggedItem as acknowledged by a supervisor.
    """
    flag_id = request.data.get('flag_id')
    acknowledged_by = request.data.get('acknowledged_by', '')
    acknowledgement_signature = request.data.get('acknowledgement_signature', '')

    if not flag_id:
        return Response({'error': 'flag_id required'}, status=status.HTTP_400_BAD_REQUEST)
    if not acknowledged_by:
        return Response({'error': 'acknowledged_by required'}, status=status.HTTP_400_BAD_REQUEST)
    if not acknowledgement_signature:
        return Response({'error': 'acknowledgement_signature required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        flag = FlaggedItem.objects.get(id=flag_id)
    except FlaggedItem.DoesNotExist:
        return Response({'error': 'Flag not found'}, status=status.HTTP_404_NOT_FOUND)

    if flag.acknowledged_at:
        return Response({'error': 'Flag already acknowledged'}, status=status.HTTP_400_BAD_REQUEST)

    flag.acknowledged_at = timezone.now()
    flag.acknowledged_by = acknowledged_by
    flag.acknowledgement_signature = acknowledgement_signature
    flag.save(update_fields=['acknowledged_at', 'acknowledged_by', 'acknowledgement_signature'])

    return Response({
        'success': True,
        'acknowledged_at': flag.acknowledged_at,
        'acknowledged_by': flag.acknowledged_by,
        'status': flag.status,
    })


class SignatureViewSet(viewsets.ModelViewSet):
    queryset = Signature.objects.all()
    serializer_class = SignatureSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        instance_id = self.request.query_params.get('instance')
        if instance_id:
            return Signature.objects.filter(instance_id=instance_id)
        return Signature.objects.all()

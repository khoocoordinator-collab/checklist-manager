from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
from django.db import transaction
from .models import Team, ChecklistTemplate, TemplateItem, Schedule, ChecklistInstance, InstanceItem, Signature
from .serializers import (
    TeamSerializer, ChecklistTemplateSerializer, ChecklistTemplateCreateSerializer,
    ScheduleSerializer, ChecklistInstanceSerializer, InstanceItemSerializer,
    SignatureSerializer
)


class ChecklistTemplateViewSet(viewsets.ModelViewSet):
    queryset = ChecklistTemplate.objects.filter(is_hidden=False)
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
        queryset = ChecklistInstance.objects.all()

        team_id = self.request.query_params.get('team')
        supervisor_team_id = self.request.query_params.get('supervisor_team')
        status = self.request.query_params.get('status')

        if team_id:
            queryset = queryset.filter(team_id=team_id)

        if supervisor_team_id:
            queryset = queryset.filter(supervisor_team_id=supervisor_team_id)

        if status:
            queryset = queryset.filter(status=status)

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
                try:
                    existing = ChecklistInstance.objects.get(id=instance_id)
                    serializer = self.get_serializer(existing, data=instance_data, partial=True)
                    action = 'updated'
                except ChecklistInstance.DoesNotExist:
                    serializer = self.get_serializer(data=instance_data)
                    action = 'created'

                if serializer.is_valid():
                    instance = serializer.save()
                    all_checked = True

                    # Update/create items
                    for item_data in items_data:
                        item_id = item_data.get('id')
                        item_data['instance'] = instance.id

                        # Set checked_at if checked but no timestamp
                        if item_data.get('is_checked') and not item_data.get('checked_at'):
                            item_data['checked_at'] = timezone.now()

                        if not item_data.get('is_checked'):
                            all_checked = False

                        try:
                            existing_item = InstanceItem.objects.get(id=item_id)
                            item_serializer = InstanceItemSerializer(existing_item, data=item_data, partial=True)
                        except InstanceItem.DoesNotExist:
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

                    # Mark instance as completed if all items checked and signed off
                    if all_checked and items_data and has_signature:
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


@api_view(['POST'])
@permission_classes([AllowAny])
def team_login(request):
    passcode = request.data.get('passcode')
    try:
        team = Team.objects.get(passcode=passcode)
        return Response({
            'success': True,
            'team': TeamSerializer(team).data
        })
    except Team.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Invalid passcode'
        }, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
@permission_classes([AllowAny])
def pending_checklists(request):
    team_id = request.query_params.get('team')
    if not team_id:
        return Response({'error': 'Team required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        team = Team.objects.get(id=team_id)
    except Team.DoesNotExist:
        return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

    # For supervisor teams, return completed checklists awaiting verification
    if team.team_type == 'supervisor':
        awaiting = ChecklistInstance.objects.filter(
            status='completed',
            supervisor_signed_off=False
        ).select_related('team', 'template')
        serializer = ChecklistInstanceSerializer(awaiting, many=True, context={'request': request})
        return Response(serializer.data)

    # For staff teams, return pending instances for this team
    pending = ChecklistInstance.objects.filter(
        team_id=team_id,
        status__in=['draft', 'pending']
    )
    serializer = ChecklistInstanceSerializer(pending, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
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
        supervisor_team = Team.objects.get(id=supervisor_team_id, team_type='supervisor')
    except Team.DoesNotExist:
        return Response({'error': 'Supervisor team not found'}, status=status.HTTP_404_NOT_FOUND)

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


class SignatureViewSet(viewsets.ModelViewSet):
    queryset = Signature.objects.all()
    serializer_class = SignatureSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        instance_id = self.request.query_params.get('instance')
        if instance_id:
            return Signature.objects.filter(instance_id=instance_id)
        return Signature.objects.all()

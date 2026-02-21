from rest_framework import serializers
from .models import Outlet, Team, ChecklistTemplate, TemplateItem, Schedule, ChecklistInstance, InstanceItem, Signature, FlaggedItem


class TemplateItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TemplateItem
        fields = ['id', 'text', 'order', 'is_required', 'response_type']


class ChecklistTemplateSerializer(serializers.ModelSerializer):
    items = TemplateItemSerializer(many=True, read_only=True)
    schedule_name = serializers.CharField(source='schedule.name', read_only=True)
    team_name = serializers.CharField(source='team.name', read_only=True)

    class Meta:
        model = ChecklistTemplate
        fields = ['id', 'title', 'description', 'team', 'team_name', 'schedule', 'schedule_name',
                  'items', 'created_at', 'updated_at', 'is_hidden', 'requires_supervisor',
                  'validity_window_hours', 'supervisor_validity_window_hours']


class ChecklistTemplateCreateSerializer(serializers.ModelSerializer):
    items = TemplateItemSerializer(many=True)

    class Meta:
        model = ChecklistTemplate
        fields = ['id', 'title', 'description', 'team', 'schedule', 'items']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        template = ChecklistTemplate.objects.create(**validated_data)
        for item_data in items_data:
            TemplateItem.objects.create(template=template, **item_data)
        return template


class ScheduleSerializer(serializers.ModelSerializer):
    day_of_week_display = serializers.CharField(source='get_day_of_week_display', read_only=True)
    frequency_display = serializers.CharField(source='get_frequency_display', read_only=True)

    class Meta:
        model = Schedule
        fields = [
            'id', 'name', 'frequency', 'frequency_display',
            'time_of_day', 'day_of_week', 'day_of_week_display',
            'day_of_month', 'is_active', 'created_at'
        ]


class FlaggedItemSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = FlaggedItem
        fields = ['id', 'description', 'photo_url', 'photo_uploaded_at', 'flagged_at', 'resolved_at',
                  'acknowledged_at', 'acknowledged_by', 'status']
        read_only_fields = ['photo']

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.photo.url) if request else obj.photo.url
        return None

    def get_status(self, obj):
        return obj.status


class InstanceItemSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    current_flag = serializers.SerializerMethodField()

    class Meta:
        model = InstanceItem
        fields = ['id', 'template_item_id', 'item_text', 'response_type', 'response_value', 'is_checked', 'checked_at', 'photo', 'photo_url', 'photo_uploaded_at', 'current_flag', 'supervisor_confirmed', 'supervisor_comment']
        read_only_fields = ['photo', 'supervisor_confirmed', 'supervisor_comment']  # These can only be set via dedicated endpoints

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def get_current_flag(self, obj):
        flag = obj.flags.filter(resolved_at__isnull=True).first()
        if flag:
            return FlaggedItemSerializer(flag, context=self.context).data
        return None


class ChecklistInstanceSerializer(serializers.ModelSerializer):
    items = InstanceItemSerializer(many=True)
    template_title = serializers.CharField(source='template.title', read_only=True)
    template_validity_hours = serializers.SerializerMethodField()
    template_supervisor_validity_hours = serializers.SerializerMethodField()
    signature_data = serializers.SerializerMethodField()
    supervisor_signature_data = serializers.SerializerMethodField()
    team_name = serializers.CharField(source='team.name', read_only=True)
    supervisor_team_name = serializers.CharField(source='supervisor_team.name', read_only=True)
    deadline = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    supervisor_deadline = serializers.SerializerMethodField()
    is_supervisor_expired = serializers.SerializerMethodField()

    class Meta:
        model = ChecklistInstance
        fields = [
            'id', 'template', 'template_title', 'team', 'team_name', 'date_label', 'status',
            'created_at', 'synced_at', 'items', 'created_by', 'completed_by',
            'signature_data', 'supervisor_team', 'supervisor_team_name',
            'supervisor_signed_off', 'supervisor_signature', 'supervisor_name',
            'supervisor_signed_at', 'supervisor_signature_data',
            'deadline', 'is_expired', 'template_validity_hours',
            'supervisor_deadline', 'is_supervisor_expired', 'template_supervisor_validity_hours'
        ]

    def get_signature_data(self, obj):
        try:
            sig = obj.signature
            return {
                'id': str(sig.id),
                'image_data': sig.image_data,
                'signed_by': sig.signed_by,
                'signed_at': sig.signed_at.isoformat() if sig.signed_at else None
            }
        except Signature.DoesNotExist:
            return None

    def get_supervisor_signature_data(self, obj):
        if obj.supervisor_signed_off and obj.supervisor_signature:
            return {
                'image_data': obj.supervisor_signature,
                'signed_by': obj.supervisor_name,
                'signed_at': obj.supervisor_signed_at.isoformat() if obj.supervisor_signed_at else None
            }
        return None

    def get_deadline(self, obj):
        deadline = obj.get_deadline()
        return deadline.isoformat() if deadline else None

    def get_is_expired(self, obj):
        return obj.is_expired()

    def get_supervisor_deadline(self, obj):
        deadline = obj.get_supervisor_deadline()
        return deadline.isoformat() if deadline else None

    def get_is_supervisor_expired(self, obj):
        return obj.is_supervisor_expired()

    def get_template_validity_hours(self, obj):
        # Prefer snapshotted value; fall back to live template for legacy instances
        if obj.validity_window_hours is not None:
            return obj.validity_window_hours
        return obj.template.validity_window_hours if obj.template else 3

    def get_template_supervisor_validity_hours(self, obj):
        # Prefer snapshotted value; fall back to live template for legacy instances
        if obj.supervisor_validity_window_hours is not None:
            return obj.supervisor_validity_window_hours
        return obj.template.supervisor_validity_window_hours if obj.template else 2

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        # Snapshot validity windows from template so later template edits
        # don't retroactively change deadlines on existing instances.
        template = validated_data.get('template')
        if template and validated_data.get('validity_window_hours') is None:
            validated_data['validity_window_hours'] = template.validity_window_hours
        if template and validated_data.get('supervisor_validity_window_hours') is None:
            validated_data['supervisor_validity_window_hours'] = template.supervisor_validity_window_hours
        if template and validated_data.get('scheduled_time') is None and template.schedule:
            validated_data['scheduled_time'] = template.schedule.time_of_day
        instance = ChecklistInstance.objects.create(**validated_data)
        for item_data in items_data:
            InstanceItem.objects.create(instance=instance, **item_data)
        return instance


class OutletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Outlet
        fields = ['id', 'name', 'location', 'created_at']


class TeamSerializer(serializers.ModelSerializer):
    outlet = OutletSerializer(read_only=True)
    outlet_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = Team
        fields = ['id', 'name', 'passcode', 'team_type', 'outlet', 'outlet_id', 'created_at']


class SignatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Signature
        fields = ['id', 'instance', 'image_data', 'signed_by', 'signed_at']

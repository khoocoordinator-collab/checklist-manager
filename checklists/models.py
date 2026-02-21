import uuid
from datetime import datetime, time, timedelta
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User, Group


class Outlet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Team(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='teams', null=True)
    name = models.CharField(max_length=100)
    staff_pin = models.CharField(max_length=4, blank=True, default='')
    supervisor_pin = models.CharField(max_length=4, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.outlet.name} - {self.name}"


class Schedule(models.Model):
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('bi_weekly', 'Bi-Weekly'),
    ]

    DAY_OF_WEEK_CHOICES = [
        (0, 'Monday'),
        (1, 'Tuesday'),
        (2, 'Wednesday'),
        (3, 'Thursday'),
        (4, 'Friday'),
        (5, 'Saturday'),
        (6, 'Sunday'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, editable=False, help_text="Auto-generated from frequency and time settings")
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES)
    time_of_day = models.TimeField(default='08:00', help_text="Default is 8:00 AM if not specified")
    day_of_week = models.IntegerField(choices=DAY_OF_WEEK_CHOICES, null=True, blank=True,
                                      help_text="Required for Weekly and Bi-Weekly schedules")
    day_of_month = models.IntegerField(null=True, blank=True,
                                       help_text="Required for Monthly schedules (1-28)")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'schedules'

    def save(self, *args, **kwargs):
        self.name = self.generate_name()
        super().save(*args, **kwargs)

    def generate_name(self):
        time_str = self.time_of_day.strftime("%H:%M") if self.time_of_day else "08:00"
        if self.frequency == "daily":
            return f"Daily at {time_str}"
        elif self.frequency == "weekly":
            day_name = self.get_day_of_week_display() or "Unknown"
            return f"Weekly on {day_name} at {time_str}"
        elif self.frequency == "bi_weekly":
            day_name = self.get_day_of_week_display() or "Unknown"
            return f"Bi-Weekly on {day_name} at {time_str}"
        elif self.frequency == "monthly":
            day = self.day_of_month or 1
            return f"Monthly on {day}{self._get_ordinal(day)} at {time_str}"
        return "Unknown Schedule"

    def _get_ordinal(self, n):
        if 11 <= n <= 13:
            return "th"
        last = n % 10
        if last == 1:
            return "st"
        elif last == 2:
            return "nd"
        elif last == 3:
            return "rd"
        return "th"

    def clean(self):
        if self.frequency in ('weekly', 'bi_weekly') and self.day_of_week is None:
            raise ValidationError('Day of week is required for Weekly and Bi-Weekly schedules')

        if self.frequency == 'monthly':
            if self.day_of_month is None:
                raise ValidationError('Day of month is required for Monthly schedules')
            if self.day_of_month < 1 or self.day_of_month > 28:
                raise ValidationError('Day of month must be between 1 and 28')

    def __str__(self):
        parts = [self.name, '(']

        if self.frequency == 'daily':
            parts.append(f"Daily at {self.time_of_day.strftime('%H:%M')}")
        elif self.frequency == 'weekly':
            day_name = dict(self.DAY_OF_WEEK_CHOICES).get(self.day_of_week, 'Unknown')
            parts.append(f"Weekly on {day_name} at {self.time_of_day.strftime('%H:%M')}")
        elif self.frequency == 'bi_weekly':
            day_name = dict(self.DAY_OF_WEEK_CHOICES).get(self.day_of_week, 'Unknown')
            parts.append(f"Bi-Weekly on {day_name} at {self.time_of_day.strftime('%H:%M')}")
        elif self.frequency == 'monthly':
            parts.append(f"Monthly on {self.day_of_month}{self._get_ordinal(self.day_of_month)} at {self.time_of_day.strftime('%H:%M')}")

        parts.append(')')
        return ''.join(parts)


class LibraryTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    suggested_for = models.CharField(
        max_length=100, blank=True,
        help_text="Advisory tag, e.g. 'Kitchen', 'Bar', 'Floor'"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        suffix = f" [{self.suggested_for}]" if self.suggested_for else ""
        return f"{self.name}{suffix}"


class LibraryTask(models.Model):
    TASK_TYPE_CHOICES = [
        ('yes_no', 'Yes / No'),
        ('number', 'Number'),
        ('text', 'Text'),
        ('photo', 'Photo'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library_template = models.ForeignKey(LibraryTemplate, on_delete=models.CASCADE, related_name='tasks')
    task_name = models.CharField(max_length=48)
    task_type = models.CharField(max_length=10, choices=TASK_TYPE_CHOICES, default='yes_no')
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.task_name


class ChecklistTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    team = models.ForeignKey(Team, on_delete=models.CASCADE)
    schedule = models.ForeignKey(Schedule, on_delete=models.SET_NULL, null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_hidden = models.BooleanField(default=False)
    requires_supervisor = models.BooleanField(
        default=False,
        help_text="If checked, this checklist requires supervisor validation before being marked complete."
    )
    validity_window_hours = models.IntegerField(
        default=3,
        help_text="Hours after scheduled time that checklist can be completed (default 3). After this window, checklist expires."
    )
    supervisor_validity_window_hours = models.IntegerField(
        default=2,
        help_text="Hours after staff completion that supervisor has to verify & sign off (default 2). After this window, verification expires."
    )

    def __str__(self):
        return self.title


class TemplateItem(models.Model):
    RESPONSE_TYPE_CHOICES = [
        ('yes_no', 'Yes / No'),
        ('number', 'Number'),
        ('text', 'Text'),
        ('photo', 'Photo'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(ChecklistTemplate, related_name='items', on_delete=models.CASCADE)
    text = models.CharField(max_length=48)
    order = models.IntegerField(default=0)
    is_required = models.BooleanField(default=True)
    response_type = models.CharField(max_length=10, choices=RESPONSE_TYPE_CHOICES, default='yes_no')

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.order}. {self.text[:50]}"


class ChecklistInstance(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('verified', 'Double-Verified'),
        ('expired', 'Expired'),
        ('rejected', 'Rejected'),
        ('resubmitted', 'Resubmitted'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(ChecklistTemplate, null=True, blank=True, on_delete=models.SET_NULL)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='checklist_instances')
    date_label = models.CharField(max_length=50, db_index=True)
    created_by = models.CharField(max_length=6)
    completed_by = models.CharField(max_length=100, blank=True, help_text="Name of person who completed this checklist")
    created_at = models.DateTimeField(auto_now_add=True)
    synced_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending', db_index=True)

    # Snapshotted at instance creation so template changes don't retroactively affect deadlines
    validity_window_hours = models.IntegerField(
        null=True, blank=True,
        help_text="Snapshotted from template at creation time."
    )
    supervisor_validity_window_hours = models.IntegerField(
        null=True, blank=True,
        help_text="Snapshotted from template at creation time."
    )
    scheduled_time = models.TimeField(
        null=True, blank=True,
        help_text="Snapshotted from template schedule at creation time. Null for manually-created instances."
    )

    # Supervisor verification fields
    supervisor_team = models.ForeignKey(Team, on_delete=models.SET_NULL, null=True, blank=True,
                                       related_name='verified_checklists')
    supervisor_signed_off = models.BooleanField(default=False)
    supervisor_signature = models.TextField(blank=True, help_text="Base64 encoded PNG supervisor signature")
    supervisor_name = models.CharField(max_length=100, blank=True)
    supervisor_signed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def get_deadline(self):
        """Calculate the deadline based on schedule time + validity window.
        Falls back to created_at when no schedule is set.
        Returns None if validity_window_hours is 0 (unlimited)."""
        if not self.template:
            return None

        # Prefer snapshotted value; fall back to live template for legacy instances
        validity_hours = self.validity_window_hours
        if validity_hours is None:
            validity_hours = self.template.validity_window_hours

        # 0 means unlimited - no deadline
        if validity_hours == 0:
            return None

        # Default to 3 if not set
        if validity_hours is None:
            validity_hours = 3

        if self.scheduled_time is not None:
            # Snapshotted scheduled time — not affected by template/schedule edits
            try:
                base_date = datetime.strptime(self.date_label, '%Y-%m-%d').date()
            except ValueError:
                return None
            scheduled_datetime = datetime.combine(base_date, self.scheduled_time)
            scheduled_datetime = timezone.make_aware(scheduled_datetime, timezone.get_current_timezone())
        elif self.template and self.template.schedule:
            # Legacy fallback for instances created before snapshotting
            schedule = self.template.schedule
            try:
                base_date = datetime.strptime(self.date_label, '%Y-%m-%d').date()
            except ValueError:
                return None
            scheduled_datetime = datetime.combine(base_date, schedule.time_of_day or time(8, 0))
            scheduled_datetime = timezone.make_aware(scheduled_datetime, timezone.get_current_timezone())
        else:
            # Manually created — deadline = created_at + validity window
            if not self.created_at:
                return None
            scheduled_datetime = self.created_at

        return scheduled_datetime + timedelta(hours=validity_hours)

    def is_expired(self):
        """Check if checklist has passed its deadline."""
        if self.status in ('completed', 'verified', 'rejected', 'resubmitted'):
            return False

        deadline = self.get_deadline()
        if not deadline:
            return False

        return timezone.now() > deadline

    def check_and_update_expired(self):
        """Update status to expired if past deadline."""
        if self.is_expired() and self.status not in ('completed', 'verified', 'expired', 'rejected', 'resubmitted'):
            self.status = 'expired'
            self.save(update_fields=['status'])
            return True
        return False

    def get_supervisor_deadline(self):
        """Calculate the deadline for supervisor verification based on completion time.
        Returns None if supervisor_validity_window_hours is 0 (unlimited)."""
        if self.status not in ('completed', 'resubmitted') or not self.template:
            return None

        # Prefer snapshotted value; fall back to live template for legacy instances
        supervisor_hours = self.supervisor_validity_window_hours
        if supervisor_hours is None:
            supervisor_hours = self.template.supervisor_validity_window_hours

        # 0 means unlimited - no deadline
        if supervisor_hours == 0:
            return None

        # Default to 2 if not set
        if supervisor_hours is None:
            supervisor_hours = 2

        # Use synced_at as completion time (when staff synced), or fall back to created_at
        completion_time = self.synced_at or self.created_at

        if not completion_time:
            return None

        # Ensure completion_time is timezone-aware
        if timezone.is_naive(completion_time):
            completion_time = timezone.make_aware(completion_time, timezone.get_current_timezone())

        deadline = completion_time + timedelta(hours=supervisor_hours)
        return deadline

    def is_supervisor_expired(self):
        """Check if supervisor verification window has passed."""
        if self.status not in ('completed', 'resubmitted') or self.supervisor_signed_off:
            return False

        deadline = self.get_supervisor_deadline()
        if not deadline:
            return False

        return timezone.now() > deadline

    def __str__(self):
        status_icon = '🔒' if self.status == 'verified' else '✓' if self.status == 'completed' else '⚠' if self.status == 'expired' else '○'
        return f"{status_icon} {self.date_label} - {self.template.title if self.template else 'Deleted'}"


def photo_upload_path(instance, filename):
    """Generate unique path for photo uploads: photos/YYYY/MM/DD/uuid.jpg"""
    ext = filename.split('.')[-1].lower()
    new_filename = f"{uuid.uuid4()}.{ext}"
    now = datetime.now()
    return f"photos/{now.year}/{now.month:02d}/{now.day:02d}/{new_filename}"


def flag_photo_upload_path(instance, filename):
    """Generate unique path for flag photo uploads: flag_photos/YYYY/MM/DD/uuid.jpg"""
    ext = filename.split('.')[-1].lower()
    new_filename = f"{uuid.uuid4()}.{ext}"
    now = datetime.now()
    return f"flag_photos/{now.year}/{now.month:02d}/{now.day:02d}/{new_filename}"


class InstanceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instance = models.ForeignKey(ChecklistInstance, related_name='items', on_delete=models.CASCADE)
    template_item_id = models.UUIDField()
    item_text = models.CharField(max_length=500)
    response_type = models.CharField(max_length=10, default='yes_no')
    response_value = models.CharField(max_length=500, blank=True)
    is_checked = models.BooleanField(default=False)
    checked_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    photo = models.ImageField(upload_to=photo_upload_path, null=True, blank=True)
    photo_uploaded_at = models.DateTimeField(null=True, blank=True)
    supervisor_confirmed = models.BooleanField(null=True, blank=True)
    supervisor_comment = models.TextField(blank=True)

    def __str__(self):
        return f"{self.item_text[:50]} - {'✓' if self.is_checked else '○'}"


class FlaggedItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instance_item = models.ForeignKey(
        InstanceItem, on_delete=models.CASCADE, related_name='flags'
    )
    description = models.TextField(blank=True)
    photo = models.ImageField(upload_to=flag_photo_upload_path, null=True, blank=True)
    photo_uploaded_at = models.DateTimeField(null=True, blank=True)
    flagged_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True, db_index=True)
    acknowledged_by = models.CharField(max_length=100, blank=True)
    acknowledgement_signature = models.TextField(blank=True)

    class Meta:
        ordering = ['-flagged_at']

    @property
    def status(self):
        if self.acknowledged_at:
            return 'acknowledged'
        return 'active'

    def __str__(self):
        return f"Flag on {self.instance_item.item_text[:30]}"


class Signature(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instance = models.OneToOneField(ChecklistInstance, related_name='signature', on_delete=models.CASCADE)
    image_data = models.TextField(help_text="Base64 encoded PNG signature image")
    signed_by = models.CharField(max_length=100, blank=True)
    signed_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Signature by {self.signed_by} on {self.instance.date_label}"


class GroupOutletScope(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='outlet_scopes')
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='group_scopes')

    class Meta:
        unique_together = ('group', 'outlet')

    def __str__(self):
        return f"{self.group.name} → {self.outlet.name}"

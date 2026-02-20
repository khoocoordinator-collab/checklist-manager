from django.contrib import admin
from django.db import models
from django.utils import timezone
from django.utils.html import format_html
from django.urls import path
from django.shortcuts import get_object_or_404, redirect, render
from django.contrib import messages
from django.forms import Textarea, ModelForm, ValidationError, ChoiceField
from .models import Outlet, Team, ChecklistTemplate, TemplateItem, Schedule, ChecklistInstance, InstanceItem, Signature


class ScheduleForm(ModelForm):
    """Custom form - name is auto-generated, so exclude it from the form."""
    
    class Meta:
        model = Schedule
        fields = ['frequency', 'time_of_day', 'day_of_week', 'day_of_month', 'is_active']
        # Note: 'name' is excluded - it gets auto-generated in model.save()


class ChecklistTemplateForm(ModelForm):
    """Custom form with dropdown for validity window hours."""

    # Create choices: 0 = unlimited, then 1-24 hours
    HOURS_CHOICES = [(0, '0 (Unlimited - no deadline)')] + [(i, f'{i} hour{"s" if i > 1 else ""}') for i in range(1, 25)]

    validity_window_hours = ChoiceField(
        choices=HOURS_CHOICES,
        initial=3,
        help_text="Hours after scheduled time for staff to complete checklist. '0' means unlimited time.",
        label='Staff Validity Window'
    )

    supervisor_validity_window_hours = ChoiceField(
        choices=HOURS_CHOICES,
        initial=2,
        help_text="Hours after staff completion for supervisor to verify. '0' means unlimited time.",
        label='Supervisor Validity Window'
    )

    class Meta:
        model = ChecklistTemplate
        fields = '__all__'


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'created_at']
    search_fields = ['name']


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['name', 'outlet', 'team_type', 'passcode', 'created_at']
    list_filter = ['outlet', 'team_type']
    search_fields = ['name', 'outlet__name']


class TemplateItemInline(admin.TabularInline):
    model = TemplateItem
    extra = 1
    fields = ['text', 'order', 'is_required', 'response_type']


@admin.register(ChecklistTemplate)
class ChecklistTemplateAdmin(admin.ModelAdmin):
    form = ChecklistTemplateForm
    list_display = ['title', 'team', 'schedule', 'requires_supervisor', 'created_by', 'created_at', 'is_hidden', 'generate_button']
    list_filter = ['is_hidden', 'requires_supervisor', 'team', 'schedule', 'created_at']
    search_fields = ['title', 'description']
    inlines = [TemplateItemInline]
    actions = ['duplicate_selected_templates', 'generate_instances_for_selected']
    fieldsets = (
        (None, {
            'fields': ('title', 'description', 'team', 'schedule')
        }),
        ('Settings', {
            'fields': ('requires_supervisor', 'validity_window_hours', 'supervisor_validity_window_hours', 'is_hidden'),
            'description': 'Configure validation, staff/supervisor windows, and visibility settings'
        }),
    )

    class Media:
        js = ('admin/checklists/js/toggle_supervisor_window.js',)

    def generate_button(self, obj):
        from django.urls import reverse
        url = reverse('admin:checklisttemplate-generate-instance', args=[obj.id])
        item_count = obj.items.count()
        if item_count == 0:
            return format_html(
                '<span style="color: #dc3545;" title="Add items first">\u26a0\ufe0f No items</span>'
            )
        return format_html(
            '<a class="button" href="{}" style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none;">\ud83d\udccb Generate Instance</a>',
            url
        )
    generate_button.short_description = 'Action'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<uuid:template_id>/generate/',
                self.admin_site.admin_view(self.generate_instance),
                name='checklisttemplate-generate-instance',
            ),
        ]
        return custom_urls + urls

    @admin.action(description='Duplicate selected templates')
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def duplicate_selected_templates(self, request, queryset):
        duplicated = []
        for original in queryset:
            new_template = ChecklistTemplate.objects.create(
                title=f"{original.title} (Copy)",
                description=original.description,
                team=original.team,
                schedule=original.schedule,
                created_by=request.user,
                is_hidden=original.is_hidden,
                requires_supervisor=original.requires_supervisor,
                validity_window_hours=original.validity_window_hours,
                supervisor_validity_window_hours=original.supervisor_validity_window_hours
            )
            
            for item in original.items.all():
                TemplateItem.objects.create(
                    template=new_template,
                    text=item.text,
                    order=item.order,
                    is_required=item.is_required,
                    response_type=item.response_type
                )
            duplicated.append(new_template.title)
        
        messages.success(request, f'Duplicated {len(duplicated)} template(s): {", ".join(duplicated)}')

    @admin.action(description='Generate instances for selected templates')
    def generate_instances_for_selected(self, request, queryset):
        if queryset.count() > 1:
            messages.error(request, 'Please select only one template to generate an instance.')
            return

        template = queryset.first()
        if not template:
            messages.error(request, 'No template selected.')
            return

        # Check if template has items - required for instance generation
        if not template.items.exists():
            messages.error(request, f'Template "{template.title}" has no items. Please add items first.')
            return

        # If supervisor is required, redirect to the custom form URL
        # Admin actions can't handle multi-step form rendering
        if template.requires_supervisor:
            from django.urls import reverse
            return redirect(reverse('admin:checklisttemplate-generate-instance', args=[template.id]))

        # No supervisor required - create instance directly
        try:
            return self.generate_instance(request, template.id)
        except Exception as e:
            messages.error(request, f'Error generating instance: {str(e)}')
            return

    def generate_instance(self, request, template_id):
        template = get_object_or_404(ChecklistTemplate, id=template_id)

        # If supervisor is required, show form to select supervisor team
        if template.requires_supervisor:
            supervisor_teams = Team.objects.filter(team_type='supervisor', outlet=template.team.outlet)
            if not supervisor_teams.exists():
                messages.error(request, 'No supervisor teams available for this outlet. Please create a supervisor team first.')
                return redirect('admin:checklists_checklisttemplate_change', template.id)

            if request.method == 'POST':
                supervisor_team_id = request.POST.get('supervisor_team')
                if not supervisor_team_id:
                    messages.error(request, 'Supervisor team is required for this checklist.')
                    return render(request, 'admin/checklists/select_supervisor.html', {
                        'template': template,
                        'supervisor_teams': supervisor_teams,
                        'opts': self.model._meta,
                    })
                try:
                    supervisor_team = Team.objects.get(id=supervisor_team_id, team_type='supervisor')
                except Team.DoesNotExist:
                    messages.error(request, 'Invalid supervisor team selected.')
                    return render(request, 'admin/checklists/select_supervisor.html', {
                        'template': template,
                        'supervisor_teams': supervisor_teams,
                        'opts': self.model._meta,
                    })

                date_label = timezone.now().strftime('%Y-%m-%d')
                created_by = 'ADMIN'

                instance = ChecklistInstance.objects.create(
                    template=template,
                    team=template.team,
                    date_label=date_label,
                    created_by=created_by,
                    status='pending',
                    supervisor_team=supervisor_team
                )

                for item in template.items.all():
                    InstanceItem.objects.create(
                        instance=instance,
                        template_item_id=item.id,
                        item_text=item.text,
                        response_type=item.response_type,
                        is_checked=False
                    )

                messages.success(request, f'Checklist instance created with supervisor team: {instance.date_label} - {instance.template.title}')
                return redirect('admin:checklists_checklistinstance_change', instance.id)

            return render(request, 'admin/checklists/select_supervisor.html', {
                'template': template,
                'supervisor_teams': supervisor_teams,
                'opts': self.model._meta,
            })

        # No supervisor required - create instance directly
        date_label = timezone.now().strftime('%Y-%m-%d')
        created_by = 'ADMIN'

        instance = ChecklistInstance.objects.create(
            template=template,
            team=template.team,
            date_label=date_label,
            created_by=created_by,
            status='pending'
        )

        for item in template.items.all():
            InstanceItem.objects.create(
                instance=instance,
                template_item_id=item.id,
                item_text=item.text,
                response_type=item.response_type,
                is_checked=False
            )

        messages.success(request, f'Checklist instance created: {instance.date_label} - {instance.template.title}')
        return redirect('admin:checklists_checklistinstance_change', instance.id)


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    form = ScheduleForm
    list_display = ['name', 'frequency_display', 'schedule_details', 'time_of_day', 'is_active']
    list_filter = ['frequency', 'is_active']
    fieldsets = (
        (None, {
            'fields': ('name', 'frequency', 'is_active')
        }),
        ('Schedule Details', {
            'fields': ('time_of_day', 'day_of_week', 'day_of_month'),
            'description': 'Configure based on frequency: Daily needs only time, Weekly/Bi-Weekly needs day of week, Monthly needs date (1-28)'
        }),
    )

    def frequency_display(self, obj):
        return obj.get_frequency_display()
    frequency_display.short_description = 'Frequency'

    def schedule_details(self, obj):
        if obj.frequency == 'daily':
            return '\u2014'
        elif obj.frequency in ('weekly', 'bi_weekly'):
            return obj.get_day_of_week_display() or 'Not set'
        elif obj.frequency == 'monthly':
            if obj.day_of_month:
                suffix = obj._get_ordinal_suffix(obj.day_of_month)
                return f"{obj.day_of_month}{suffix} of month"
            return 'Not set'
        return '\u2014'
    schedule_details.short_description = 'Details'


class InstanceItemInline(admin.TabularInline):
    model = InstanceItem
    extra = 0
    readonly_fields = ['template_item_id', 'item_text', 'is_checked', 'checked_at']
    fields = ['template_item_id', 'item_text', 'is_checked', 'checked_at', 'notes']
    formfield_overrides = {
        models.TextField: {'widget': Textarea(attrs={'rows': 2, 'cols': 40})},
    }


class SignatureInline(admin.StackedInline):
    model = Signature
    extra = 0
    readonly_fields = ['image_preview', 'signed_by', 'signed_at', 'created_at']
    fields = ['image_preview', 'signed_by', 'signed_at', 'created_at']

    def image_preview(self, obj):
        if obj.image_data:
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 200px; border: 1px solid #ccc;" />',
                obj.image_data
            )
        return "No signature"
    image_preview.short_description = 'Staff Signature'


class ChecklistInstanceForm(ModelForm):
    class Meta:
        model = ChecklistInstance
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        template = cleaned_data.get('template')
        supervisor_team = cleaned_data.get('supervisor_team')
        status = cleaned_data.get('status')

        # Validate supervisor team is set when template requires it
        if template and template.requires_supervisor and not supervisor_team:
            raise ValidationError(
                'This checklist requires supervisor validation. Please select a supervisor team.'
            )

        # Validate that completed checklists with supervisor requirement have supervisor sign-off
        if template and template.requires_supervisor and status in ('completed', 'verified'):
            if not cleaned_data.get('supervisor_signed_off'):
                raise ValidationError(
                    'This checklist requires supervisor validation. It cannot be marked as completed without supervisor sign-off.'
                )

        return cleaned_data


@admin.register(ChecklistInstance)
class ChecklistInstanceAdmin(admin.ModelAdmin):
    form = ChecklistInstanceForm
    list_display = ['date_label', 'template', 'team', 'status', 'completed_by', 'supervisor_team', 'supervisor_signed_off', 'deadline_display', 'created_at', 'synced_at']
    list_filter = ['status', 'team', 'supervisor_signed_off', 'created_at']
    search_fields = ['date_label', 'completed_by', 'supervisor_name']
    inlines = [InstanceItemInline, SignatureInline]
    fieldsets = (
        ('Checklist Info', {
            'fields': ('template', 'team', 'date_label', 'status', 'created_by', 'completed_by')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'synced_at'),
            'classes': ('collapse',)
        }),
        ('Supervisor Verification', {
            'fields': ('supervisor_team', 'supervisor_signed_off', 'supervisor_name', 'supervisor_signature_preview', 'supervisor_signed_at'),
            'description': 'Supervisor cross-check verification (required if template specifies)'
        }),
    )
    readonly_fields = ['created_at', 'synced_at', 'supervisor_signed_at', 'supervisor_signature_preview']

    def supervisor_signature_preview(self, obj):
        if obj.supervisor_signature:
            return format_html(
                '<img src="{}" style="max-width: 400px; max-height: 200px; border: 1px solid #ccc; background: white; padding: 8px;" />',
                obj.supervisor_signature
            )
        return "No supervisor signature"
    supervisor_signature_preview.short_description = 'Supervisor Signature'

    def deadline_display(self, obj):
        deadline = obj.get_deadline()
        if not deadline:
            return '\u2014'
        from django.utils import timezone
        if obj.status in ('completed', 'verified'):
            return f"\u2713 {deadline.strftime('%Y-%m-%d %H:%M')}"
        elif obj.is_expired():
            return format_html(
                '<span style="color: #dc3545; font-weight: bold;">\u26a0 Expired (deadline: {})</span>',
                deadline.strftime('%Y-%m-%d %H:%M')
            )
        else:
            time_left = deadline - timezone.now()
            hours_left = int(time_left.total_seconds() / 3600)
            if hours_left < 1:
                minutes_left = int(time_left.total_seconds() / 60)
                return format_html(
                    '<span style="color: #ffc107;">\u23f0 {}m left</span>',
                    minutes_left
                )
            return format_html(
                '<span style="color: #28a745;">\u23f0 {}h left</span>',
                hours_left
            )
    deadline_display.short_description = 'Deadline'

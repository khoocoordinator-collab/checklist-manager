from decimal import Decimal
from django.db import migrations, models


def migrate_auto_flag_to_rules(apps, schema_editor):
    """Convert auto_flag + threshold fields to auto_flag_rules JSON."""
    TemplateItem = apps.get_model('checklists', 'TemplateItem')
    InstanceItem = apps.get_model('checklists', 'InstanceItem')

    for Model in (TemplateItem, InstanceItem):
        for item in Model.objects.filter(auto_flag=True):
            rules = {}
            if item.temp_threshold_upper is not None:
                rules['upper'] = float(item.temp_threshold_upper)
            if item.temp_threshold_lower is not None:
                rules['lower'] = float(item.temp_threshold_lower)
            item.auto_flag_rules = rules
            item.save(update_fields=['auto_flag_rules'])


def migrate_rules_back(apps, schema_editor):
    """Reverse: convert auto_flag_rules JSON back to separate fields."""
    TemplateItem = apps.get_model('checklists', 'TemplateItem')
    InstanceItem = apps.get_model('checklists', 'InstanceItem')

    for Model in (TemplateItem, InstanceItem):
        for item in Model.objects.all():
            rules = item.auto_flag_rules or {}
            if rules:
                item.auto_flag = True
                if 'upper' in rules:
                    item.temp_threshold_upper = Decimal(str(rules['upper']))
                if 'lower' in rules:
                    item.temp_threshold_lower = Decimal(str(rules['lower']))
                item.save(update_fields=['auto_flag', 'temp_threshold_upper', 'temp_threshold_lower'])


class Migration(migrations.Migration):

    dependencies = [
        ('checklists', '0003_instanceitem_auto_flag_and_more'),
    ]

    operations = [
        # Step 1: Add auto_flag_rules JSONField to both models
        migrations.AddField(
            model_name='templateitem',
            name='auto_flag_rules',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='instanceitem',
            name='auto_flag_rules',
            field=models.JSONField(blank=True, default=dict),
        ),

        # Step 2: Data migration — convert existing auto_flag rows
        migrations.RunPython(migrate_auto_flag_to_rules, migrate_rules_back),

        # Step 3: Remove old fields
        migrations.RemoveField(model_name='templateitem', name='auto_flag'),
        migrations.RemoveField(model_name='templateitem', name='temp_threshold_upper'),
        migrations.RemoveField(model_name='templateitem', name='temp_threshold_lower'),
        migrations.RemoveField(model_name='instanceitem', name='auto_flag'),
        migrations.RemoveField(model_name='instanceitem', name='temp_threshold_upper'),
        migrations.RemoveField(model_name='instanceitem', name='temp_threshold_lower'),
    ]

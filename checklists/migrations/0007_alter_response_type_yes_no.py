# Generated manually on 2026-02-19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('checklists', '0006_outlet_alter_team_passcode_team_outlet'),
    ]

    operations = [
        migrations.AlterField(
            model_name='templateitem',
            name='response_type',
            field=models.CharField(choices=[('yes_no', 'Yes / No'), ('number', 'Number'), ('text', 'Text')], default='yes_no', max_length=10),
        ),
        migrations.AlterField(
            model_name='instanceitem',
            name='response_type',
            field=models.CharField(default='yes_no', max_length=10),
        ),
    ]

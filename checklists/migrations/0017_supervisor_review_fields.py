from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('checklists', '0016_flaggeditem_acknowledgement'),
    ]

    operations = [
        migrations.AddField(
            model_name='instanceitem',
            name='supervisor_confirmed',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='instanceitem',
            name='supervisor_comment',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='checklistinstance',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('pending', 'Pending'),
                    ('completed', 'Completed'),
                    ('verified', 'Double-Verified'),
                    ('expired', 'Expired'),
                    ('rejected', 'Rejected'),
                    ('resubmitted', 'Resubmitted'),
                ],
                default='pending',
                max_length=15,
            ),
        ),
    ]

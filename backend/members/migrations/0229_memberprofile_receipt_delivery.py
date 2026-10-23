"""Receipts ride one channel by default: the email's, with the SMS behind it.

A member may ask for both channels, and the slack for that choice lives on
their profile — receipts never send twice at a member who only ever wanted
the email.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('members', '0228_sda_church_loma_linda'),
    ]

    operations = [
        migrations.AddField(
            model_name='memberprofile',
            name='receipt_delivery',
            field=models.CharField(
                choices=[
                    ('email', 'Email first — SMS only when the email cannot be sent'),
                    ('both', 'Both email and SMS'),
                ],
                default='email',
                help_text="Whether a receipt's SMS accompanies its email or merely stands in when the email cannot go out",
                max_length=10,
            ),
        ),
    ]

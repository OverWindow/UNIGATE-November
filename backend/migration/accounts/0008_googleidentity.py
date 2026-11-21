from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_credit_account_stripe_customer"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleIdentity",
            fields=[
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,
                                              primary_key=True, serialize=False, to=settings.AUTH_USER_MODEL)),
                ("google_sub", models.CharField(max_length=255, unique=True)),
            ],
        ),
    ]

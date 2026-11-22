from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_paid_plan_periods'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='creditpurchase',
            name='credit_purchase_fulfillment',
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='stripe_invoice_id',
            field=models.CharField(max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='stripe_subscription_id',
            field=models.CharField(max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='subscription_state',
            field=models.CharField(max_length=12, null=True),
        ),
        migrations.AddConstraint(
            model_name='creditpurchase',
            constraint=models.UniqueConstraint(condition=models.Q(('subscription_state__in', ('checkout', 'active', 'ending', 'past_due'))), fields=('user',), name='one_open_plus_subscription'),
        ),
        migrations.AddConstraint(
            model_name='creditpurchase',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('status', 'fulfilled'), ('transaction__isnull', False), models.Q(('stripe_session_id__isnull', False), models.Q(('plan_months__isnull', False), ('stripe_invoice_id__isnull', False)), _connector='OR')), models.Q(('status__in', ['pending', 'expired']), ('transaction__isnull', True)), _connector='OR'), name='credit_purchase_fulfillment'),
        ),
    ]

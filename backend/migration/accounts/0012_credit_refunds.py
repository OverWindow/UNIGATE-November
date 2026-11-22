import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_creditpurchase_credited_months'),
        ('writing', '0002_evaluation_feedback_language'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CreditPurchaseRefund',
            fields=[
                ('stripe_refund_id', models.CharField(max_length=255, primary_key=True, serialize=False)),
                ('amount', models.PositiveIntegerField()),
                ('currency', models.CharField(max_length=3)),
                ('status', models.CharField(max_length=32)),
            ],
            options={
                'db_table': 'credit_purchase_refunds',
            },
        ),
        migrations.RemoveConstraint(
            model_name='credittransaction',
            name='credit_transaction_source',
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='pending_refund_credits',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='stripe_payment_intent_id',
            field=models.CharField(max_length=255, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='credittransaction',
            name='refund_purchase',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='refund_entries', to='accounts.creditpurchase'),
        ),
        migrations.AlterField(
            model_name='credittransaction',
            name='kind',
            field=models.CharField(choices=[('grant', '지급'), ('reserve', '예약'), ('capture', '차감'), ('release', '예약 해제'), ('welcome', '신규 가입 지급'), ('unlock', '세트 열람'), ('purchase', '유료 충전'), ('plan_bonus', '플랜 지급'), ('refund', '환불 차감'), ('restore', '환불 복원')], max_length=10),
        ),
        migrations.AddConstraint(
            model_name='credittransaction',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('refund_purchase__isnull', True), models.Q(models.Q(('actor__isnull', False), ('evaluation__isnull', True), ('kind', 'grant'), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('evaluation__isnull', False), ('kind__in', ['reserve', 'capture', 'release']), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('amount', 100), ('evaluation__isnull', True), ('kind', 'welcome'), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('amount', 100), ('evaluation__isnull', True), ('kind', 'unlock'), ('set_id__isnull', False)), models.Q(('actor__isnull', True), ('amount', 1000), ('evaluation__isnull', True), ('kind', 'purchase'), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('amount', 400), ('evaluation__isnull', True), ('kind', 'plan_bonus'), ('set_id__isnull', True)), _connector='OR')), models.Q(('actor__isnull', True), ('amount__gt', 0), ('evaluation__isnull', True), ('kind__in', ['refund', 'restore']), ('refund_purchase__isnull', False), ('set_id__isnull', True)), _connector='OR'), name='credit_transaction_source'),
        ),
        migrations.AddField(
            model_name='creditpurchaserefund',
            name='purchase',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='refunds', to='accounts.creditpurchase'),
        ),
    ]

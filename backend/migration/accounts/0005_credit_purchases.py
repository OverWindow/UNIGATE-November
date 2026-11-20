import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_writing_set_credits'),
        ('writing', '0002_evaluation_feedback_language'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CreditPurchase',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('attempt_id', models.UUIDField()),
                ('amount', models.PositiveIntegerField(default=5000)),
                ('currency', models.CharField(default='krw', max_length=3)),
                ('credits', models.PositiveIntegerField(default=1000)),
                ('status', models.CharField(choices=[('pending', '결제 대기'), ('fulfilled', '적립 완료'), ('expired', '만료')], default='pending', max_length=10)),
                ('stripe_session_id', models.CharField(max_length=255, null=True, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'credit_purchases',
            },
        ),
        migrations.RemoveConstraint(
            model_name='credittransaction',
            name='credit_transaction_source',
        ),
        migrations.AlterField(
            model_name='credittransaction',
            name='kind',
            field=models.CharField(choices=[('grant', '지급'), ('reserve', '예약'), ('capture', '차감'), ('release', '예약 해제'), ('welcome', '신규 가입 지급'), ('unlock', '세트 열람'), ('purchase', '유료 충전')], max_length=10),
        ),
        migrations.AddConstraint(
            model_name='credittransaction',
            constraint=models.CheckConstraint(condition=(
                models.Q(kind='grant', evaluation__isnull=True, actor__isnull=False, set_id__isnull=True)
                | models.Q(kind__in=['reserve', 'capture', 'release'], evaluation__isnull=False, actor__isnull=True, set_id__isnull=True)
                | models.Q(kind='welcome', evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=100)
                | models.Q(kind='unlock', evaluation__isnull=True, actor__isnull=True, set_id__isnull=False, amount=100)
                | models.Q(kind='purchase', evaluation__isnull=True, actor__isnull=True, set_id__isnull=True, amount=1000)
            ), name='credit_transaction_source'),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='transaction',
            field=models.OneToOneField(null=True, on_delete=django.db.models.deletion.PROTECT, to='accounts.credittransaction'),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='user',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name='creditpurchase',
            constraint=models.UniqueConstraint(fields=('user', 'attempt_id'), name='credit_purchase_attempt_unique'),
        ),
        migrations.AddConstraint(
            model_name='creditpurchase',
            constraint=models.CheckConstraint(condition=(
                models.Q(status='fulfilled', transaction__isnull=False, stripe_session_id__isnull=False)
                | models.Q(status__in=['pending', 'expired'], transaction__isnull=True)
            ), name='credit_purchase_fulfillment'),
        ),
    ]

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0008_googleidentity'),
        ('writing', '0002_evaluation_feedback_language'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='credittransaction',
            name='credit_transaction_source',
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='plan_ends_at',
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='plan_months',
            field=models.PositiveSmallIntegerField(null=True),
        ),
        migrations.AddField(
            model_name='creditpurchase',
            name='plan_starts_at',
            field=models.DateTimeField(null=True),
        ),
        migrations.AlterField(
            model_name='credittransaction',
            name='kind',
            field=models.CharField(choices=[('grant', '지급'), ('reserve', '예약'), ('capture', '차감'), ('release', '예약 해제'), ('welcome', '신규 가입 지급'), ('unlock', '세트 열람'), ('purchase', '유료 충전'), ('plan_bonus', '플랜 지급')], max_length=10),
        ),
        migrations.AddConstraint(
            model_name='creditpurchase',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('plan_ends_at__isnull', True), ('plan_months__isnull', True), ('plan_starts_at__isnull', True)), models.Q(('credits', 400), ('plan_months__in', [1, 3, 6]), ('plan_months__isnull', False), models.Q(models.Q(('plan_ends_at__gt', models.F('plan_starts_at')), ('plan_ends_at__isnull', False), ('plan_starts_at__isnull', False), ('status', 'fulfilled')), models.Q(('plan_ends_at__isnull', True), ('plan_starts_at__isnull', True), ('status__in', ['pending', 'expired'])), _connector='OR')), _connector='OR'), name='credit_purchase_plan_period'),
        ),
        migrations.AddConstraint(
            model_name='credittransaction',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('actor__isnull', False), ('evaluation__isnull', True), ('kind', 'grant'), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('evaluation__isnull', False), ('kind__in', ['reserve', 'capture', 'release']), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('amount', 100), ('evaluation__isnull', True), ('kind', 'welcome'), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('amount', 100), ('evaluation__isnull', True), ('kind', 'unlock'), ('set_id__isnull', False)), models.Q(('actor__isnull', True), ('amount', 1000), ('evaluation__isnull', True), ('kind', 'purchase'), ('set_id__isnull', True)), models.Q(('actor__isnull', True), ('amount', 400), ('evaluation__isnull', True), ('kind', 'plan_bonus'), ('set_id__isnull', True)), _connector='OR'), name='credit_transaction_source'),
        ),
    ]

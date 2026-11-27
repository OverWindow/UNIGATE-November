import stripe
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from accounts.credits import locked_account
from accounts.models import CreditPurchase, PlusFreeTrial
from accounts.payments import PaymentsUnavailable, PlanConflict, close_old_plan_checkout, stripe_client


class Command(BaseCommand):
    help = "월간 체험 배포 시 이전 월간 상품의 미완료 즉시 결제창을 만료합니다."

    def handle(self, *args, **options):
        candidates = CreditPurchase.objects.filter(
            Q(subscription_state="checkout") | Q(subscription_state__isnull=True),
            plan_months=1, status="pending", free_trial__isnull=True, stripe_subscription_id__isnull=True,
        ).exclude(
            subscription_state="checkout",
            user_id__in=PlusFreeTrial.objects.filter(status="started").values("user_id"),
        )
        closed = completed = 0
        try:
            sessions = stripe_client(require_webhook=False).v1.checkout.sessions
            for order_id, user_id in candidates.values_list("pk", "user_id").iterator():
                with transaction.atomic():
                    locked_account(user_id)
                    order = candidates.select_for_update(of=("self",)).filter(pk=order_id).first()
                    if order is None:
                        continue
                    try:
                        close_old_plan_checkout(order, sessions)
                    except PlanConflict:
                        # A completed Checkout still needs its paid-invoice webhook.
                        completed += 1
                    else:
                        closed += 1
        except (PaymentsUnavailable, stripe.StripeError):
            raise CommandError("Stripe 결제창을 확인하지 못했습니다. 연결 설정을 확인하고 다시 실행하세요.") from None
        self.stdout.write(f"만료 처리 {closed}건, 결제 완료로 건너뜀 {completed}건")

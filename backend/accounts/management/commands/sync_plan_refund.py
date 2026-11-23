from datetime import UTC, datetime

import stripe
from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from accounts.credits import reconcile_purchase_refunds, refund_credit_adjustment
from accounts.models import CreditAccount, CreditPurchase, CreditPurchaseRefund, CreditTransaction
from accounts.payments import PaymentsUnavailable, stripe_client
from accounts.plans import has_active_plan


def plan_payment(api, account, order):
    if order.stripe_invoice_id:
        page = api.invoice_payments.list({"invoice": order.stripe_invoice_id, "status": "paid",
                                          "expand": ["data.invoice"], "limit": 2})
        if len(page.data) != 1 or page.has_more:
            raise CommandError(f"주문 {order.pk}의 청구서 결제를 하나로 특정할 수 없습니다.")
        payment = page.data[0].to_dict()
        invoice = payment["invoice"]
        details = (invoice.get("parent") or {}).get("subscription_details") or invoice.get("subscription_details") or {}
        subscription = details.get("subscription") or invoice.get("subscription")
        if (not subscription or order.stripe_subscription_id not in (None, subscription)
                or not account.stripe_customer_id or invoice["customer"] != account.stripe_customer_id
                or invoice["id"] != order.stripe_invoice_id or invoice["status"] != "paid"
                or invoice["amount_paid"] != order.amount or payment["amount_paid"] != order.amount
                or invoice["currency"] != order.currency or payment["currency"] != order.currency
                or payment["payment"]["type"] != "payment_intent"):
            raise CommandError(f"주문 {order.pk}와 Stripe 청구서의 소유자 또는 결제 정보가 일치하지 않습니다.")
        intent = payment["payment"].get("payment_intent")
    else:
        # One-time Plus passes issued before recurring billing used Checkout.
        session = api.checkout.sessions.retrieve(order.stripe_session_id).to_dict()
        if (session["id"] != order.stripe_session_id or session["mode"] != "payment"
                or session["payment_status"] != "paid" or session["amount_total"] != order.amount
                or session["currency"] != order.currency
                or (session.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)):
            raise CommandError(f"주문 {order.pk}와 기존 이용권 결제가 일치하지 않습니다.")
        intent = session.get("payment_intent")
        subscription = None
    if not intent or order.stripe_payment_intent_id not in (None, intent):
        raise CommandError(f"주문 {order.pk}의 결제 ID를 확인할 수 없습니다.")
    return intent, subscription


def subscription_periods(api, account, order, subscription, refund):
    orders = CreditPurchase.objects.filter(user_id=account.pk, plan_months__isnull=False)
    if not subscription:
        return orders.filter(pk=order.pk), False
    root = orders.filter(stripe_subscription_id=subscription).first()
    remote = api.subscriptions.retrieve(subscription).to_dict()
    if not root or remote["id"] != subscription or remote["customer"] != account.stripe_customer_id:
        raise CommandError("환불한 청구서와 TOPIQ 원구독을 연결할 수 없습니다.")

    invoice_ids = set()
    for item in api.invoices.list({"subscription": subscription, "status": "paid", "limit": 100}).auto_paging_iter():
        invoice = item.to_dict()
        if invoice["billing_reason"] not in {"subscription_create", "subscription_cycle"}:
            continue
        invoice_ids.add(invoice["id"])
        if invoice["id"] != order.stripe_invoice_id and invoice["amount_paid"] > 0:
            paid_at = (invoice.get("status_transitions") or {}).get("paid_at")
            if not paid_at or paid_at >= refund["created"]:
                raise CommandError("같은 구독에 결제 시각이 불분명하거나 환불 이후 결제된 회차가 있습니다.")
    if order.stripe_invoice_id not in invoice_ids:
        raise CommandError("원구독의 결제 목록에 환불 대상 청구서가 없습니다.")
    periods = orders.filter(Q(pk__in=[root.pk, order.pk])
                            | Q(stripe_invoice_id__in=invoice_ids, plan_ends_at__gt=timezone.now()))
    return periods, remote["status"] not in {"canceled", "incomplete_expired"}


def credit_change(account, order, refund, previous, recorded):
    if recorded:
        return 0
    if not previous and order.refund_entries.exists():
        raise CommandError("성공 환불 기록과 기존 차감·복원 원장이 일치하지 않습니다. 수동 정산을 확인하세요.")
    change = refund_credit_adjustment(account, order, previous + refund["amount"], previous)
    if change < 0:
        raise CommandError("환불 원장에 초과 차감이 있습니다. 기존 정산을 확인하세요.")
    entries = CreditTransaction.objects.filter(account=account)
    since = datetime.fromtimestamp(refund["created"], UTC)
    later = entries.filter(created_at__gte=since)
    additions = later.filter(kind__in=["grant", "welcome", "purchase", "plan_bonus", "release", "restore"])
    if change and additions.exclude(pk=order.transaction_id).exists():
        before = entries.filter(created_at__lt=since).order_by("-created_at", "-pk").first()
        # Independent deposits cannot replace earlier funds if nothing has spent or reserved them.
        deposits_only = not later.exclude(kind__in=["purchase", "plan_bonus"]).exists()
        later_installment = (order.credited_months or 0) > 1 and later.filter(kind="plan_bonus").exists()
        if (not before or before.balance_after - before.reserved_after < change
                or not deposits_only or later_installment):
            raise CommandError("환불 이후 적립·예약 해제·복원 내역이 있습니다. 당시 가용 잔액과 차감 원장을 대조하세요.")
    if change and entries.order_by("-created_at", "-pk").values_list("balance_after", "reserved_after").first() != (
        account.balance, account.reserved
    ):
        raise CommandError("현재 잔액과 크레딧 원장이 일치하지 않습니다. 수동 조정 내역을 확인하세요.")
    return change


class Command(BaseCommand):
    help = "회원의 성공한 Stripe Plus 환불을 조회하고 --apply로 한 건을 반영합니다."

    def add_arguments(self, parser):
        parser.add_argument("--user-id", type=int, required=True)
        parser.add_argument("--refund-id", help="후보가 여러 건일 때 적용할 Stripe 환불 ID")
        parser.add_argument("--apply", action="store_true", help="환불 기록, 크레딧, 원래 구독에 반영")

    def handle(self, *args, **options):
        try:
            self.sync(options["user_id"], options["refund_id"], options["apply"])
        except CreditAccount.DoesNotExist:
            raise CommandError("해당 회원의 크레딧 계정이 없습니다.") from None
        except PaymentsUnavailable:
            raise CommandError("Stripe 연결 설정을 확인하세요.") from None
        except stripe.StripeError as exc:
            raise CommandError(f"Stripe 요청 실패 (HTTP {exc.http_status or '연결 오류'}). 다시 조회하세요.") from None
        except DatabaseError:
            raise CommandError("DB 작업이 완료되지 않았습니다. 연결과 환불 마이그레이션을 확인하고 다시 조회하세요.") from None
        except (KeyError, TypeError, ValueError):
            raise CommandError("Stripe 결제 정보 또는 누적 환불 금액을 검증할 수 없습니다.") from None

    def sync(self, user_id, refund_id, apply):
        account = CreditAccount.objects.get(pk=user_id)
        api = stripe_client(require_webhook=False).v1
        orders = CreditPurchase.objects.filter(user_id=user_id, status="fulfilled", plan_months__isnull=False)
        candidates = []
        for order in orders.order_by("created_at", "pk"):
            intent, _ = plan_payment(api, account, order)
            for item in api.refunds.list({"payment_intent": intent, "limit": 100}).auto_paging_iter():
                refund = item.to_dict()
                if refund["status"] == "succeeded" and (not refund_id or refund["id"] == refund_id):
                    candidates.append((order.pk, refund["id"]))
                    created = timezone.localtime(datetime.fromtimestamp(refund["created"], UTC))
                    self.stdout.write(f'{refund["id"]}  {created:%Y-%m-%d %H:%M %Z}  주문 {order.pk}  '
                                      f'{order.plan_months}개월  {refund["amount"]} {refund["currency"].upper()}')
        if not candidates:
            if refund_id or apply:
                raise CommandError("이 회원의 선택 조건에 맞는 성공한 Plus 환불이 없습니다.")
            self.stdout.write("성공한 Plus 환불이 없습니다.")
            return
        if len(candidates) > 1:
            message = "후보가 여러 건입니다. --refund-id로 한 건을 지정하세요."
            if apply:
                raise CommandError(message)
            self.stdout.write(message)
            return
        order_id, refund_id = candidates[0]
        result = self.reconcile(api, user_id, order_id, refund_id, apply)
        if apply:
            tier, debited = result
            self.stdout.write(self.style.SUCCESS(
                f"반영 완료 | 환불 succeeded | 해당 이용권 revoked | 실제 차감 {debited}크레딧 | 현재 {tier}"))

    @transaction.atomic
    def reconcile(self, api, user_id, order_id, refund_id, apply):
        accounts = CreditAccount.objects
        orders = CreditPurchase.objects
        if apply:
            accounts = accounts.select_for_update()
            orders = orders.select_for_update()
        account = accounts.get(pk=user_id)
        order = orders.get(pk=order_id, user_id=user_id, status="fulfilled", plan_months__isnull=False)
        intent, subscription = plan_payment(api, account, order)
        if subscription:
            payments = api.invoice_payments.list({
                "payment": {"type": "payment_intent", "payment_intent": intent}, "status": "paid", "limit": 2,
            })
            if (len(payments.data) != 1 or payments.has_more
                    or payments.data[0].to_dict()["invoice"] != order.stripe_invoice_id):
                raise CommandError("원결제가 여러 청구서에 걸쳐 있거나 대상 청구서와 일치하지 않습니다.")
        refund = api.refunds.retrieve(refund_id).to_dict()
        refund_intent = refund.get("payment_intent")
        if not refund_intent and refund.get("charge"):
            refund_intent = api.charges.retrieve(refund["charge"]).to_dict().get("payment_intent")
        if (refund["id"] != refund_id or refund["status"] != "succeeded" or refund_intent != intent
                or refund["currency"] != order.currency or not 0 < refund["amount"] <= order.amount):
            raise CommandError("현재 Stripe 환불 상태·원결제·금액·통화가 대상 주문과 일치하지 않습니다.")
        row = CreditPurchaseRefund.objects.filter(pk=refund_id).first()
        if row and (row.purchase_id, row.amount, row.currency) != (order.pk, refund["amount"], order.currency):
            raise CommandError("기존 환불 기록의 원주문 또는 금액이 다릅니다.")
        recorded = row is not None and row.status == "succeeded"
        previous = order.refunds.filter(status="succeeded").aggregate(total=Sum("amount", default=0))["total"]
        if previous > order.amount:
            raise CommandError("기록된 누적 환불액이 결제액을 초과합니다. 기존 정산을 확인하세요.")
        periods, cancel = subscription_periods(api, account, order, subscription, refund)
        periods = periods.exclude(subscription_state="revoked")
        count = periods.count()
        change = credit_change(account, order, refund, previous, recorded)
        tier = "Plus" if has_active_plan(user_id) else "Free"
        self.stdout.write(f"현재 {tier} | 환불 기록 {'완료' if recorded else '반영 예정'} | "
                          f"권한 종료 {count}건 | 원구독 {subscription or '없음'} "
                          f"자동 갱신 취소 {'예정' if cancel else '불필요'} | 차감 {change}크레딧")
        if not apply:
            return
        balance_before = account.balance
        if not recorded:
            order.refunds.update_or_create(stripe_refund_id=refund_id, defaults={
                "amount": refund["amount"], "currency": refund["currency"], "status": "succeeded",
            })
            reconcile_purchase_refunds(account, order, previous_refunded=previous)
        elif order.pending_refund_credits:
            orders.filter(pk=order.pk).update(pending_refund_credits=0)
        if count:
            periods.update(subscription_state="revoked")
        verified = CreditPurchase.objects.filter(pk=order.pk, subscription_state="revoked",
            refunds__stripe_refund_id=refund_id, refunds__status="succeeded").exists()
        if not verified or balance_before - account.balance != change:
            raise CommandError("환불 반영 결과가 예상과 달라 DB 변경을 취소했습니다.")
        # Cancel last. If the response or DB commit is lost, a retry reads Stripe's current state.
        if cancel:
            canceled = api.subscriptions.cancel(subscription, {"invoice_now": False, "prorate": False}).to_dict()
            if canceled["id"] != subscription or canceled["status"] != "canceled":
                raise CommandError("Stripe 구독 종료를 확인하지 못했습니다. 다시 조회하세요.")
        return "Plus" if has_active_plan(user_id) else "Free", balance_before - account.balance

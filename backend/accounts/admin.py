import uuid
from zoneinfo import ZoneInfo

from django import forms
from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.exceptions import PermissionDenied
from django.db import DatabaseError, transaction
from django.db.models import OuterRef, Prefetch, Subquery
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone

from .credits import CreditError, grant
from .models import CreditAccount, CreditTransaction
from .plans import active_plans, extend_plan_end, paid_plans


class GrantForm(forms.Form):
    user_id = forms.IntegerField(min_value=1, label="사용자 ID")
    amount = forms.IntegerField(min_value=1, max_value=1_000_000, label="지급 크레딧")
    reason = forms.CharField(max_length=200, label="지급 사유")
    grant_id = forms.UUIDField(widget=forms.HiddenInput)

    def clean_user_id(self):
        value = self.cleaned_data["user_id"]
        if not get_user_model().objects.filter(pk=value, is_active=True).exists():
            raise forms.ValidationError("활성 사용자를 찾을 수 없습니다.")
        return value


class BulkGrantForm(forms.Form):
    amount = forms.IntegerField(min_value=1, max_value=1_000_000, label="1인당 지급 크레딧")
    reason = forms.CharField(max_length=200, label="지급 사유")
    grant_id = forms.UUIDField(widget=forms.HiddenInput)


class ReadOnlyAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class CurrentPlanFilter(admin.SimpleListFilter):
    title = "현재 플랜"
    parameter_name = "plan"

    def lookups(self, request, model_admin):
        return [("plus", "현재 Plus만 보기")]

    def queryset(self, request, queryset):
        if self.value() == "plus":
            return queryset.filter(active_until__isnull=False)
        return queryset


@admin.register(CreditAccount)
class CreditAccountAdmin(ReadOnlyAdmin):
    list_display = ["user_id", "email", "nickname", "current_plan", "plan_expiry", "balance", "reserved", "updated_at"]
    list_filter = [CurrentPlanFilter]
    search_fields = ["=user__id", "user__email", "user__first_name"]
    search_help_text = "이메일, 닉네임 또는 사용자 번호로 검색합니다."
    list_select_related = ["user"]
    change_list_template = "admin/accounts/credits_list.html"
    actions = ["grant_selected"]

    def get_queryset(self, request):
        now = timezone.now()
        active = active_plans(OuterRef("user_id"), now).order_by("-plan_ends_at")
        extensions = (paid_plans().filter(plan_starts_at__gt=now).order_by("plan_starts_at")
                      .only("user_id", "plan_starts_at", "plan_ends_at"))
        return super().get_queryset(request).annotate(
            active_until=Subquery(active.values("plan_ends_at")[:1]),
        ).prefetch_related(Prefetch("user__creditpurchase_set", queryset=extensions, to_attr="paid_extensions"))

    @admin.display(description="현재 플랜")
    def current_plan(self, obj):
        return "Plus" if obj.active_until is not None else "Free"

    @admin.display(description="이용 만료 일시 (한국시간)", empty_value="—")
    def plan_expiry(self, obj):
        if obj.active_until is None:
            return None
        periods = ((p.plan_starts_at, p.plan_ends_at) for p in obj.user.paid_extensions)
        end = extend_plan_end(obj.active_until, periods)
        return timezone.localtime(end, ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d %H:%M:%S")

    @admin.display(description="이메일", ordering="user__email")
    def email(self, obj):
        return obj.user.email

    @admin.display(description="닉네임", ordering="user__first_name")
    def nickname(self, obj):
        return obj.user.first_name

    def has_grant_permission(self, request):
        return request.user.has_perm("accounts.add_credittransaction")

    @admin.action(description="선택한 사용자에게 크레딧 지급", permissions=["grant"])
    def grant_selected(self, request, queryset):
        if not self.has_grant_permission(request):
            raise PermissionDenied
        accounts = list(queryset.select_related("user").order_by("user_id"))
        if not accounts or any(not account.user.is_active for account in accounts):
            self.message_user(request, "활성 사용자만 선택하여 지급해 주세요.", messages.ERROR)
            return None

        user_ids = [account.user_id for account in accounts]
        confirmation = request.POST.get("confirmation")
        if confirmation:
            try:
                data = signing.loads(confirmation, salt="accounts.bulk_credit_grant")
            except signing.BadSignature:
                self.message_user(request, "지급 확인 정보가 올바르지 않습니다. 대상을 다시 선택해 주세요.", messages.ERROR)
                return None
            if data["user_ids"] != user_ids or data["actor_id"] != request.user.pk:
                self.message_user(request, "지급 대상 또는 관리자가 변경되었습니다. 대상을 다시 선택해 주세요.", messages.ERROR)
                return None
            form = BulkGrantForm(data)
        else:
            form = BulkGrantForm(request.POST if "preview" in request.POST else None,
                                 initial={"grant_id": uuid.uuid4()})

        total = None
        if form.is_bound and form.is_valid():
            amount, reason = form.cleaned_data["amount"], form.cleaned_data["reason"]
            grant_id = form.cleaned_data["grant_id"]
            total = amount * len(accounts)
            if confirmation:
                try:
                    with transaction.atomic():
                        for account in accounts:
                            # Stable per-user IDs make a repeated batch submission idempotent.
                            grant(user_id=account.user_id, amount=amount, actor=request.user, reason=reason,
                                  entry_id=uuid.uuid5(grant_id, str(account.user_id)))
                except (CreditError, DatabaseError):
                    form.add_error(None, "지급을 완료하지 못했습니다. 이번 요청의 변경 사항은 모두 취소되었습니다. 다시 시도해 주세요.")
                else:
                    self.message_user(request, f"{len(accounts)}명에게 각각 {amount}크레딧 지급을 완료했습니다.", messages.SUCCESS)
                    return redirect("admin:accounts_creditaccount_changelist")
            else:
                confirmation = signing.dumps({"user_ids": user_ids, "actor_id": request.user.pk,
                                              "amount": amount, "reason": reason, "grant_id": str(grant_id)},
                                             salt="accounts.bulk_credit_grant")

        return TemplateResponse(request, "admin/accounts/credit_bulk_grant.html", {
            **self.admin_site.each_context(request), "title": "선택한 사용자에게 크레딧 지급",
            "accounts": accounts, "form": form, "confirmation": confirmation, "total": total,
        })

    def get_urls(self):
        return [path("grant/", self.admin_site.admin_view(self.grant_view), name="accounts_creditaccount_grant")] + super().get_urls()

    def grant_view(self, request):
        if not request.user.has_perm("accounts.add_credittransaction"):
            raise PermissionDenied
        form = GrantForm(request.POST if request.method == "POST" else None, initial={"grant_id": uuid.uuid4()})
        if request.method == "POST" and form.is_valid():
            try:
                grant(user_id=form.cleaned_data["user_id"], amount=form.cleaned_data["amount"],
                      reason=form.cleaned_data["reason"], entry_id=form.cleaned_data["grant_id"], actor=request.user)
            except (CreditError, DatabaseError):
                form.add_error(None, "지급을 완료하지 못했습니다. 같은 요청으로 다시 시도하세요.")
            else:
                self.message_user(request, "크레딧 지급 내역을 저장했습니다.", messages.SUCCESS)
                return redirect("admin:accounts_creditaccount_changelist")
        return TemplateResponse(request, "admin/accounts/credit_grant.html", {
            **self.admin_site.each_context(request), "title": "크레딧 지급", "form": form,
        })


@admin.register(CreditTransaction)
class CreditTransactionAdmin(ReadOnlyAdmin):
    list_display = ["created_at", "account_id", "email", "kind", "amount", "set_id", "evaluation_id", "actor_id"]
    list_filter = ["kind"]
    search_fields = ["=account__user__id", "account__user__email", "account__user__first_name"]
    search_help_text = "이메일, 닉네임 또는 사용자 번호로 검색합니다."
    list_select_related = ["account__user"]

    @admin.display(description="이메일", ordering="account__user__email")
    def email(self, obj):
        return obj.account.user.email

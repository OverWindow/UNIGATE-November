import uuid

from django import forms
from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import DatabaseError
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path

from .credits import CreditError, grant
from .models import CreditAccount, CreditTransaction


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


class ReadOnlyAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CreditAccount)
class CreditAccountAdmin(ReadOnlyAdmin):
    list_display = ["user_id", "balance", "reserved", "updated_at"]
    change_list_template = "admin/accounts/credits_list.html"

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
    list_display = ["created_at", "account_id", "kind", "amount", "evaluation_id", "actor_id"]
    list_filter = ["kind"]

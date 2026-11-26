from datetime import timedelta

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.urls import reverse
from django.utils import timezone
from django.utils.http import urlencode

from accounts.models import CreditAccount, RateLimit
from pbt.models import Attempt, AttemptItem, ExamAttemptFeedback
from surveys.csv_export import SEOUL
from surveys.models import SurveyResponse
from writing.models import Evaluation


MENU_GROUPS = {
    "회원·크레딧": [
        ("auth.user", "회원", "person"),
        ("accounts.creditaccount", "크레딧 계정", "account_balance_wallet"),
        ("accounts.credittransaction", "크레딧 거래 내역", "receipt_long"),
        ("auth.group", "권한 그룹", "group"),
    ],
    "신청·설문": [
        ("surveys.surveyresponse", "안내 PDF 신청", "description"),
        ("surveys.signupsurveyresponse", "가입 설문", "assignment"),
    ],
    "시험·피드백": [
        ("pbt.exam", "모의고사", "quiz"),
        ("pbt.examattemptfeedback", "시험 피드백", "rate_review"),
    ],
    "쓰기 평가": [
        ("writing.evaluation", "평가 내역", "edit_note"),
    ],
}


def sidebar(request):
    # Use the URLs Django exposes to this operator, including add-only access.
    links = {
        model["model"]._meta.label_lower: model["admin_url"] or model["add_url"]
        for app in admin.site.get_app_list(request)
        for model in app["models"]
    }
    groups = []
    for heading, entries in MENU_GROUPS.items():
        items = [
            {"title": title, "icon": icon, "link": links[label]}
            for label, title, icon in entries
            if links.get(label)
        ]
        if items:
            groups.append({"title": heading, "items": items})
    return groups


def _pdf_week(responses, start, end):
    first_day = start - timedelta(days=6)
    daily_counts = dict(
        responses.filter(created_at__gte=first_day, created_at__lt=end)
        .order_by()
        .values(day=TruncDate("created_at", tzinfo=SEOUL))
        .annotate(total=Count("pk"))
        .values_list("day", "total")
    )
    peak = max(daily_counts.values(), default=1)
    week = []
    for offset in range(7):
        day = first_day.date() + timedelta(days=offset)
        count = daily_counts.get(day, 0)
        height = max(1, round(100 * count / peak)) if count else 0
        week.append({"date": day, "count": count, "height": height})
    return week


def _stored_counts(user):
    counts = []
    if user.has_perm("accounts.view_ratelimit"):
        records = RateLimit.objects.aggregate(
            total=Count("*"),
            active=Count("pk", filter=Q(expires_at__gt=timezone.now())),
        )
        counts.append({
            "label": "인증 시도 제한 기록",
            "value": records["total"],
            "active": records["active"],
            "expired": records["total"] - records["active"],
        })
    if user.has_perm("pbt.view_attemptitem"):
        counts.append({"label": "문항별 응답 기록", "value": AttemptItem.objects.count()})
    return counts


def dashboard(request, context):
    titles = {label: title for entries in MENU_GROUPS.values() for label, title, _ in entries}
    app_titles = {
        "accounts": "크레딧",
        "auth": "회원·권한",
        "surveys": "신청·설문",
        "pbt": "시험·피드백",
        "writing": "쓰기 평가",
    }
    changelists = {}
    for app in context["app_list"]:
        app["name"] = app_titles.get(app["app_label"], app["name"])
        for model in app["models"]:
            model["name"] = titles.get(model["model"]._meta.label_lower, model["name"])
            if model["admin_url"]:
                changelists[model["model"]] = model["admin_url"]

    start = timezone.localtime(timezone=SEOUL).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    metrics = []
    pdf_week = []
    for model, label, field in (
        (SurveyResponse, "PDF 신청", "created_at"),
        (get_user_model(), "신규 회원", "date_joined"),
        (Attempt, "모의고사 응시 완료", "submitted_at"),
        (Evaluation, "쓰기 평가 요청", "created_at"),
    ):
        date_filter = {f"{field}__gte": start, f"{field}__lt": end}
        if model is Attempt:
            if not request.user.has_perm("pbt.view_attempt"):
                continue
            queryset = Attempt.objects.filter(status="submitted")
            url = None
        else:
            if model not in changelists:
                continue
            queryset = admin.site.get_model_admin(model).get_queryset(request)
            url = f"{changelists[model]}?{urlencode(date_filter)}"

        if model is SurveyResponse:
            pdf_week = _pdf_week(queryset, start, end)
            count = pdf_week[-1]["count"]
        else:
            count = queryset.filter(**date_filter).count()
        metrics.append({"label": label, "value": count, "url": url})

    links = []
    if SurveyResponse in changelists:
        links.append({"label": "신청 목록 보기", "url": changelists[SurveyResponse], "icon": "description"})
    if admin.site.get_model_admin(CreditAccount).has_grant_permission(request):
        links.append({"label": "크레딧 지급", "url": reverse("admin:accounts_creditaccount_grant"), "icon": "account_balance_wallet"})
    if ExamAttemptFeedback in changelists:
        links.append({"label": "시험 피드백 확인", "url": changelists[ExamAttemptFeedback], "icon": "rate_review"})
    context.update(
        dashboard_date=start.date(),
        dashboard_metrics=metrics,
        stored_counts=_stored_counts(request.user),
        pdf_week=pdf_week,
        dashboard_links=links,
    )
    return context

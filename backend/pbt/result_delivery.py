import hashlib
import secrets
from datetime import timedelta
from html import escape
from urllib.parse import quote

from django.conf import settings
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from django.views.decorators.debug import sensitive_variables

from accounts.email_delivery import send_transactional_email
from .models import ExamAttemptFeedback


LINK_LIFETIME = timedelta(days=7)
MAIL_COPY = {
    "ko": ("모의고사 결과가 준비되었습니다", "점수와 정답·해설을 확인하세요.", "결과 확인하기", "이 링크는 7일 동안 유효합니다. 재발송을 요청하면 이전 링크는 만료됩니다."),
    "en": ("Your mock test result is ready", "View your score, answers and explanations.", "View result", "This link is valid for 7 days. Requesting another email replaces the previous link."),
    "id": ("Hasil simulasi Anda sudah siap", "Lihat nilai, kunci jawaban, dan pembahasan.", "Lihat hasil", "Tautan berlaku selama 7 hari. Meminta email baru menggantikan tautan sebelumnya."),
}


@sensitive_variables()
def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_token():
    return secrets.token_urlsafe(32)


def feedback_for(attempt):
    try:
        return attempt.feedback
    except ExamAttemptFeedback.DoesNotExist:
        return None


def has_result_access(request, attempt):
    if attempt.user_id is not None:
        return request.user.is_authenticated and request.user.pk == attempt.user_id
    feedback = feedback_for(attempt)
    grants = request.session.get("exam_result_grants", {})
    grant = grants.get(str(attempt.pk))
    return bool(feedback and grant and feedback.result_token_hash and feedback.result_token_expires_at
                and feedback.result_token_expires_at > timezone.now()
                and constant_time_compare(grant, feedback.result_token_hash))


def feedback_state(attempt):
    feedback = feedback_for(attempt)
    if not feedback:
        return {"completed": False}
    local, domain = feedback.email.rsplit("@", 1)
    retry_at = feedback.email_requested_at + timedelta(seconds=60) if feedback.email_requested_at else None
    return {"completed": True, "rating": feedback.rating,
            "maskedEmail": f"{local[:1]}***@{domain}", "emailStatus": feedback.email_status,
            "retryAt": retry_at.isoformat() if retry_at else None,
            "expiresAt": feedback.result_token_expires_at.isoformat() if feedback.result_token_expires_at else None}


@sensitive_variables()
def build_result_email(attempt, token, language):
    title, body, button, expiry = MAIL_COPY[language]
    link = f"{settings.TOPIQ_PUBLIC_URL}/{attempt.exam_format}/attempts/{attempt.pk}/result#token={quote(token, safe='')}"
    return {"subject": f"[TOPIQ] {title}",
            "textContent": f"{title}\n{attempt.title}\n\n{body}\n{link}\n\n{expiry}",
            "htmlContent": f'<!doctype html><html lang="{language}"><body style="font-family:Arial,sans-serif;color:#162f7f;padding:24px"><h1>{escape(title)}</h1><p>{escape(attempt.title)}</p><p>{escape(body)}</p><p><a href="{escape(link, quote=True)}">{escape(button)}</a></p><p>{escape(expiry)}</p></body></html>'}


@sensitive_variables()
def send_result_email(attempt, email, token, language):
    send_transactional_email(email, build_result_email(attempt, token, language), "topiq-exam-result")

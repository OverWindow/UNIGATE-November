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
    "ko": {
        "subject": "모의고사 결과가 준비되었습니다", "eyebrow": "모의고사 결과 안내",
        "greeting": "수고하셨습니다.", "heading": "결과가 준비되었어요.",
        "body": "오늘의 학습을 돌아볼 시간이에요. 점수와 문항별 정답·해설을 확인하고 다음 학습을 이어가 보세요.",
        "exam": "응시한 시험", "button": "내 결과 확인하기",
        "expiry_title": "링크는 7일 동안 유효합니다",
        "expiry": "메일 재발송을 요청하면 이전 링크는 만료됩니다. 가장 최근에 받은 메일의 링크를 이용해 주세요.",
        "fallback": "버튼이 작동하지 않나요? 아래 주소를 복사해 브라우저에서 열어 주세요.",
        "footer": "한국어 학습의 다음 단계", "ignore": "직접 요청하지 않았다면 이 메일을 무시해 주세요.",
        "sections": {"reading": "읽기", "listening": "듣기"}, "modes": {"practice": "연습", "timed": "실전"},
    },
    "en": {
        "subject": "Your mock test result is ready", "eyebrow": "YOUR MOCK TEST RESULT",
        "greeting": "Well done.", "heading": "Your result is ready.",
        "body": "Take a moment to review your progress. Check your score, answers and explanations, then take your next step in learning Korean.",
        "exam": "YOUR TEST", "button": "View my result",
        "expiry_title": "Your link is valid for 7 days",
        "expiry": "Requesting another email expires the previous link. Please use the link in your most recent email.",
        "fallback": "Button not working? Copy the address below and open it in your browser.",
        "footer": "Your next chapter in Korean", "ignore": "If you did not request this email, you can ignore it.",
        "sections": {"reading": "Reading", "listening": "Listening"}, "modes": {"practice": "Practice", "timed": "Timed"},
    },
    "id": {
        "subject": "Hasil simulasi Anda sudah siap", "eyebrow": "HASIL SIMULASI ANDA",
        "greeting": "Terima kasih sudah berlatih.", "heading": "Hasil Anda sudah siap.",
        "body": "Saatnya meninjau kemajuan Anda. Lihat nilai, kunci jawaban, dan pembahasan untuk melanjutkan perjalanan belajar bahasa Korea.",
        "exam": "UJIAN ANDA", "button": "Lihat hasil saya",
        "expiry_title": "Tautan berlaku selama 7 hari",
        "expiry": "Meminta email baru akan menonaktifkan tautan sebelumnya. Gunakan tautan dalam email terbaru Anda.",
        "fallback": "Tombol tidak berfungsi? Salin alamat di bawah dan buka di browser Anda.",
        "footer": "Langkah baru belajar bahasa Korea", "ignore": "Abaikan email ini jika Anda tidak memintanya.",
        "sections": {"reading": "Membaca", "listening": "Menyimak"}, "modes": {"practice": "Latihan", "timed": "Simulasi"},
    },
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
    copy = MAIL_COPY[language]
    text = {key: escape(value) for key, value in copy.items() if isinstance(value, str)}
    link = f"{settings.TOPIQ_PUBLIC_URL}/{attempt.exam_format}/attempts/{attempt.pk}/result#token={quote(token, safe='')}"
    href = escape(link, quote=True)
    logo = escape(f"{settings.TOPIQ_PUBLIC_URL}/brand/topiq-logo.png", quote=True)
    details = " · ".join(filter(None, (attempt.exam_format.upper(),
        copy["sections"].get(attempt.section), copy["modes"].get(attempt.mode))))
    plain = (f"TOPIQ\n\n{copy['greeting']} {copy['heading']}\n{copy['body']}\n\n"
             f"{copy['exam']}\n{attempt.title}\n{details}\n\n{copy['button']}\n{link}\n\n"
             f"{copy['expiry_title']}\n{copy['expiry']}\n\n{copy['ignore']}\nTOPIQ · {copy['footer']}")
    # Tables and inline styles keep the main layout independent of embedded CSS support.
    html = f'''<!doctype html>
<html lang="{language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{text['subject']}</title></head>
<body style="margin:0;padding:0;background-color:#F3F6FB;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#F3F6FB;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{text['body']}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F6FB" style="width:100%;background-color:#F3F6FB;font-family:Arial,'Malgun Gothic',sans-serif;">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td style="padding:0 12px 22px;">
  <img src="{logo}" width="106" height="44" alt="TOPIQ" style="display:block;width:106px;height:44px;border:0;color:#2D5EC5;font-size:24px;font-weight:bold;">
</td></tr>
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #DEE6F2;border-radius:18px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
  <tr><td height="6" bgcolor="#2D5EC5" style="height:6px;font-size:0;line-height:0;background-color:#2D5EC5;border-radius:18px 18px 0 0;">&nbsp;</td></tr>
  <tr><td style="padding:32px 28px 28px;">
    <p style="margin:0 0 18px;color:#2D5EC5;font-size:11px;font-weight:bold;letter-spacing:1.2px;line-height:18px;">{text['eyebrow']}</p>
    <h1 style="margin:0 0 18px;color:#182D50;font-size:27px;font-weight:bold;letter-spacing:-0.6px;line-height:1.45;word-break:keep-all;">{text['greeting']}<br>{text['heading']}</h1>
    <p style="margin:0 0 26px;color:#5C6B82;font-size:15px;line-height:1.85;word-break:keep-all;">{text['body']}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F7FB" style="width:100%;table-layout:fixed;background-color:#F5F7FB;border:1px solid #E5EAF2;border-radius:12px;">
    <tr><td style="padding:20px;">
      <p style="margin:0 0 9px;color:#6B7A91;font-size:11px;font-weight:bold;letter-spacing:0.6px;line-height:18px;">{text['exam']}</p>
      <p style="margin:0 0 12px;color:#1D3458;font-size:18px;font-weight:bold;line-height:1.6;word-break:break-word;overflow-wrap:anywhere;">{escape(attempt.title)}</p>
      <p style="margin:0;color:#416393;font-size:13px;line-height:1.6;">{escape(details)}</p>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;">
    <tr><td align="center" bgcolor="#2D5EC5" style="background-color:#2D5EC5;border-radius:10px;mso-padding-alt:16px 24px;">
      <a href="{href}" style="display:block;padding:16px 24px;border:1px solid #2D5EC5;border-radius:10px;color:#FFFFFF;font-size:16px;font-weight:bold;line-height:24px;text-align:center;text-decoration:none;">{text['button']}&nbsp; &rarr;</a>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:26px;">
    <tr><td style="padding:0 0 0 14px;border-left:3px solid #D4E1FA;">
      <p style="margin:0 0 5px;color:#425879;font-size:13px;font-weight:bold;line-height:20px;">{text['expiry_title']}</p>
      <p style="margin:0;color:#738096;font-size:12px;line-height:1.8;">{text['expiry']}</p>
    </td></tr></table>
  </td></tr></table>
</td></tr>
<tr><td style="padding:24px 12px 0;">
  <p style="margin:0 0 10px;color:#738096;font-size:11px;line-height:1.8;">{text['fallback']}</p>
  <p style="margin:0;font-size:11px;line-height:1.8;word-break:break-all;overflow-wrap:anywhere;"><a href="{href}" style="color:#607798;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">{escape(link)}</a></p>
  <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #DEE6F2;color:#7B879A;font-size:11px;line-height:1.8;"><strong style="color:#536B8D;">TOPIQ</strong>&nbsp; &middot; &nbsp;{text['footer']}<br>{text['ignore']}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>'''
    return {"subject": f"[TOPIQ] {copy['subject']}", "textContent": plain, "htmlContent": html}


@sensitive_variables()
def send_result_email(attempt, email, token, language):
    send_transactional_email(email, build_result_email(attempt, token, language), "topiq-exam-result")

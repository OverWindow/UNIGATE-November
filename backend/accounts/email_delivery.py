import json
import logging
from html import escape
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings
from django.views.decorators.debug import sensitive_variables


logger = logging.getLogger(__name__)
BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"
MAIL_CONTENT = {
    "ko": {
        "subject": "[TOPIQ] 이메일을 인증해 주세요",
        "heading": "TOPIQ와 함께 시작해요.",
        "body": "아래 버튼으로 이메일을 인증한 뒤 닉네임과 비밀번호를 설정해 주세요.",
        "button": "이메일 인증하기",
        "expiry": "이 링크는 15분 동안 유효합니다. 직접 요청하지 않았다면 이 메일을 무시해 주세요.",
    },
    "en": {
        "subject": "[TOPIQ] Verify your email address",
        "heading": "Your next chapter starts here.",
        "body": "Verify your email below, then choose your nickname and password.",
        "button": "Verify email",
        "expiry": "This link is valid for 15 minutes. Ignore this email if you did not request it.",
    },
    "id": {
        "subject": "[TOPIQ] Verifikasi alamat emailmu",
        "heading": "Mulai langkah baru bersama TOPIQ.",
        "body": "Verifikasi email melalui tombol berikut, lalu tentukan nama panggilan dan kata sandimu.",
        "button": "Verifikasi email",
        "expiry": "Tautan berlaku selama 15 menit. Abaikan email ini jika kamu tidak memintanya.",
    },
}


class EmailDeliveryError(Exception):
    pass


@sensitive_variables()
def build_verification_email(token, language):
    text = MAIL_CONTENT[language]
    # Fragments stay out of HTTP request URLs and access logs.
    link = f"{settings.TOPIQ_PUBLIC_URL}/verify-email#token={quote(token, safe='')}"
    return {
        "subject": text["subject"],
        "textContent": f"{text['heading']}\n\n{text['body']}\n\n{link}\n\n{text['expiry']}",
        "htmlContent": (
            f'<!doctype html><html lang="{language}"><body style="margin:0;background:#F3F4F6;'
            'font-family:Arial,sans-serif;color:#162F7F"><div style="max-width:560px;margin:0 auto;'
            'padding:32px 16px"><div style="background:#fff;border:1px solid #C9D8F7;border-radius:16px;'
            'overflow:hidden"><div style="height:6px;background:#2D5EC5"></div><div style="padding:32px">'
            f'<p style="color:#2D5EC5;font-weight:bold">TOPIQ</p><h1 style="font-size:24px">{escape(text["heading"])}</h1>'
            f'<p style="color:#4b5563;line-height:1.8">{escape(text["body"])}</p>'
            f'<a href="{escape(link, quote=True)}" style="display:inline-block;padding:14px 22px;'
            'margin-top:16px;background:#2D5EC5;color:#fff;border-radius:10px;text-decoration:none;'
            f'font-weight:bold">{escape(text["button"])}</a><p style="margin-top:24px;padding:14px;'
            f'background:#EDF2FC;border-radius:10px;font-size:12px;line-height:1.8">{escape(text["expiry"])}</p>'
            '</div></div></div></body></html>'
        ),
    }


@sensitive_variables()
def send_verification_email(email, token, language):
    if not settings.BREVO_API_KEY or not settings.BREVO_SENDER_EMAIL:
        raise EmailDeliveryError("Email delivery is not configured.")
    payload = {
        "sender": {"email": settings.BREVO_SENDER_EMAIL, "name": settings.BREVO_SENDER_NAME},
        "to": [{"email": email, "contactPixelTrackingConsent": False}],
        **build_verification_email(token, language),
        "tags": ["topiq-email-verification"],
    }
    request = Request(BREVO_ENDPOINT, data=json.dumps(payload).encode("utf-8"), method="POST", headers={
        "accept": "application/json", "content-type": "application/json", "api-key": settings.BREVO_API_KEY,
    })
    try:
        with urlopen(request, timeout=10) as response:
            data = json.loads(response.read(65_537))
        if not isinstance(data, dict) or not isinstance(data.get("messageId"), str) or not data["messageId"]:
            raise ValueError("Missing message id")
    except HTTPError as error:
        logger.warning("Brevo rejected verification email (HTTP %s).", error.code)
        error.close()
        raise EmailDeliveryError("Email delivery is unavailable.") from None
    except (URLError, OSError, ValueError, TypeError):
        logger.warning("Verification email delivery failed.")
        raise EmailDeliveryError("Email delivery is unavailable.") from None

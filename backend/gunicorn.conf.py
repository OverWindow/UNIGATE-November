"""Production HTTP server defaults. / 운영 HTTP 서버 기본 설정."""

import os

bind = "0.0.0.0:8000"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
timeout = 30
graceful_timeout = 30

# Avoid logging query strings, cookies, or authentication headers. / 쿼리·쿠키·인증 헤더를 기록하지 않습니다.
accesslog = "-"
access_log_format = '%(m)s %(U)s %(s)s %(L)s'
errorlog = "-"
loglevel = "info"

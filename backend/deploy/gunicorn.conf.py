import os

bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")
workers = int(os.environ.get("GUNICORN_WORKERS", "1"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))
if workers < 1 or threads < 1:
    raise ValueError("GUNICORN_WORKERS and GUNICORN_THREADS must be positive integers.")
timeout = 30
graceful_timeout = 25
accesslog = "-"
errorlog = "-"
# Keep the peer IP separate from the forwarded chain; omit query strings and bodies.
access_log_format = (
    'ip=%(h)s forwarded_for="%({x-forwarded-for}i)s" '
    '%(m)s %(U)s status=%(s)s duration=%(L)ss '
    'bytes=%(B)s user_agent="%(a)s"'
)
# Scheme is normalized by Nginx; Django handles the explicit trust setting.
forwarded_allow_ips = ""

pidfile = "/tmp/gunicorn.pid"

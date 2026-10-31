import os

bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")
workers = 1
threads = 2
timeout = 30
graceful_timeout = 25
accesslog = None
errorlog = "-"
# Scheme is normalized by Nginx; Django handles the explicit trust setting.
forwarded_allow_ips = ""

pidfile = "/tmp/gunicorn.pid"

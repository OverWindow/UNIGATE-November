"""WSGI application entry point. / WSGI 서버용 애플리케이션 진입점."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()

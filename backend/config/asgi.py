"""ASGI application entry point. / ASGI 서버용 애플리케이션 진입점."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_asgi_application()

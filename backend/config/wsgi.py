"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

# Select settings before initializing Django. / Django 초기화 전에 설정 모듈을 지정합니다.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Expose Django to a WSGI server; this does not start the server.
# WSGI 서버가 호출할 Django 객체를 만듭니다. 이 코드 자체가 서버를 실행하지는 않습니다.
application = get_wsgi_application()

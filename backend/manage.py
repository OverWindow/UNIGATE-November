#!/usr/bin/env python
"""Django management entry point. / Django 관리 명령 진입점."""
import os
import sys


def main():
    """Dispatch CLI commands to Django. / CLI 명령을 Django에 전달합니다."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()

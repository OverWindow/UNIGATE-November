FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_ENV=production

WORKDIR /app

# Cache dependencies separately from source code. / 소스 변경 시 의존성 설치 캐시를 재사용합니다.
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

# Run without root privileges. / 관리자 권한 없이 실행합니다.
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home app

COPY . .

USER app

EXPOSE 8000

# Foreground WSGI server; Docker stop allows graceful shutdown. / WSGI 서버를 직접 실행해 종료 신호를 전달합니다.
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi:application"]

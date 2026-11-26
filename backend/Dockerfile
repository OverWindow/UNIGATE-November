FROM python:3.13-slim-bookworm
ARG POSTGRES_CLIENT_MAJOR=16
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_ENV=production PYTHON_DOTENV_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/keyrings/pgdg.asc \
 && echo 'deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-client-${POSTGRES_CLIENT_MAJOR}" awscli tzdata util-linux \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://github.com/aptible/supercronic/releases/download/v0.2.51/supercronic-linux-amd64 -o /usr/local/bin/supercronic \
 && chmod 755 /usr/local/bin/supercronic
RUN groupadd -g 1000 unigate && useradd -u 1000 -g 1000 -m unigate
WORKDIR /app/backend
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements-production.txt
COPY . ./
RUN chmod 755 /app/backend/export-surveys /app/backend/deploy/backup-db.sh && chown -R unigate:unigate /app
USER unigate
RUN supercronic -test /app/backend/deploy/backup.cron
EXPOSE 8000
ENTRYPOINT ["bash", "/app/backend/deploy/start.sh"]


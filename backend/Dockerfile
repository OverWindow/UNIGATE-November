FROM public.ecr.aws/aws-cli/aws-cli:2.42.4@sha256:4a1a668837d5f97ced202e03827da1bc0b48cda946be89909cd7a02023f62921 AS awscli

FROM python:3.13-slim-bookworm
ARG POSTGRES_CLIENT_MAJOR=16
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_ENV=production PYTHON_DOTENV_DISABLED=1
COPY --from=awscli /usr/local/aws-cli/ /usr/local/aws-cli/
RUN ln -s /usr/local/aws-cli/v2/current/bin/aws /usr/local/bin/aws \
 && aws --version
RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/keyrings/pgdg.asc; \
    echo 'deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends "postgresql-client-${POSTGRES_CLIENT_MAJOR}" procps tini tzdata util-linux; \
    for tool in pg_dump pg_restore; do \
        "$tool" --version | grep -E "^$tool \\(PostgreSQL\\) ${POSTGRES_CLIENT_MAJOR}\\."; \
    done; \
    rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) sha=cc232108374e8e2b537045f2d5eaa1229f619db314c3ba6a14d38b35dc0aa123 ;; \
        arm64) sha=4ae22576a78223d8ccdf5f3b3660a5cbb5288416bf0ca96afc4a36d195932b94 ;; \
        *) echo "Unsupported Supercronic architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/aptible/supercronic/releases/download/v0.2.51/supercronic-linux-$arch" -o /usr/local/bin/supercronic; \
    echo "$sha  /usr/local/bin/supercronic" | sha256sum -c -; \
    chmod 755 /usr/local/bin/supercronic
RUN groupadd -g 1000 unigate && useradd -u 1000 -g 1000 -m unigate
WORKDIR /app/backend
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements-production.txt
COPY . ./
RUN chmod 755 /app/backend/export-surveys /app/backend/deploy/backup-db.sh && chown -R unigate:unigate /app
USER unigate
RUN supercronic -test /app/backend/deploy/backup.cron
EXPOSE 8000
ENTRYPOINT ["sh", "/app/backend/deploy/start.sh"]


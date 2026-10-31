FROM node:24-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm AS backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_ENV=production PYTHON_DOTENV_DISABLED=1
RUN groupadd -g 1000 unigate && useradd -u 1000 -g 1000 -m unigate
WORKDIR /app/backend
COPY backend/requirements*.txt ./
RUN pip install --no-cache-dir -r requirements-production.txt
COPY backend/ ./
COPY deploy/ /app/deploy/
RUN mkdir -p /app/backend/data && chown -R unigate:unigate /app
USER unigate
EXPOSE 8000
ENTRYPOINT ["sh", "/app/deploy/start.sh"]
CMD ["backend"]

FROM backend AS combined
USER root
RUN apt-get update && apt-get install -y --no-install-recommends nginx gettext-base && rm -rf /var/lib/apt/lists/*
COPY frontend/nginx.conf /etc/nginx/nginx.conf.template
COPY frontend/scripts/start-nginx.sh /usr/local/bin/start-nginx.sh
COPY --from=frontend-build /build/out /usr/share/nginx/html
ENV BACKEND_ORIGIN=http://127.0.0.1:8000
USER unigate
EXPOSE 8080
CMD ["combined"]

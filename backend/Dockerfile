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


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:////data/testorbit.db \
    SECRET_KEY_FILE=/data/.secret_key

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Migrations run automatically at startup (app/db.py runs `alembic upgrade head`),
# so the migration scripts and alembic.ini must ship with the image.
COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /data \
    && chown appuser:appuser /data

USER appuser

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=4)"]

# --forwarded-allow-ips lets login rate limiting see real client IPs passed by nginx.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

# Build from the repo root:  docker build -f backend/Dockerfile .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/backend

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
COPY data/seed /srv/data/seed

RUN useradd --create-home appuser && mkdir -p /srv/data/chroma && chown -R appuser /srv/data
USER appuser

EXPOSE 8000
# --proxy-headers: behind App Service / a load balancer, take the client IP from X-Forwarded-For (used by the rate
# limits). Only proxies listed in FORWARDED_ALLOW_IPS are trusted (uvicorn's default: 127.0.0.1); set it to the
# proxy's address in the deployment.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

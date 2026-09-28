FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MATHS_HOST=0.0.0.0 \
    MATHS_PORT=8080 \
    MATHS_DATA_DIR=/app/data

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=65532:65532 server.py index.html teacher.html ./
COPY --chown=65532:65532 assets ./assets

RUN mkdir -p /app/data && chown 65532:65532 /app/data

USER 65532:65532

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3).read()"]

CMD ["python", "server.py"]

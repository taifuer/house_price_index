FROM python:3.11-slim

ARG PIP_INDEX_URL=https://pypi.org/simple

ENV HOME=/home/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --index-url "$PIP_INDEX_URL" -r requirements.txt

RUN useradd --create-home --uid 10001 app

COPY --chown=app:app app.py dashboard_runtime.py dashboard_trends.py ./
COPY --chown=app:app scripts/ ./scripts/
COPY --chown=app:app data/ ./data/
COPY --chown=app:app assets/ ./assets/
COPY --chown=app:app .streamlit/ ./.streamlit/

USER app

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8501/_stcore/health')" || exit 1

ENTRYPOINT ["streamlit", "run", "app.py", \
    "--server.port=8501", \
    "--server.address=0.0.0.0", \
    "--server.headless=true", \
    "--browser.gatherUsageStats=false"]

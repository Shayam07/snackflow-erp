FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
ENV PYTHONPATH=/app/backend:/app
COPY backend /app/backend
COPY database /app/database
ENV PYTHONPATH=/app/backend:/app
WORKDIR /app
EXPOSE 8000
CMD ["sh", "-c", "alembic -c /app/backend/alembic.ini upgrade head && python -m database.seed && uvicorn app.main:app --app-dir /app/backend --host 0.0.0.0 --port 8000"]

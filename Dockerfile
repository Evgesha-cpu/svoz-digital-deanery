FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 SVOZ_DB=/data/svoz.sqlite3
RUN mkdir /data && chown 10001:10001 /data
COPY *.py schema.sql ./
COPY web ./web
USER 10001:10001
EXPOSE 8000
VOLUME ["/data"]
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000"]

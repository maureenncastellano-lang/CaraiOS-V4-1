# Multi-stage build producing ONE image — the frontend build (Session 19)
# is a stage of this same Dockerfile, not a separate manual step someone
# has to remember to run first. `docker build` alone is the entire build.

FROM node:20-slim AS frontend-build
WORKDIR /frontend
# Path assumes the DevOS frontend source sits alongside this Dockerfile at
# ./frontend-src — see README.md for the exact layout expected at build time.
COPY frontend-src/package*.json ./
RUN npm install
COPY frontend-src/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc build-essential git && rm -rf /var/lib/apt/lists/*
COPY requirements-lite.txt .
RUN pip install --no-cache-dir -r requirements-lite.txt
COPY . .
# Real frontend build output replaces the placeholder frontend/ directory —
# this is the actual fix from record.md Session 19: one process serves
# both the API and the real UI, not two separately-run applications.
COPY --from=frontend-build /frontend/build/static/ /app/frontend/static/
COPY --from=frontend-build /frontend/build/index.html /app/frontend/templates/index.html
RUN mkdir -p data/scripts data/venvs
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

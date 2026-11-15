# Build from the repository root:  docker build -f backend/Dockerfile -t mars-beacon-api .
FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
# Only what the API serves: site manifests and the rover frames with their M1 overlays.
COPY fixtures/bundle/gale-boxwork/manifest.json ./bundle/gale-boxwork/manifest.json
COPY fixtures/bundle/gale-boxwork/rover ./bundle/gale-boxwork/rover
COPY fixtures/bundle/jezero/manifest.json ./bundle/jezero/manifest.json
ENV BUNDLE_DIR=/srv/bundle PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]

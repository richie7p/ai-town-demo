# Headless Generative Agents simulation (GPT-6 Luna). Runs on a Compute Engine
# VM; see deploy/gcp/README.md. The image contains no API key.
FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim

# The slim gcloud image only bundles a private Python for gcloud itself.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/venv
COPY reverie/requirements-sim.txt /tmp/requirements-sim.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements-sim.txt

WORKDIR /app
COPY reverie /app/reverie
COPY environment/frontend_server/static_dirs/assets/the_ville/matrix /app/assets/the_ville/matrix
COPY environment/frontend_server/storage /app/base_storage
COPY deploy/gcp/entrypoint.sh /app/entrypoint.sh

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    GA_ASSETS=/app/assets \
    GA_STORAGE=/data/storage \
    GA_TEMP_STORAGE=/data/temp

ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]

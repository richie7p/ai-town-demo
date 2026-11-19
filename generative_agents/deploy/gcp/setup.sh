#!/bin/bash
# One-time project setup: APIs, bucket, image repository, service account and
# the OpenAI key in Secret Manager (typed in, never stored in files).
source "$(dirname "$0")/_common.sh"

gc services enable compute.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
  logging.googleapis.com

gc storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 \
  || gc storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access

gc artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 \
  || gc artifacts repositories create "$REPO" --location="$REGION" --repository-format=docker

gc iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 \
  || gc iam service-accounts create "$SA_NAME" --display-name="Generative Agents simulation"

if ! gc secrets describe openai-api-key >/dev/null 2>&1; then
  read -r -s -p "Paste your OpenAI API key (input hidden): " KEY; echo
  printf '%s' "$KEY" | gc secrets create openai-api-key --data-file=- --replication-policy=automatic
  unset KEY
fi

gc secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:$SA_EMAIL" --role=roles/secretmanager.secretAccessor >/dev/null
gc storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/storage.objectAdmin >/dev/null
gc artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" \
  --member="serviceAccount:$SA_EMAIL" --role=roles/artifactregistry.reader >/dev/null
for role in roles/logging.logWriter roles/monitoring.metricWriter; do
  gc projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role="$role" --condition=None >/dev/null
done
echo "Setup done. Next: ./build.sh"

#!/bin/bash
# Pushes config.env changes (e.g. DAYS, MAX_COST, model settings) to the VM and
# restarts the container; the run resumes from its last checkpoint.
source "$(dirname "$0")/_common.sh"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
for var in SIM FORK DAYS BUCKET MAX_COST WORKERS CHECKPOINT_EVERY FAKE_LLM \
           GA_MODEL GA_REASONING_HIGH GA_REASONING_LOW GA_SERVICE_TIER \
           GA_EMBED_MODEL GA_EMBED_DIMENSIONS; do
  echo "$var=${!var:-}" >> "$ENV_FILE"
done
gc compute instances add-metadata "$VM_NAME" --zone="$ZONE" --metadata-from-file="sim-env=$ENV_FILE"
gc compute ssh "$VM_NAME" --zone="$ZONE" --command="sudo docker rm -f ga-sim; sudo google_metadata_script_runner startup"

#!/bin/bash
# Pushes config.env changes (e.g. DAYS, MAX_COST, model settings) to the VM and
# restarts the container; the run resumes from its last checkpoint.
source "$(dirname "$0")/_common.sh"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
write_sim_env "$ENV_FILE"
gc compute instances add-metadata "$VM_NAME" --zone="$ZONE" --metadata-from-file="sim-env=$ENV_FILE"
gc compute ssh "$VM_NAME" --zone="$ZONE" --command="sudo docker rm -f ga-sim; sudo google_metadata_script_runner startup"

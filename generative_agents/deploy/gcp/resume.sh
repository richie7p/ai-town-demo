#!/bin/bash
# Removes the STOP request and restarts the container on the existing VM; the
# run continues from its last checkpoint. Edit DAYS in config.env first to
# extend a finished run, then run ./update_env.sh.
source "$(dirname "$0")/_common.sh"
gc storage rm "gs://$BUCKET/runs/$SIM/STOP" 2>/dev/null || true
gc compute ssh "$VM_NAME" --zone="$ZONE" --command="sudo docker start ga-sim || sudo google_metadata_script_runner startup"

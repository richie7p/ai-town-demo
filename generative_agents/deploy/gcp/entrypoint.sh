#!/bin/bash
# Container entrypoint for the headless simulation on a Compute Engine VM.
#
# Environment (set through the VM's sim-env metadata, see create_vm.sh):
#   SIM, DAYS, BUCKET            required
#   FORK                         base simulation for a new run
#   MAX_COST, WORKERS, CHECKPOINT_EVERY, BACKUP_SECONDS, FAKE_LLM
#   OPENAI_SECRET                Secret Manager name (default openai-api-key)
#   GA_* model settings          passed through to llm.py
set -euo pipefail
: "${SIM:?SIM is required}" "${DAYS:?DAYS is required}" "${BUCKET:?BUCKET is required}"

mkdir -p "$GA_STORAGE" "$GA_TEMP_STORAGE"
SIM_DIR="$GA_STORAGE/$SIM"
DEST="gs://$BUCKET/runs/$SIM"
STOP_FILE=/data/STOP
rm -f "$STOP_FILE"

if [[ "${FAKE_LLM:-0}" != "1" && -z "${OPENAI_API_KEY:-}" ]]; then
  # Read at start-up only; never written to disk or logged.
  OPENAI_API_KEY="$(gcloud secrets versions access latest --secret="${OPENAI_SECRET:-openai-api-key}")"
  export OPENAI_API_KEY
fi

# A new VM or a replaced disk: continue from the last backup in the bucket.
if [[ ! -d "$SIM_DIR" ]] && gcloud storage ls "$DEST/run_status.json" >/dev/null 2>&1; then
  echo "Restoring $SIM from $DEST"
  mkdir -p "$SIM_DIR"
  gcloud storage rsync --recursive "$DEST" "$SIM_DIR"
fi

if [[ -n "${FORK:-}" && ! -d "$GA_STORAGE/$FORK" ]]; then
  cp -r "/app/base_storage/$FORK" "$GA_STORAGE/$FORK"
fi

backup() {
  [[ -d "$SIM_DIR" ]] || return 0
  gcloud storage rsync --recursive --delete-unmatched-destination-objects \
    --exclude='.*\.tmp$|checkpoint\.(new|old)/.*|STOP$' "$SIM_DIR" "$DEST" >/dev/null 2>&1 \
    || echo "WARNING: backup to $DEST failed"
}

# Hourly backup, and a STOP object in the bucket asks for a graceful stop.
(
  last=$(date +%s)
  while sleep 60; do
    if gcloud storage ls "$DEST/STOP" >/dev/null 2>&1; then touch "$STOP_FILE"; fi
    if (( $(date +%s) - last >= ${BACKUP_SECONDS:-3600} )); then backup; last=$(date +%s); fi
  done
) &
WATCHER=$!

ARGS=(--sim "$SIM" --days "$DAYS" --stop-file "$STOP_FILE"
      --checkpoint-every "${CHECKPOINT_EVERY:-360}" --workers "${WORKERS:-16}")
[[ -n "${FORK:-}" ]] && ARGS+=(--fork "$FORK")
[[ -n "${MAX_COST:-}" ]] && ARGS+=(--max-cost "$MAX_COST")
[[ "${FAKE_LLM:-0}" == "1" ]] && ARGS+=(--fake-llm)

cd /app/reverie/backend_server
set +e
python headless.py "${ARGS[@]}"
code=$?
set -e

kill "$WATCHER" 2>/dev/null || true
backup
echo "Simulation exited with code $code"
# Exit code 0 (finished, stopped, budget reached) is final; anything else makes
# Docker restart the container, which resumes from the last checkpoint.
exit "$code"

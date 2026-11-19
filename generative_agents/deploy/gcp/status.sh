#!/bin/bash
# Progress, spending and state of a run, read from the bucket.
source "$(dirname "$0")/_common.sh"
RUN="${1:-$SIM}"
gc storage cat "gs://$BUCKET/runs/$RUN/run_status.json" 2>/dev/null \
  || echo "No status yet for $RUN (the first backup happens after about an hour)."

#!/bin/bash
# Latest container output from Cloud Logging.
source "$(dirname "$0")/_common.sh"
gc logging read "resource.type=gce_instance AND jsonPayload.container.name=/ga-sim" \
  --limit="${1:-50}" --format='value(jsonPayload.message)' --freshness=1d | tac

#!/bin/bash
# Asks the run to checkpoint and stop gracefully (within about a minute plus
# the current step). Start again with ./resume.sh
source "$(dirname "$0")/_common.sh"
echo stop | gc storage cp - "gs://$BUCKET/runs/$SIM/STOP"
echo "Stop requested for $SIM."

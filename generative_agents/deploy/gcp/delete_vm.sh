#!/bin/bash
# Deletes the VM. The data disk and the bucket are kept (delete them in the
# console when you no longer need the results).
source "$(dirname "$0")/_common.sh"
gc compute instances delete "$VM_NAME" --zone="$ZONE"

#!/bin/bash
# Creates the VM (Container-Optimized OS) with a persistent data disk and
# starts the simulation described in config.env.
source "$(dirname "$0")/_common.sh"
IMAGE="${1:-$(cat "$HERE/.last_image" 2>/dev/null || true)}"
[[ -n "$IMAGE" ]] || { echo "Run ./build.sh first (or pass an image)." >&2; exit 1; }

ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
write_sim_env "$ENV_FILE"

gc compute instances create "$VM_NAME" --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --image-family=cos-stable --image-project=cos-cloud \
  --boot-disk-size=20GB \
  --create-disk="name=$VM_NAME-data,size=${DISK_SIZE_GB}GB,type=pd-balanced,device-name=simdata,auto-delete=no" \
  --service-account="$SA_EMAIL" --scopes=cloud-platform \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
  --metadata="image=$IMAGE,google-logging-enabled=true" \
  --metadata-from-file="startup-script=$HERE/startup-script.sh,sim-env=$ENV_FILE"
echo "VM $VM_NAME started. Watch it with ./status.sh and ./logs.sh"

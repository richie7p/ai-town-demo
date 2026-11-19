#!/bin/bash
# Runs as root on every boot of the Container-Optimized OS VM: mounts the data
# disk and (re)starts the simulation container. Settings come from instance
# metadata written by create_vm.sh.
set -euo pipefail

md() {
  curl -fsS -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"
}

DEV=/dev/disk/by-id/google-simdata
MOUNT=/mnt/disks/sim
if ! blkid "$DEV" >/dev/null 2>&1; then
  mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard -F "$DEV"
fi
mkdir -p "$MOUNT"
mountpoint -q "$MOUNT" || mount -o discard,defaults "$DEV" "$MOUNT"

IMAGE="$(md image)"
md sim-env > /var/sim.env
REGISTRY="${IMAGE%%/*}"

export HOME=/home/simrunner
mkdir -p "$HOME"
docker-credential-gcr configure-docker --registries="$REGISTRY"
docker pull "$IMAGE"

if docker inspect ga-sim >/dev/null 2>&1; then
  state="$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' ga-sim)"
  if [[ "$state" == "exited 0" ]]; then
    echo "Simulation already finished; not restarting."
    exit 0
  fi
  docker rm -f ga-sim
fi

docker run -d --name ga-sim \
  --restart=on-failure:50 \
  --env-file /var/sim.env \
  -v "$MOUNT":/data \
  --log-driver=gcplogs \
  "$IMAGE"

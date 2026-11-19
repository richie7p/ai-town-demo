#!/bin/bash
# Builds the simulation image with Cloud Build and pushes it to Artifact Registry.
source "$(dirname "$0")/_common.sh"
TAG="$(date +%Y%m%d-%H%M%S)"
cd "$HERE/../.."            # generative_agents/
gc builds submit --tag "$IMAGE_BASE:$TAG" .
echo "$IMAGE_BASE:$TAG" > "$HERE/.last_image"
echo "Built $IMAGE_BASE:$TAG. Next: ./create_vm.sh"

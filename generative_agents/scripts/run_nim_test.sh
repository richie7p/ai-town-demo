#!/bin/bash
# Test run against NVIDIA NIM (free developer tier) on your own computer.
# Needs NVIDIA_API_KEY (from build.nvidia.com) and the venv from README.zh-TW.md.
#
#   export NVIDIA_API_KEY=nvapi-...
#   scripts/run_nim_test.sh            # 4 residents, real time, 07:00-13:00
#   scripts/run_nim_test.sh 1080       # or any number of steps (360 = 1 hour)
#   SPEED=10 scripts/run_nim_test.sh   # 10x faster than real time
#   FORK=base_the_ville_tw12 SPEED= scripts/run_nim_test.sh   # 12 residents, full speed
#
# With 4 residents at real time the town needs about 4 requests per minute on
# average, but planning bursts (07:00, 08:00, conversations) briefly need more,
# so GA_MAX_RPM=35 still spreads those out and the town catches up afterwards.
# Ctrl+C stops after saving; run again with the printed --sim name to resume.
set -euo pipefail
: "${NVIDIA_API_KEY:?Set NVIDIA_API_KEY first}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STEPS="${1:-2160}"
FORK="${FORK:-base_the_ville_tw4}"
SPEED="${SPEED-1}"

export GA_API=chat
export GA_BASE_URL=https://integrate.api.nvidia.com/v1
export GA_API_KEY="$NVIDIA_API_KEY"
export GA_MODEL="${GA_MODEL:-meta/llama-3.3-70b-instruct}"
export GA_EMBED_MODEL="${GA_EMBED_MODEL:-nvidia/nv-embedqa-e5-v5}"
export GA_EMBED_DIMENSIONS=""
export GA_EMBED_EXTRA_BODY="${GA_EMBED_EXTRA_BODY:-{\"input_type\":\"passage\",\"truncate\":\"END\"}}"
export GA_MAX_RPM="${GA_MAX_RPM:-35}"
export GA_MAX_CONCURRENCY="${GA_MAX_CONCURRENCY:-4}"
export GA_PRICE_INPUT=0 GA_PRICE_CACHED=0 GA_PRICE_OUTPUT=0 GA_PRICE_EMBED=0

PY="$ROOT/.venv/bin/python"
"$PY" "$ROOT/scripts/check_api.py"
cd "$ROOT/reverie/backend_server"
SIM="nim-test-$(date +%m%d-%H%M)"
PACE=()
[[ -n "$SPEED" ]] && PACE=(--speed "$SPEED")
echo "Running $SIM: $FORK, $STEPS steps, speed ${SPEED:-max} (results in environment/frontend_server/storage/$SIM)"
"$PY" headless.py --fork "$FORK" --sim "$SIM" --days 1 \
  --max-steps "$STEPS" --checkpoint-every 360 --workers 12 "${PACE[@]}"
"$PY" "$ROOT/scripts/summarize_run.py" "$SIM"

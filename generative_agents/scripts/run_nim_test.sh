#!/bin/bash
# Test run of the 12-resident town against NVIDIA NIM (free developer tier) on
# your own computer. Needs NVIDIA_API_KEY (from build.nvidia.com) and the
# venv from README.zh-TW.md.
#
#   export NVIDIA_API_KEY=nvapi-...
#   scripts/run_nim_test.sh            # until 09:00 on day 1
#   scripts/run_nim_test.sh 5400       # or any number of steps (360 = 1 hour)
#
# The free tier allows about 40 requests per minute, so this checks that the
# simulation works end to end; speed and cost must be measured with Luna.
set -euo pipefail
: "${NVIDIA_API_KEY:?Set NVIDIA_API_KEY first}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STEPS="${1:-3240}"

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
echo "Running $SIM for $STEPS steps (results in environment/frontend_server/storage/$SIM)"
"$PY" headless.py --fork base_the_ville_tw12 --sim "$SIM" --days 1 \
  --max-steps "$STEPS" --checkpoint-every 360 --workers 12
"$PY" "$ROOT/scripts/summarize_run.py" "$SIM"

# Shared by the deploy scripts.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$HERE/config.env" ]]; then
  echo "Missing $HERE/config.env -- copy config.env.example and edit it." >&2
  exit 1
fi
set -a; source "$HERE/config.env"; set +a
SA_NAME=ga-sim-runner
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/sim"
gc() { gcloud --project "$PROJECT_ID" "$@"; }

# Settings passed into the container (written to the VM's sim-env metadata).
SIM_ENV_VARS=(SIM FORK DAYS BUCKET MAX_COST WORKERS CHECKPOINT_EVERY FAKE_LLM OPENAI_SECRET
  GA_API GA_BASE_URL GA_MODEL GA_REASONING_HIGH GA_REASONING_LOW GA_REASONING_OVERRIDES
  GA_SERVICE_TIER GA_EMBED_MODEL GA_EMBED_DIMENSIONS GA_EMBED_EXTRA_BODY GA_LANGUAGE
  GA_MAX_CONCURRENCY GA_MAX_RPM GA_PRICE_INPUT GA_PRICE_CACHED GA_PRICE_OUTPUT GA_PRICE_EMBED)
write_sim_env() {
  : > "$1"
  for var in "${SIM_ENV_VARS[@]}"; do
    echo "$var=${!var:-}" >> "$1"
  done
}

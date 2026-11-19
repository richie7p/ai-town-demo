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

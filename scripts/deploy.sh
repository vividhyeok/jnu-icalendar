#!/usr/bin/env bash
set -euo pipefail
set +x
trap 'printf "\nDeployment stopped at line %s. Fix the reported error and rerun.\n" "$LINENO" >&2' ERR
cd "$(dirname "$0")/.."
PROJECT_ID="${1:?Usage: bash scripts/deploy.sh PROJECT_ID [REGION]}"
REGION="${2:-asia-northeast3}"
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || { echo "Invalid project ID" >&2; exit 1; }
[[ "$REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]] || { echo "Invalid region" >&2; exit 1; }
JOB=jnu-calendar
RUNTIME="jnu-calendar@$PROJECT_ID.iam.gserviceaccount.com"
INVOKER="jnu-scheduler@$PROJECT_ID.iam.gserviceaccount.com"
gc() { gcloud --project="$PROJECT_ID" "$@"; }
echo "Target project: $PROJECT_ID / region: $REGION / job: $JOB"
gc projects describe "$PROJECT_ID" --format='value(projectId)'
echo "Enable required APIs"
gc services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com calendar-json.googleapis.com iamcredentials.googleapis.com
for name in jnu-calendar jnu-scheduler; do
  accounts="$(gc iam service-accounts list --filter="email:$name@$PROJECT_ID.iam.gserviceaccount.com" --format='value(email)')"
  if [[ -z "$accounts" ]]; then gc iam service-accounts create "$name" --display-name="$name"; fi
done
# Only this service account can mint its own short-lived Calendar-scoped token.
gc iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:$RUNTIME" --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null
echo "Configure source-build permissions (separate from runtime)"
build_account="$(gc builds get-default-service-account --region="$REGION")"
build_account="${build_account##*/}"
[[ "$build_account" == *@*.gserviceaccount.com ]] || { echo "Cannot determine Cloud Build service account" >&2; exit 1; }
gc projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$build_account" \
  --role=roles/run.builder --condition=None --quiet >/dev/null
bindings=()
configure_secret() {
  local name="$1" env_name="$2" value version existing
  existing="$(gc secrets list --filter="name:$name" --format='value(name)')"
  if [[ -n "$existing" ]]; then
    read -r -s -p "$env_name (Enter preserves existing value): " value
  else
    read -r -s -p "$env_name: " value
  fi
  printf '\n'
  if [[ -z "$existing" ]]; then
    [[ -n "$value" ]] || { echo "$env_name is required" >&2; exit 1; }
    gc secrets create "$name" --replication-policy=automatic >/dev/null
  fi
  if [[ -n "$value" ]]; then
    printf '%s' "$value" | gc secrets versions add "$name" --data-file=- >/dev/null
  fi
  unset value
  version="$(gc secrets versions list "$name" --filter='state=ENABLED' --sort-by='~createTime' --limit=1 --format='value(name)')"
  version="${version##*/}"
  [[ "$version" =~ ^[0-9]+$ ]] || { echo "No enabled version: $name" >&2; exit 1; }
  gc secrets add-iam-policy-binding "$name" --member="serviceAccount:$RUNTIME" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
  bindings+=("$env_name=$name:$version")
}
echo "Secret input is hidden and is not stored in shell history."
configure_secret jnu-portal-username PORTAL_USERNAME
configure_secret jnu-portal-password PORTAL_PASSWORD
read -r -p "Enable Discord notifications? [y/N]: " discord
if [[ "$discord" == [yY] ]]; then configure_secret jnu-discord-webhook DISCORD_WEBHOOK_URL; fi
read -r -p "Google Calendar ID: " calendar_id
[[ -n "$calendar_id" && "$calendar_id" != *","* && "$calendar_id" != *" "* ]] || { echo "Invalid Calendar ID" >&2; exit 1; }
echo "Share the dedicated calendar with $RUNTIME (Make changes to events)."
read -r -p "Press Enter after sharing the calendar."
secret_args="$(IFS=,; echo "${bindings[*]}")"
echo "Build and deploy one-shot job; first build can take several minutes."
gc run jobs deploy "$JOB" --source=. --region="$REGION" --service-account="$RUNTIME" \
  --tasks=1 --parallelism=1 --cpu=1 --memory=1Gi --task-timeout=600s --max-retries=0 \
  --set-env-vars="GOOGLE_CALENDAR_ID=$calendar_id,CALENDAR_SERVICE_ACCOUNT=$RUNTIME" \
  --set-secrets="$secret_args" --quiet
gc run jobs add-iam-policy-binding "$JOB" --region="$REGION" \
  --member="serviceAccount:$INVOKER" --role=roles/run.invoker --quiet >/dev/null
echo "Deployment complete. Run twice and inspect Calendar before enabling the scheduler:"
printf 'gcloud run jobs execute %s --project=%s --region=%s --wait\n' "$JOB" "$PROJECT_ID" "$REGION"
printf 'bash scripts/schedule.sh %s %s\n' "$PROJECT_ID" "$REGION"

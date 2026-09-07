#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${1:?Usage: bash scripts/schedule.sh PROJECT_ID [REGION]}"
REGION="${2:-asia-northeast3}"
[[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || exit 1
[[ "$REGION" =~ ^[a-z]+-[a-z]+[0-9]+$ ]] || exit 1
gc() { gcloud --project="$PROJECT_ID" "$@"; }
name=jnu-calendar-sync
existing="$(gc scheduler jobs list --location="$REGION" --filter="name:$name" --format='value(name)')"
operation=create
[[ -z "$existing" ]] || operation=update
gc scheduler jobs "$operation" http "$name" --location="$REGION" \
  --schedule='17 8,12,16,20 * * *' --time-zone=Asia/Seoul \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/jnu-calendar:run" \
  --http-method=POST --message-body='{}' --headers=Content-Type=application/json \
  --oauth-service-account-email="jnu-scheduler@$PROJECT_ID.iam.gserviceaccount.com" \
  --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform --max-retry-attempts=0
echo "Scheduler configured: 08:17, 12:17, 16:17, 20:17 Asia/Seoul."
echo "An existing paused scheduler stays paused. Check its state in Cloud Scheduler."

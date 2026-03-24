#!/bin/zsh
set -euo pipefail

PROJECT_ID="${1:-smart-mission-race-57839}"
COUNT="${2:-80}"

FIREBASE_SKIP_UPDATE_CHECK=true firebase functions:log \
  --project "$PROJECT_ID" \
  --only backupToDrive \
  -n "$COUNT"

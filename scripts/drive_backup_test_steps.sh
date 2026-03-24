#!/bin/zsh
set -euo pipefail

echo "1. Put service account key at functions/service-account.json"
echo "2. Run: ./scripts/check_drive_service_account.sh"
echo "3. Share target Google Drive folder with printed client_email as Editor"
echo "4. Upload one test photo from the app"
echo "5. Run: ./scripts/watch_drive_backup_logs.sh smart-mission-race-57839 80"
echo "6. Check Realtime Database nodes: drive_backups or drive_backups_errors"

#!/bin/zsh
set -euo pipefail

BASE_URL="${1:-https://smart-mission-race-57839.web.app}"
API_URL="${2:-https://smart-mission-race-57839.web.app/api/mobile-photo-action}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"
HEAD_BIN="${HEAD_BIN:-/usr/bin/head}"

echo "[smoke] hosting pages"
for path in /admin /hq /review /photo_approve /team_login /photo_upload; do
  code=$("$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  echo "$path $code"
  [[ "$code" == "200" ]] || exit 1
done

echo "[smoke] firebase modules"
for path in /js/admin.js /js/hq.js /js/review.js /js/mission_rules.js /js/firebase_config.js; do
  code=$("$CURL_BIN" -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  echo "$path $code"
  [[ "$code" == "200" ]] || exit 1
done

echo "[smoke] api preflight"
options_code=$("$CURL_BIN" -s -o /dev/null -w "%{http_code}" -X OPTIONS "$API_URL")
echo "OPTIONS $options_code"
[[ "$options_code" == "204" || "$options_code" == "200" ]] || exit 1

echo "[smoke] api validation"
post_body='{}'
post_response=$("$CURL_BIN" -sS -X POST "$API_URL" -H 'Content-Type: application/json' -d "$post_body")
echo "$post_response" | "$HEAD_BIN" -c 200 && echo

echo "[smoke] done"

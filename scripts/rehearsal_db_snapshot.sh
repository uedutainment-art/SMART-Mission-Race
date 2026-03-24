#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <project_id> [label]" >&2
  exit 1
fi

PROJECT_ID="$1"
LABEL="${2:-snapshot}"
BASE_DB="${BASE_DB:-https://smart-mission-race-57839-default-rtdb.asia-southeast1.firebasedatabase.app}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="rehearsal_artifacts/${PROJECT_ID}/${STAMP}_${LABEL}"

mkdir -p "$OUT_DIR"

fetch_json() {
  local path="$1"
  local out="$2"
  curl -sS "${BASE_DB}/${path}.json" > "${out}" || {
    echo "{\"error\":\"fetch_failed\",\"path\":\"${path}\"}" > "${out}"
    return 1
  }
}

echo "Saving snapshot to ${OUT_DIR}"

fetch_json "projects/${PROJECT_ID}/meta" "${OUT_DIR}/meta.json" || true
fetch_json "projects/${PROJECT_ID}/routing" "${OUT_DIR}/routing.json" || true
fetch_json "projects/${PROJECT_ID}/teamOverrides" "${OUT_DIR}/teamOverrides.json" || true
fetch_json "projects/${PROJECT_ID}/teams" "${OUT_DIR}/teams.json" || true
fetch_json "uploads_meta/${PROJECT_ID}" "${OUT_DIR}/uploads_meta.json" || true
fetch_json "ops_logs/${PROJECT_ID}" "${OUT_DIR}/ops_logs.json" || true

ROUTING_ENABLED="$(jq -r 'if type=="object" and .missionLibrary then "yes" else "no" end' "${OUT_DIR}/routing.json" 2>/dev/null || echo "unknown")"
TEAM_COUNT="$(jq -r 'if type=="object" then keys | length else 0 end' "${OUT_DIR}/teams.json" 2>/dev/null || echo "0")"
OVERRIDE_TEAM_COUNT="$(jq -r 'if type=="object" then keys | length else 0 end' "${OUT_DIR}/teamOverrides.json" 2>/dev/null || echo "0")"
OPS_READABLE="$(jq -r 'if type=="object" and has("error") then "no" else "yes" end' "${OUT_DIR}/ops_logs.json" 2>/dev/null || echo "unknown")"

jq -n \
  --arg projectId "$PROJECT_ID" \
  --arg label "$LABEL" \
  --arg timestamp "$STAMP" \
  --arg routingEnabled "$ROUTING_ENABLED" \
  --arg teamCount "$TEAM_COUNT" \
  --arg overrideTeamCount "$OVERRIDE_TEAM_COUNT" \
  --arg opsReadable "$OPS_READABLE" \
  '{
    projectId: $projectId,
    label: $label,
    timestamp: $timestamp,
    routingEnabled: $routingEnabled,
    teamCount: ($teamCount|tonumber),
    overrideTeamCount: ($overrideTeamCount|tonumber),
    opsReadable: $opsReadable
  }' > "${OUT_DIR}/summary.json"

echo "Snapshot complete."
echo "Summary:"
cat "${OUT_DIR}/summary.json"

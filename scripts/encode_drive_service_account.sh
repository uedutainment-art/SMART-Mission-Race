#!/bin/zsh
set -euo pipefail

FILE_PATH="${1:-functions/service-account.json}"
if [[ ! -f "$FILE_PATH" ]]; then
  echo "missing: $FILE_PATH" >&2
  exit 1
fi

base64 < "$FILE_PATH" | tr -d '\n'
echo

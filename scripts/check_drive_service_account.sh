#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SA_PATH="$ROOT_DIR/functions/service-account.json"

if [[ -n "${DRIVE_SERVICE_ACCOUNT_JSON_BASE64:-}" ]]; then
  python3 - <<'PY'
import os, json, base64
obj = json.loads(base64.b64decode(os.environ['DRIVE_SERVICE_ACCOUNT_JSON_BASE64']).decode('utf-8'))
print(f"source=env_base64")
print(f"client_email={obj.get('client_email','')}")
print(f"project_id={obj.get('project_id','')}")
print(f"private_key_id={obj.get('private_key_id','')}")
PY
  exit 0
fi

if [[ -n "${DRIVE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  python3 - <<'PY'
import os, json
obj = json.loads(os.environ['DRIVE_SERVICE_ACCOUNT_JSON'])
print(f"source=env_json")
print(f"client_email={obj.get('client_email','')}")
print(f"project_id={obj.get('project_id','')}")
print(f"private_key_id={obj.get('private_key_id','')}")
PY
  exit 0
fi

if [[ ! -f "$SA_PATH" ]]; then
  echo "MISSING: $SA_PATH"
  echo "Set functions/service-account.json or DRIVE_SERVICE_ACCOUNT_JSON(_BASE64)"
  exit 1
fi

python3 - <<'PY' "$SA_PATH"
import json, sys, pathlib
p = pathlib.Path(sys.argv[1])
obj = json.loads(p.read_text())
print(f"source=file")
print(f"client_email={obj.get('client_email','')}")
print(f"project_id={obj.get('project_id','')}")
print(f"private_key_id={obj.get('private_key_id','')}")
PY

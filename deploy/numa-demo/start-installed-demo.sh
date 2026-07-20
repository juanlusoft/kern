#!/usr/bin/env bash
set -euo pipefail

installation_dir=/opt/kern/installations/proinsur-demo
openwebui_dir=/opt/openwebui

docker start numa-dev-pg >/dev/null
for attempt in $(seq 1 60); do
  if docker exec numa-dev-pg pg_isready -q; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "numa-dev-pg did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker compose --project-directory "$installation_dir" \
  -f "$installation_dir/docker-compose.yml" up -d --no-build --wait --wait-timeout 60

docker compose --project-directory "$openwebui_dir" \
  -f "$openwebui_dir/docker-compose.yml" \
  -f "$openwebui_dir/docker-compose.kern-numa.yml" up -d --wait --wait-timeout 90

docker exec -i openwebui python - <<'PY'
import urllib.request

with urllib.request.urlopen('http://kern-numa:8787/v1/models', timeout=5) as response:
    if response.status != 200:
        raise SystemExit('OpenWebUI cannot reach kern-numa')
PY

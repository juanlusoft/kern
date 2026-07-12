#!/usr/bin/env bash
set -euo pipefail

/opt/branding/validate-env.sh

for d in /app/backend/open_webui/static /app/build /app/build/static; do
  cp -f /opt/branding/*.css "$d"/ 2>/dev/null || true
  cp -f /opt/branding/*.png /opt/branding/*.ico /opt/branding/*.svg "$d"/ 2>/dev/null || true
done

sed -i "s/^    WEBUI_NAME += ' (Open WebUI)'/    pass  # Kern: no upstream suffix/" /app/backend/open_webui/env.py
python /opt/branding/apply-kern-runtime-patches.py

cd /app/backend
exec bash start.sh

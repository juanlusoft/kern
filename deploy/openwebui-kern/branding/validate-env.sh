#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${WEBUI_SECRET_KEY:-}" || "${WEBUI_SECRET_KEY}" == REPLACE_* ]]; then
  echo "WEBUI_SECRET_KEY must be a per-installation random secret" >&2
  echo "Generate one with: openssl rand -hex 32" >&2
  exit 1
fi

if [[ -z "${OPENWEBUI_DATA_DIR:-}" ]]; then
  echo "OPENWEBUI_DATA_DIR is required and must point to the company-specific data directory" >&2
  exit 1
fi

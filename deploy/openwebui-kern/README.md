# Kern OpenWebUI Package

This package builds a pinned OpenWebUI image for Kern client installs.

It intentionally does not include:

- `webui.db`, WAL, SHM, uploads, vector stores, chats, sessions, users, or API keys.
- Real `.env` files or `WEBUI_SECRET_KEY`.
- Customer documents or backups.

## Build

```bash
cd deploy/openwebui-kern
cp env.example .env
# Fill WEBUI_SECRET_KEY and OPENWEBUI_DATA_DIR in .env.
openssl rand -hex 32
chmod 0600 .env
docker network create kern_numa_internal
docker compose --env-file .env -f docker-compose.example.yml build
```

## Run

```bash
docker compose --env-file .env -f docker-compose.example.yml up -d
```

The OpenWebUI data directory must be per company, for example:

```text
/opt/kern/companies/numa/openwebui/data
/opt/kern/companies/pacoprint/openwebui/data
```

Use a private Docker network per company. Do not reuse `kern_numa_internal`
for PacoPrint, MiPC, or another customer.

## Patches

The image applies three Kern-specific UI/runtime patches:

- Render assistant content when OpenWebUI stores provider output but not message content.
- Select the single client model (`kern-numa`) on load.
- Hide UI controls not wanted in the client demo while keeping copy and good/bad feedback.

The build must fail if an OpenWebUI upgrade moves the patch anchors.

## Smoke

After starting both OpenWebUI and the matching Kern runtime on the same
company-specific Docker network, validate:

```bash
curl -fsS http://127.0.0.1:3001/health
```

The Kern runtime container must not publish port `8787` on the host.

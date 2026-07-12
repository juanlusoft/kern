# Numa Demo Docker Installation

This runbook installs Kern Numa as a Docker container for the demo.

## Scope

- Runs one read-only Kern container for Numa.
- Joins the existing `openwebui_default` Docker network.
- Joins a dedicated external `numa_db` Docker network shared with the Numa PostgreSQL container.
- Does not publish Kern port `8787` to the host.
- OpenWebUI reaches Kern through Docker DNS: `http://kern-numa:8787/v1`.
- Secrets stay in `deploy/numa-demo/env.runtime`, which must not be committed.

## Files

```text
deploy/numa-demo/
  Dockerfile
  docker-compose.yml
  runtime.installation.example.json
  env.runtime.example
```

Create local runtime files:

```bash
docker network create numa_db
docker network connect numa_db numa-dev-pg
cp deploy/numa-demo/runtime.installation.example.json deploy/numa-demo/runtime.installation.json
cp deploy/numa-demo/env.runtime.example deploy/numa-demo/env.runtime
mkdir -p deploy/numa-demo/data deploy/numa-demo/evidence deploy/numa-demo/memory deploy/numa-demo/logs
```

Fill `deploy/numa-demo/env.runtime` with real secrets outside Git.

For the Spark demo, PostgreSQL should be reached inside Docker as:

```text
NUMA_PGHOST=numa-dev-pg
NUMA_PGPORT=5432
```

Do not depend on the host-only publish `127.0.0.1:15432`; containers cannot use that loopback bind.

Fill `deploy/numa-demo/runtime.installation.json`:

- Replace `REEMPLAZAR_CON_X_OPENWEBUI_USER_ID_REAL`.
- Confirm `company_id_by_organization_id.numa`.
- Confirm `allowed_remote_addresses` matches the OpenWebUI Docker network subnet or exact container IP:

```bash
docker network inspect openwebui_default --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
docker inspect openwebui --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

Use the narrowest practical value. Do not publish Kern port `8787` to the host.

## Start

```bash
docker compose -f deploy/numa-demo/docker-compose.yml up -d --build
docker logs -f kern-numa
```

Expected log:

```json
{"status":"ready","installation_id":"install-numa-demo","organization_id":"numa","openwebui_port":8787}
```

## OpenWebUI

Configure the Numa model endpoint:

```text
Base URL: http://kern-numa:8787/v1
Model: kern-numa
```

OpenWebUI must forward:

```text
X-OpenWebUI-User-Id
```

The forwarded user id must match:

```text
runtime_options.openwebui_channel.users
```

## Smoke

From inside OpenWebUI container:

```bash
docker exec openwebui sh -lc 'python - <<PY
import urllib.request
print(urllib.request.urlopen("http://kern-numa:8787/v1/models", timeout=5).read().decode())
PY'
```

Expected: model list containing `kern-numa`.

Fail-closed checks:

```bash
docker exec openwebui sh -lc 'python - <<PY
import urllib.request
req = urllib.request.Request(
  "http://kern-numa:8787/v1/chat/completions",
  data=b"{\"model\":\"kern-numa\",\"messages\":[{\"role\":\"user\",\"content\":\"Dias de vacaciones de BEATRIZ VERA en 2025\"}]}",
  headers={"content-type":"application/json"},
  method="POST",
)
try:
  urllib.request.urlopen(req, timeout=5)
except Exception as exc:
  print(type(exc).__name__, exc)
PY'
```

Expected: `403`.

## Demo Questions

- `Días de vacaciones de BEATRIZ VERA en 2025`
- `Qué fechas estuvo de vacaciones ALVARO GARCIA en 2025`
- `Cuántos días de asuntos propios tuvo AMADOR MOLINA OCAÑA en 2025`
- `Resumen de horas trabajadas de BEATRIZ VERA en julio de 2025`
- `Informe del mes de mayo de los trabajadores del centro Manindu`

## Stop

```bash
docker compose -f deploy/numa-demo/docker-compose.yml down
```

## Security Notes

- Do not add `ports:` to `kern-numa`.
- Do not mount Docker socket.
- Do not put passwords in Git.
- Do not use `postgres` for the demo unless explicitly accepted as an emergency exception.
- Prefer `kern_ro`.
- Stop any old smoke process before the demo; the Docker container is the only Kern runtime that should serve Numa.

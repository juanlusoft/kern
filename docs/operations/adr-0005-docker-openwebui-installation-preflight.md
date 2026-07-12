# ADR-0005 Docker + OpenWebUI installation preflight

## Status

Accepted operational go/no-go checklist for clean Docker installations.

This document derives from:

- `decisions/ADR-0002-module-and-adapter-pluggability-per-installation.md`
- `decisions/ADR-0003-model-stays-out-of-the-data-path.md`
- `decisions/ADR-0005-dockerized-per-installation-production-deployment.md`

It defines the minimum security and operations scope that must be closed before changing OpenWebUI access, adding companies, or doing a clean production-style installation.

## Goal

Allow several companies to use Kern from the same Spark without leaking data, credentials, model access, evidence, memory, logs or database/API access between installations.

The target model for early production is:

```text
OpenWebUI or reverse proxy
  -> one model/endpoint per company
  -> one Kern container per company
  -> one installation config per company
  -> only that company's DB/API/secrets/data/logs/evidence/memory
```

## Non-goals

This scope does not implement:

- Kubernetes.
- A shared in-process multi-tenant Kern runtime.
- A generic plugin marketplace.
- A final secret manager.
- Migration of Kern v1 installations.
- OpenWebUI visual customization.

## Required decisions before OpenWebUI changes

Before changing users, visible models, endpoints or model permissions in OpenWebUI, these decisions must be explicit for each company:

| Decision | Required value |
| --- | --- |
| `installation_id` | Stable unique id, for example `install-numa-prod` |
| `organization_id` | Stable logical organization, for example `numa` |
| OpenWebUI model id | Unique per company, for example `kern-numa` |
| Kern endpoint | Company-specific endpoint, not shared with other companies |
| Identity source | Header injected by trusted OpenWebUI/proxy |
| Trusted header | `X-OpenWebUI-User-Id` unless changed deliberately |
| User mapping | Explicit `openwebui_user_id -> subject_id / organization_id / roles` |
| Active modules | Only modules needed by that company |
| External systems | Only that company's DB/APIs |
| DB role | Read-only role for read capabilities, for example `kern_ro` |
| Persistent paths | Company-specific data/logs/evidence/memory |
| Backup scope | Company-specific installation backup |

If any value is unknown, the installation must not be treated as production-ready.

## OpenWebUI trust boundary

OpenWebUI can be shared only if it is configured as a trusted identity boundary.

Required controls:

- Users must authenticate in OpenWebUI or in a reverse proxy before reaching Kern.
- Kern endpoints must not be directly reachable by arbitrary clients.
- The client must not be allowed to provide a trusted identity header directly.
- The trusted component must strip incoming `X-OpenWebUI-User-Id` headers before injecting the authenticated one.
- Users or groups must only see the model/endpoints of their company.
- A user from company A must not be able to select the model of company B.
- If OpenWebUI cannot enforce model visibility strongly enough, use a reverse proxy or a separate OpenWebUI instance per company.

Allowed:

```text
User -> OpenWebUI authenticated session -> trusted header -> kern-numa
```

Not allowed:

```text
User -> direct curl to Kern with forged X-OpenWebUI-User-Id
User from MiPC -> selects kern-numa model
User from Numa -> selects kern-pacoprint model
```

## Kern container exposure

Each Kern container must be reachable only through the intended internal path.

Required controls:

- Do not publish Kern ports on all interfaces.
- Prefer Docker service DNS on a controlled Docker network.
- If a host port is needed, bind it to loopback, for example `127.0.0.1:8790:8787`.
- The `openwebui-channel` runtime config defaults to `network_boundary: "loopback"` and must use a loopback `host` (`127.0.0.1`, `localhost`, or `::1`) in that mode.
- Docker-internal deployments may use `network_boundary: "trusted_network"` only when Kern is not published to the host and `allowed_remote_addresses` contains the OpenWebUI/proxy container IPs allowed to call Kern.
- Configs such as `0.0.0.0` or a LAN address without `network_boundary: "trusted_network"` and an explicit allowlist must fail closed.
- Do not use one public Kern endpoint for multiple companies during early production.
- Do not mount Docker socket into Kern containers.
- Do not mount another company's installation folder.

Example intent:

```text
kern-numa      -> internal/loopback only
kern-mipc      -> internal/loopback only
kern-pacoprint -> internal/loopback only
OpenWebUI/proxy -> only shared ingress
```

## Docker network isolation

Each company installation should have its own private Docker network.

Required controls:

- One private network per company installation.
- Shared network only for OpenWebUI/proxy to reach the intended Kern endpoint.
- Egress should be limited to the company's own DB/API endpoints where possible.
- Kern for one company must not be able to reach another company's DB/API.
- Kern for one company must not have credentials for another company.

## Installation configuration

Each installation must have its own config and runtime environment.

Required files or secret references:

```text
/opt/kern/installations/<company>/
  installation.json
  env.runtime
  data/
  logs/
  evidence/
  memory/
```

Required runtime environment:

```bash
KERN_RUNTIME_CONFIG_PATH=/app/config/installation.json
KERN_EVIDENCE_FILE_PATH=/app/evidence/evidence.jsonl
```

`env.runtime` may contain secrets or secret references. It must not be committed to Git and must not be copied into another company's installation.

Required installation config path for conversation memory:

```json
{
  "runtime_options": {
    "conversation_memory_file_path": "/app/memory/conversations.jsonl"
  }
}
```

Do not use undocumented environment variable names for these paths. As of this document, the runtime reads evidence from `runtime_options.evidence_ledger_file_path` or `KERN_EVIDENCE_FILE_PATH`, and conversation memory from `runtime_options.conversation_memory_file_path`.

## Identity mapping rules

Identity must fail closed.

Required behavior:

- Missing `X-OpenWebUI-User-Id` -> denied.
- Unknown `X-OpenWebUI-User-Id` -> denied.
- Mapping without `organization_id` -> invalid config.
- Mapping to another organization -> invalid config.
- Request body trying to override `organization_id` -> ignored or denied; never trusted.
- No fallback user.
- No fallback organization.
- No demo user in production.
- No `org-acme`.

Example mapping shape:

```json
{
  "openwebui_user_id": "real-openwebui-user-id",
  "subject_id": "numa-hr-operator",
  "organization_id": "numa",
  "roles": ["hr_demo"]
}
```

## Module isolation rules

Modules are active per installation, not globally.

Required behavior:

- Activating `openwebui-channel` for Numa does not activate it for Pacoprint.
- Activating `numa-postgres-read` for Numa does not expose it to MiPC or Pacoprint.
- Pacoprint modules must not appear as required modules for Numa.
- Telegram modules must not be required by OpenWebUI-only installations.
- Missing required module config must fail closed for that installation only.

## Database rules

For read capabilities, database access must be read-only.

Required controls:

- Use a dedicated DB role, for example `kern_ro`.
- Do not use `postgres` in production except emergency debug with written handoff.
- Grant only the tables/views required for that company.
- Use closed query catalog and bound parameters.
- Use `statement_timeout`.
- Scope queries by the company's real schema discriminator where required, for example `company_id`.
- Do not rely on the model to provide DB ids, tenant ids, organization ids, quotas or SQL.

## Backup and restore scope

Backups are per installation, not per container.

Back up:

- `installation.json`.
- Secret references or encrypted secret bundle, according to the chosen secret process.
- `data/`.
- `logs/` when needed.
- `evidence/`.
- `memory/`.
- Exact Kern image digest.
- Compose/reverse-proxy config needed to recreate routing.

Do not:

- Restore Numa evidence into Pacoprint.
- Restore MiPC memory into Numa.
- Treat the container filesystem as the source of truth.
- Treat Kern backup as backup of the external business DB/API.

External databases/APIs need their own backup and restore process.

## Preflight checklist

Before accepting traffic for an installation:

```text
[ ] Running image digest recorded.
[ ] Container runs with the expected installation config only.
[ ] KERN_RUNTIME_CONFIG_PATH points to that installation.
[ ] KERN_EVIDENCE_FILE_PATH or runtime_options.evidence_ledger_file_path points inside that installation.
[ ] Evidence path is inside that installation.
[ ] runtime_options.conversation_memory_file_path points inside that installation.
[ ] Memory path is inside that installation.
[ ] Data/log paths are inside that installation.
[ ] No other company's installation folder is mounted.
[ ] No Docker socket is mounted.
[ ] Kern port is not publicly exposed.
[ ] OpenWebUI/proxy strips and injects identity header.
[ ] OpenWebUI/proxy ACL hides other companies' models.
[ ] Missing header returns denied.
[ ] Unknown header returns denied.
[ ] Body organization override is ignored or denied.
[ ] Active modules match only this installation.
[ ] Required module secrets exist.
[ ] DB role is read-only for read capabilities.
[ ] External DB/API endpoint belongs to this company.
[ ] Backup location for this installation exists.
```

## Numa minimum preflight values

For the current Numa/OpenWebUI line, the expected minimum values are:

```text
installation_id: install-numa-prod or another explicit Numa installation id
organization_id: numa
active modules: qwen-orchestrator, numa-postgres-read, openwebui-channel
identity source: header
identity header: x-openwebui-user-id
DB user: kern_ro
PostgreSQL scope mapping: company_id_by_organization_id.numa = <real company_id>
```

Numa must not require Telegram, Holded or Pacoprint secrets when those modules are inactive.

If those secrets are required at startup, that is a bug or a configuration error and must be fixed before production-style installation.

## Smoke tests required

For each company model:

1. Request with valid mapped user succeeds.
2. Request without `X-OpenWebUI-User-Id` is denied.
3. Request with unmapped `X-OpenWebUI-User-Id` is denied.
4. Request attempting to override `organization_id` does not cross tenant.
5. User from company A cannot see or select company B model.
6. Company A Kern cannot reach company B DB/API.
7. Evidence and memory are written under company A paths only.
8. No secrets are printed in logs or committed to Git.
9. `/v1/models` is reachable only from the trusted OpenWebUI/proxy path.
10. The requested `model` is allowlisted by endpoint/proxy and cannot be used to cross tenants.
11. A controlled write attempt with the configured DB user fails.

PostgreSQL read-only validation should include:

```sql
SELECT current_user, current_database();
SELECT has_database_privilege(current_user, current_database(), 'CREATE');
SELECT has_schema_privilege(current_user, 'public', 'CREATE');
```

The result must prove that the configured user cannot create or write. Do not rely on the name `kern_ro` alone.

## Current Numa demo status

The Numa/OpenWebUI smoke is functional for the tested HR read questions after the latest fixes.

Before treating it as production installation, the remaining work is operational:

- create the clean Docker installation layout;
- use `kern_ro` instead of emergency/superuser DB access;
- enforce or document OpenWebUI model ACLs;
- bind Kern endpoint internally or to loopback only;
- run the preflight checklist;
- run the smoke tests from the panel web.

The existing temporary smoke is not the same as a reproducible Docker installation. It proves the Numa flow can work, but production readiness requires the preflight above against the final container topology.

## Change control

Changes to OpenWebUI are safe to do before the Docker installation only if they do not alter:

- model visibility;
- user/group permissions;
- Kern endpoints;
- trusted identity headers;
- forwarding of user info headers;
- company mappings.

If a change touches any of those, apply this security scope first and test the negative cases.

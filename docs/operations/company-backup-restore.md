# Company Backup And Restore

Kern installations must be backed up per company/tenant. Do not mix OpenWebUI state,
runtime state, evidence, uploads, or vector stores across companies.

## Directory Layout

Recommended layout:

```text
/opt/kern/companies/<company>/
  openwebui/data/
  kern/runtime/
  kern/config/
  evidence/
  memory/
  logs/
  backups/
```

Recommended backup target:

```text
/var/backups/kern/<company>/<YYYY-MM-DDTHHMMSSZ>/
  openwebui-webui.db
  openwebui-uploads.tar.zst
  openwebui-vector-db.tar.zst
  kern-config.tar.zst
  kern-runtime.tar.zst
  evidence.tar.zst
  memory.tar.zst
  logs.tar.zst
  compose-and-proxy.tar.zst
  manifest.json
```

## Rules

- Back up one company at a time.
- Do not store backups inside Git.
- Do not include plaintext secrets in `manifest.json`.
- Store secrets separately in the operator secret store, or encrypt the secret
  bundle before writing it to the backup target.
- Encrypt backups before copying them off the server.
- Use restrictive permissions: only the operator/root should read backups.
- Restore into an isolated instance first when testing.
- Record immutable image digests, not only mutable tags.

## OpenWebUI SQLite

Prefer a consistent SQLite backup:

```bash
sqlite3 /opt/kern/companies/<company>/openwebui/data/webui.db \
  ".backup '/var/backups/kern/<company>/<stamp>/openwebui-webui.db'"
```

If SQLite tooling is unavailable, stop the OpenWebUI container briefly, copy
`webui.db`, `webui.db-wal`, and `webui.db-shm` together, then restart.

Validate the copied database before considering the backup complete:

```bash
sqlite3 /var/backups/kern/<company>/<stamp>/openwebui-webui.db \
  "PRAGMA integrity_check;"
```

## Runtime And Operations Files

Back up the company-specific runtime files, without plaintext secrets:

```text
runtime.installation.json
env.runtime.example or encrypted env.runtime
Docker Compose files
reverse proxy/tunnel config for this company
evidence/
memory/
logs/
```

If the customer's operational database is external to Kern, document its backup
location and retention policy in the manifest. Do not copy another company's
database into this backup set.

## Manifest

Each backup must include a manifest with at least:

```json
{
  "company": "numa",
  "created_at": "2026-07-12T18:00:00Z",
  "openwebui_image": "kern-openwebui:0.10.2-kern.1",
  "openwebui_image_digest": "REPLACE_WITH_IMAGE_DIGEST",
  "kern_image": "kern-runtime:numa-demo",
  "kern_image_digest": "REPLACE_WITH_IMAGE_DIGEST",
  "external_databases": [
    {
      "name": "numa-postgres",
      "backup_reference": "REPLACE_WITH_OPERATOR_BACKUP_REFERENCE"
    }
  ],
  "files": [
    {
      "path": "openwebui-webui.db",
      "sha256": "REPLACE_WITH_SHA256",
      "bytes": 0
    }
  ]
}
```

## Restore

1. Stop the target company's OpenWebUI/Kern containers.
2. Restore only into that company's directory.
3. Restore `webui.db` before uploads/vector DB.
4. Restore runtime/evidence files only for the same company.
5. Start containers.
6. Validate login, model visibility, identity mapping, and one smoke question.
7. Run the same restore once in an isolated environment before relying on it for production.

# Proinsur installation preflight

These files prepare an isolated OpenWebUI + PostgreSQL installation without assuming
that Proinsur has the Numa schema. They are templates, not a production declaration.
Do not start the service while any `REEMPLAZAR_...` marker remains.

## Verified local state on 2026-07-20

- No Proinsur installation config, environment file, database endpoint, company id,
  OpenWebUI identity, model ACL or credentials were available in the local workspace.
- A secret-bearing local environment exists for the Numa demo only. It is not evidence
  about Proinsur and was not reused.
- Docker is installed, but the current user cannot access `/var/run/docker.sock`.
  Container topology and network connectivity therefore could not be inspected.

## Values required from the operator

- Stable installation, organization and principal ids.
- Authenticated OpenWebUI user id, model id and the proxy/container IP or CIDR.
- Immutable Kern image digest.
- Proinsur PostgreSQL host, port, database, HR/presence schemas, dedicated role and password.
- Real `company_id` for the organization scope.
- Real absence labels, `ta_time_types.id` values and annual quotas approved by Proinsur.
- Names of the two external Docker networks and proof that the Proinsur Kern container
  cannot reach another company's database.

## Safe preparation

```bash
cp deploy/proinsur/runtime.installation.example.json deploy/proinsur/runtime.installation.json
cp deploy/proinsur/env.runtime.example deploy/proinsur/env.runtime
mkdir -p deploy/proinsur/data deploy/proinsur/evidence deploy/proinsur/memory deploy/proinsur/logs
```

Replace every marker in both local files. Keep `env.runtime` out of Git. The empty
`time_type_by_label` and `annual_quota_by_time_type` maps are intentional: populate them
only from Proinsur's actual vocabulary and `ta_time_types` rows.

Validate that no marker remains and that the installation structure is accepted:

```bash
if rg -n 'REEMPLAZAR_' deploy/proinsur/runtime.installation.json deploy/proinsur/env.runtime; then
  echo 'blocked: unresolved installation values' >&2
  exit 1
fi
node --import tsx --eval \
  "import {readFileSync} from 'node:fs'; import {validateInstallationConfig} from './packages/runtime/src/config.ts'; validateInstallationConfig(JSON.parse(readFileSync('deploy/proinsur/runtime.installation.json','utf8'))); console.log('installation config: ok')"
```

## Database go/no-go

Provision the dedicated role using `kern-ro-grants.sql.example` only from an authorized
administrative session and only after confirming the target database and schema. Then
load `deploy/proinsur/env.runtime` into the current shell without printing it and run:

```bash
set -a
. deploy/proinsur/env.runtime
set +a
npm run preflight:numa-postgres
```

The preflight starts a read-only transaction and fails unless all ten physical relations
used by the active adapter are
visible through the configured `search_path`, all allow `SELECT`, none grants effective
write privileges, and the role lacks database/schema creation and elevated role flags:

```text
kern.employees
kern.employee_punches
core_punches
core_persons
core_punching_points
org_employees
org_employee_groups
org_employee_groups_employees
ta_requests
ta_time_types
```

The older nine-name checklist was not the physical query catalog: `employees` in
`hr.ts` is a CTE, while the runtime also activates three presence capabilities whose
closed queries use `kern.employees` and `kern.employee_punches`. This preflight follows
the relations actually referenced by the running adapter.

If this check fails because relations are missing or incompatible, Proinsur is not a
configuration-only Numa installation. Stop and scope adapter development before giving
a delivery date.

## Container and OpenWebUI go/no-go

1. Create dedicated `kern_proinsur_internal` and `proinsur_db` networks, or update the
   compose names to the operator-approved values.
2. Connect only the trusted OpenWebUI/proxy and this Kern service to the first network;
   connect only this Kern service and Proinsur's database path to the second.
3. Set `KERN_RUNTIME_IMAGE` to an immutable `repository@sha256:...` reference.
4. Verify `docker compose config` and inspect the resulting mounts, networks and image.
5. In OpenWebUI/proxy, create a company-specific endpoint/model, hide it from all other
   companies, strip client-supplied `X-OpenWebUI-User-Id`, and inject the authenticated
   id. These ACL operations require OpenWebUI administrator access and are not encoded
   in this repository.
6. Prove the negative cases before traffic: missing/unknown identity denied, body
   organization override denied or ignored, other-company model invisible, other-company
   DB unreachable, and a controlled DB write denied.
7. Confirm evidence, memory, data and logs exist only below this installation directory,
   and record the image digest and per-installation backup location.

Do not enable Telegram for this installation unless it is explicitly required and its
channel responses have passed the client-neutral vocabulary tests.

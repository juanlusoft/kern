# PacoPrint agents installation

This deployment is for the new Kern runtime installations that replace selected PacoPrint v1 agents.

## Scope

First wave:

- `juan-lopez`: pricing / presupuestos with PacoPrint catalog.
- `gema-administracion`: temporary validation profile with Holded invoices plus PacoPrint pricing. Split back later after customer tests.

Each migrated agent is an independent runtime installation:

- one Telegram bot token per agent;
- one `runtime.installation.json` per agent;
- one container per agent;
- separated evidence, memory, logs and data folders;
- same logical organization: `pacoprint`;
- different `installation_id`.

Do not mix these files with Numa or MiPC.

## Files

```text
deploy/pacoprint-agents/
  Dockerfile
  docker-compose.yml
  gema-administracion/
    env.runtime.example
    runtime.installation.example.json
  juan-lopez/
    env.runtime.example
    runtime.installation.example.json
```

## Prepare on the PacoPrint Spark

From this directory:

```bash
cp gema-administracion/env.runtime.example gema-administracion/env.runtime
cp gema-administracion/runtime.installation.example.json gema-administracion/runtime.installation.json

cp juan-lopez/env.runtime.example juan-lopez/env.runtime
cp juan-lopez/runtime.installation.example.json juan-lopez/runtime.installation.json
```

Fill `env.runtime` files outside Git using the v1 secrets inventory kept outside the repo.

Private inventory on Juanlu workstation:

```text
/home/jlu/proyectos/credentials/pacoprint-kern-v1-agent-secrets-2026-07-14.env
```

Do not commit `env.runtime` or `runtime.installation.json` if they contain real values.

## Required secrets

For `juan-lopez` pricing:

```text
KERN_TELEGRAM_BOT_TOKEN
KERN_MODEL_BASE_URL
KERN_MODEL_NAME
KERN_MODEL_API_KEY
HOLDED_API_KEY
PACOPRINT_API_TOKEN
```

For temporary `gema-administracion` validation:

```text
KERN_TELEGRAM_BOT_TOKEN
KERN_MODEL_BASE_URL
KERN_MODEL_NAME
KERN_MODEL_API_KEY
HOLDED_API_KEY
PACOPRINT_API_TOKEN
```

`KERN_MODEL_API_KEY` may be empty if the local vLLM endpoint does not require auth.

## Start

```bash
docker compose -f deploy/pacoprint-agents/docker-compose.yml up -d --build
```

## Validate

```bash
docker compose -f deploy/pacoprint-agents/docker-compose.yml ps
docker logs --tail=100 kern-pacoprint-gema-administracion
docker logs --tail=100 kern-pacoprint-juan-lopez
```

Smoke from Telegram:

- ask `juan-lopez` for a single PacoPrint product price;
- ask `juan-lopez` for a multi-line presupuesto;
- ask `gema-administracion` for invoice/Holded reads and pricing while this temporary validation profile is active;
- verify unknown Telegram users fail closed;
- verify no Numa/MiPC capabilities are active.

## Cutover rule

Keep v1 running until both new containers pass smoke. Stop v1 agents only after explicit approval.

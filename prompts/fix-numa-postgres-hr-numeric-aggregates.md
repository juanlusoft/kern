# Fix Numa Postgres HR — normalizar agregados numéricos de PostgreSQL

> Prompt CTO/Sol -> Terra. Fecha: 2026-07-11. Rama: `fix/numa-postgres-hr-numeric-aggregates`.

## Contexto

Tras fusionar PR #96, el workflow Numa HR ya tiene renderer determinista para `response.message`.

En smoke real Spark/OpenWebUI, `leave.days` sigue devolviendo:

```text
capability executed
```

Eso indica que la capability ejecuta, pero el renderer devuelve `null` porque el shape real no encaja.

## Causa confirmada

PostgreSQL devuelve `COUNT()` como `string` mediante `pg`.

El adapter declara esos campos como `number`, pero no normaliza:

- `leave.days`
  - `days_disfrutados`
  - `days_pendientes`
- `leave.balance`
  - `days_disfrutados`
  - `days_pendientes`
  - `balance` calculado desde esos valores
- `report.month-by-group`
  - `days_with_punch`
  - `leave_days`
  - `vacation_days`

El contrato y el renderer esperan `number`, así que al recibir `"7"` en vez de `7`, el renderer falla cerrado y cae al mensaje anterior.

## Objetivo

Normalizar en el adapter Numa Postgres los agregados HR de PostgreSQL a `number` antes de devolver resultados.

## Alcance permitido

Tocar solo:

```text
packages/adapters/numa-postgres/src/hr.ts
packages/adapters/numa-postgres/test/numa-postgres-read-adapter.test.ts
prompts/fix-numa-postgres-hr-numeric-aggregates.md
```

No tocar:

- OpenWebUI channel
- workflows renderer
- Telegram
- Pacoprint
- Holded
- Qwen
- Core/contratos
- frontend
- runtime config
- SQL salvo necesidad demostrada

## Requisitos

- Añadir helper de normalización finita para valores `number | string`.
- Fallar explícitamente si el valor no es numérico finito.
- Usar valores normalizados para `balance`.
- Añadir tests con rows que simulan `pg`, es decir, agregados como strings.
- Mantener `organization_id` lógico y `company_id` real sin cambios.
- No relajar tests.

## Gates

```bash
npm run check:boundaries
npm run typecheck
npm test
git diff --check
```

Validar UTF-8 sin BOM en archivos tocados.

## Reporte esperado

```text
Rama:
Commit:
PR:
Archivos tocados:
Qué cambió:
Qué NO se tocó:
Validaciones:
Worktree limpio:
```

No fusionar hasta revisión.

# Fix Numa HR OpenWebUI — respuesta de negocio determinista en vez de `capability executed`

> Prompt CTO/Sol -> Terra. Fecha: 2026-07-11. Rama propuesta: `fix/numa-hr-openwebui-business-response`.

## Contexto

El smoke Numa/OpenWebUI ya confirma:

- OpenWebUI channel responde.
- Identidad por `X-OpenWebUI-User-Id` funciona.
- Fail-closed funciona:
  - sin header: `403`
  - header no mapeado: `403`
  - intento de sobrescribir `organization_id`: ignorado
- PostgreSQL real ejecuta las capabilities HR tras los fixes de schema/company/name-filter.

Pero la respuesta visible en OpenWebUI es:

```text
capability executed
```

El JSON observado contiene metadata `kern.sources`, pero `choices[0].message.content` no contiene la respuesta de negocio.

## Diagnóstico

El problema no es SQL ni el canal OpenWebUI.

El canal OpenWebUI usa `outcome.response.message` como texto visible.

En `packages/workflows/src/hr-workflow.ts`, cuando la capability termina, el workflow conserva `response.data`, pero pone como `response.message`:

```ts
capability_result.reason ?? capability_result.error ?? 'Numa HR read completed'
```

Para Numa HR eso acaba siendo `capability executed`.

## Objetivo

Crear un renderer determinista para resultados Numa HR que convierta `response.data` en texto de negocio útil, y usarlo como `response.message`.

OpenWebUI debe mostrar respuestas como:

- vacaciones/asuntos propios del empleado;
- hora de fichaje;
- resumen de jornada;
- informe mensual por grupo;
- mensajes claros cuando no hay registros.

## Alcance obligatorio

Un solo concepto:

```text
response.message determinista para Numa HR
```

Tocar solo, si hace falta:

```text
packages/workflows/src/hr-workflow.ts
packages/workflows/src/numa-hr-response-renderer.ts
packages/workflows/test/*
```

No tocar:

- Pacoprint
- Holded
- Telegram
- OpenWebUI channel
- Qwen
- Core
- contratos
- runtime config
- adapters/Postgres SQL
- frontend
- `report.month-by-group` SQL
- `presence/schema kern.*`

Si parece necesario tocar algo fuera de `packages/workflows`, detenerse y reportar.

## Diseño requerido

Crear:

```ts
renderNumaHrResponseMessage(data: unknown): string | null
```

en:

```text
packages/workflows/src/numa-hr-response-renderer.ts
```

Integrarlo en `hr-workflow.ts` después de calcular `responseData` y antes de `createRuntimeResponse`.

Reglas:

- Solo renderizar si `capability_result.status === 'executed'`.
- Solo renderizar si `responseData` tiene shape reconocido.
- Si el shape no encaja, conservar el fallback actual.
- No modificar `response.data`.
- No recalcular SQL ni métricas de negocio.
- No usar LLM.
- No usar `Date`, `Intl`, timezone implícita ni locale.
- Mantener timestamps tal como llegan.
- Formatear minutos con función pura.
- Respetar el orden de `records`.
- Si `truncated === true`, añadir nota clara de resultado truncado sin afirmar totales reales.
- Si no hay registros, devolver texto explícito de “sin registros”.
- Si falta cuota/saldo en `leave.balance`, no inventarla; mostrar `message` si viene del adapter.

## Query IDs a cubrir

- `punch.day`
- `leave.days`
- `leave.balance`
- `worktime.summary`
- `report.month-by-group`

## Tests obligatorios

Añadir tests unitarios del renderer:

- una salida exacta para cada `query_id`;
- payload vacío/sin registros;
- `truncated: true`;
- cuota/saldo nulos;
- payload desconocido o malformado devuelve `null`.

Añadir o ampliar test del workflow HR:

- capability HR ejecutada;
- `response.data` queda intacto;
- `response.message` usa el renderer;
- fallback actual se conserva cuando el renderer devuelve `null`.

## Gates

Antes de reportar:

```bash
npm run check:boundaries
npm run typecheck
npm test
git diff --check
```

Si `npm test` falla por temporales del entorno, repetir con `TMP/TEMP/TMPDIR` local y reportarlo.

Validar UTF-8 sin BOM en archivos tocados.

## Reporte esperado

```text
Rama:
Commit:
PR:
Archivos tocados:
Qué cambió:
Qué NO se tocó:
Ejemplos de respuesta renderizada:
Validaciones:
Worktree limpio:
```

No fusionar.

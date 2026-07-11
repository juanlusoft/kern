# Cierre diario — 2026-07-11

## Responsable
Nombre: Sol / ChatGPT CTO

## Proyecto
Proyecto: Kern
Repositorio: `https://github.com/juanlusoft/kern.git`
Ruta: `/home/jlu/proyectos/kern core/kern`
Rama: `main`
Rama base: `main`
Último commit: `df32adf6f3af4d06edc35d9fd3632385dd07b556`
PR o ticket: PR #96, PR #97

## Objetivo del día
- Cerrar el smoke real Numa/OpenWebUI/Spark para que el panel web muestre respuestas de negocio y no solo `capability executed`.
- Mantener aislamiento: no tocar Pacoprint, Telegram, Holded, Qwen, frontend ni SQL fuera del scope Numa HR/Postgres.

## Trabajo completado
- Se fusionó PR #96: `fix(numa): render HR business responses`.
- Se añadió un renderer determinista de resultados Numa HR en `packages/workflows`.
- Se fusionó PR #97: `fix(numa): normalize HR numeric aggregates`.
- Se corrigió el fallo real por `COUNT()` de PostgreSQL devuelto como string en el adapter Numa Postgres.
- Se actualizó la Spark a `main` en `df32adf`.
- Se levantó un smoke temporal Numa/OpenWebUI/Postgres en Spark en `127.0.0.1:8787`.
- Se verificó que las respuestas visibles ya no son `capability executed`.
- Se verificó fail-closed sin header.

## Cambios realizados
- Proyecto: `kern`
- Rama PR #96: `fix/numa-hr-openwebui-business-response`
- Commit PR #96: `02f6a7ba1141c375ca3d3973d1c7526829fb2473`
- PR #96: `https://github.com/juanlusoft/kern/pull/96`
- Archivos principales PR #96:
  - `packages/workflows/src/hr-workflow.ts`
  - `packages/workflows/src/numa-hr-response-renderer.ts`
  - `packages/workflows/test/numa-hr-response-renderer.test.ts`
  - `prompts/fix-numa-hr-openwebui-business-response.md`
- Cambio PR #96: `response.message` de Numa HR se renderiza determinísticamente desde `response.data` cuando la capability ejecuta correctamente.

- Rama PR #97: `fix/numa-postgres-hr-numeric-aggregates`
- Commit PR #97: `df32adf6f3af4d06edc35d9fd3632385dd07b556`
- PR #97: `https://github.com/juanlusoft/kern/pull/97`
- Archivos principales PR #97:
  - `packages/adapters/numa-postgres/src/hr.ts`
  - `packages/adapters/numa-postgres/test/numa-postgres-read-adapter.test.ts`
  - `prompts/fix-numa-postgres-hr-numeric-aggregates.md`
- Cambio PR #97: normalización de agregados HR de PostgreSQL (`COUNT()`) de string a number en `leave.days`, `leave.balance` y `report.month-by-group`.

## Estado actual
Terminado para smoke directo Numa/OpenWebUI/Postgres. Pendiente de desarrollo para el bug de módulos requeridos globales del runtime.

## Validaciones realizadas
- Comando o prueba: `npm run check:boundaries`
- Resultado: PASS

- Comando o prueba: `npm run typecheck`
- Resultado: PASS

- Comando o prueba: `npm test`
- Resultado: PASS, `349 tests`, `346 pass`, `3 skip`

- Comando o prueba: `git diff --check`
- Resultado: PASS

- Comando o prueba: smoke directo Spark `http://127.0.0.1:8787/v1/chat/completions` con `X-OpenWebUI-User-Id: spark-user-1`
- Resultado: PASS

- Prueba manual: `Días vacaciones del trabajador Eugenio Moya.`
- Resultado: `HTTP 200`, respuesta visible:

```text
Ausencias de Eugenio Moya en 2025:
- _(HOLIDAY): 7 dias disfrutados.
```

- Prueba manual: `Informe del mes de mayo de los trabajadores del centro Manindu.`
- Resultado: `HTTP 200`, respuesta visible empieza por:

```text
Informe de MANINDU MARTOS para 2026-5:
```

- Prueba manual: sin `X-OpenWebUI-User-Id`
- Resultado: `HTTP 403`, `authentication_error`, `permission_denied`

## Decisiones tomadas
- Se decidió corregir `capability executed` en dos capas separadas:
  - Workflow: renderer determinista de respuesta de negocio.
  - Adapter Numa Postgres: normalización de agregados numéricos reales de PostgreSQL.
- Se decidió no tocar OpenWebUI channel porque el canal ya hacía lo correcto: mostrar `outcome.response.message`.
- Se decidió no cambiar SQL para el bug de agregados y normalizar en mapper, porque el contrato del adapter debe ser estable aunque el driver `pg` devuelva `COUNT()` como string.
- Se decidió usar un smoke temporal mínimo Numa/OpenWebUI/Postgres en Spark porque `startInstallationRuntime` todavía exige módulos y secretos ajenos.

## Problemas conocidos
- Bug pendiente: `startInstallationRuntime` exige módulos globales aunque una instalación Numa/OpenWebUI no los use.
- Módulos observados como requeridos globalmente:
  - `telegram-channel`
  - `qwen-orchestrator`
  - `holded-read`
- Consecuencia: una instalación Numa/OpenWebUI queda bloqueada si no existen secretos de Telegram/Holded aunque no deberían ser necesarios para ese smoke.
- Esto incumple la separación por instalación/módulo y puede mezclar dependencias de clientes/canales.
- El smoke actual en Spark funciona con un servidor temporal mínimo, no con el entrypoint oficial completo.

## Bloqueos
- Bloqueo funcional pendiente: corregir el diseño del runtime para que los módulos y secretos requeridos dependan de la instalación activa, no de una lista global.
- No falta información externa para empezar: el fallo ya está reproducido por el intento de arranque con `startInstallationRuntime`.

## Próximo paso exacto
- Crear una rama nueva desde `main` llamada `fix/runtime-required-modules-per-installation`.
- Revisar `packages/runtime/src/slice.ts`, especialmente `REQUIRED_MODULES`, validación de módulos y resolución de `secret_refs`.
- Cambiar la validación para que una instalación Numa/OpenWebUI pueda arrancar sin `telegram-channel` ni `holded-read`.
- Añadir tests que demuestren:
  - Numa/OpenWebUI arranca con `qwen-orchestrator`, `numa-postgres-read` y `openwebui-channel` sin secretos de Holded/Telegram.
  - Holded/Telegram siguen fallando cerrado cuando esos módulos están activos y falta su secreto.
- No tocar Pacoprint, Telegram, Holded ni OpenWebUI fuera de la validación modular necesaria.

## Cómo retomar el trabajo
1. Abrir `/home/jlu/proyectos/kern core/kern`.
2. Confirmar estado:

```bash
git checkout main
git pull --ff-only origin main
git status --short
git log --oneline -5
```

3. Crear rama:

```bash
git switch -c fix/runtime-required-modules-per-installation
```

4. Revisar:

```bash
sed -n '1,140p' packages/runtime/src/slice.ts
rg -n "REQUIRED_MODULES|secret_refs|secret_missing|active_modules|Missing required secret" packages/runtime/src packages/runtime/test
```

5. Implementar tests primero para el arranque Numa/OpenWebUI sin Holded/Telegram.
6. Ejecutar gates:

```bash
npm run check:boundaries
npm run typecheck
npm test
git diff --check
```

## Archivos y módulos relevantes
- `packages/runtime/src/slice.ts`
- `packages/runtime/src/config.ts`
- `packages/runtime/test/runtime-slice.test.ts`
- `packages/runtime/test/installation-config.test.ts`
- `packages/workflows/src/hr-workflow.ts`
- `packages/workflows/src/numa-hr-response-renderer.ts`
- `packages/adapters/numa-postgres/src/hr.ts`
- `packages/channels/openwebui/src/index.ts`
- `/tmp/kern-openwebui-numa-smoke.mjs` en Spark

## Documentación actualizada
- `prompts/fix-numa-hr-openwebui-business-response.md`
- `prompts/fix-numa-postgres-hr-numeric-aggregates.md`
- `docs/worklogs/2026/07/2026-07-11-numa-openwebui-smoke-y-runtime-modules.md`

## Cambios locales sin guardar
- Existen archivos sin seguimiento preexistentes en el repo local:
  - `.claude-flow/`
  - `packages/adapters/numa-postgres/src/.claude-flow/`
  - varios `prompts/*.md` antiguos
  - `runtime.installation.numa.env.example`
  - `runtime.installation.numa.example.json`
- No se han añadido ni eliminado estos archivos en el cierre.

## Notas adicionales
- Spark:
  - Repo: `/home/jlu/kern`
  - Rama: `main`
  - HEAD: `df32adf`
  - Smoke temporal activo: `127.0.0.1:8787`
  - PID: `3984337`
- No se imprimieron ni guardaron secretos.
- El siguiente trabajo debe ser una rama separada. No mezclar con HR SQL, OpenWebUI renderer ni smoke de panel.

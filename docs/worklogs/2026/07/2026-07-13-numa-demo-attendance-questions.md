# Cierre diario - 2026-07-13

## Responsable
Nombre: Juanlu / Codex

## Proyecto
Proyecto: Kern
Repositorio: `github.com/juanlusoft/kern`
Ruta: `/home/jlu/proyectos/kern core/kern`
Rama: `main`
Rama base: `main`
Ultimo commit: `2da69b3 fix(numa): ignore stale current-worker punches (#122)`
PR o ticket: `#121`, `#122`

## Objetivo del dia
- Preparar para la demo Numa/OpenWebUI las preguntas solicitadas por el cliente sobre prevencion, presencia, fichajes y horas trabajadas.
- Verificar el rango real de datos disponible en la BBDD Numa facilitada.
- Corregir el caso donde "ahora mismo trabajando" podia contar fichajes historicos como presencia actual.

## Trabajo completado
- Fusionado `#121`, que anade nuevas lecturas Numa HR para demo:
  - `presence.current-workers`: cuanta gente hay ahora mismo trabajando, con numero y listado.
  - `punch.day-workers`: trabajadores que tuvieron fichajes en una fecha.
  - `punch.range`: fichajes de un trabajador en un rango.
  - `worktime.summary`: horas trabajadas por trabajador en un rango, con `date_to` inclusivo.
- Fusionado `#122`, que evita que `presence.current-workers` presente fichajes antiguos como presencia actual.
- Desplegada de nuevo la instalacion Docker de demo Numa.
- Probadas las preguntas principales desde OpenWebUI hacia `kern-numa`.
- Confirmado el rango real de datos de la BBDD Numa.
- Confirmado que `infra.md` no existe bajo `/home/jlu/proyectos`.

## Cambios realizados
- Proyecto: `kern`
- Rama final: `main`
- Commits relevantes:
  - `cb9202b feat(numa): add attendance demo reads (#121)`
  - `2da69b3 fix(numa): ignore stale current-worker punches (#122)`
- Archivos principales modificados por los PRs:
  - `packages/adapters/numa-postgres/src/hr.ts`
  - `packages/adapters/numa-postgres/src/index.ts`
  - `packages/adapters/numa-postgres/test/numa-postgres-read-adapter.test.ts`
  - `packages/contracts/src/index.ts`
  - `packages/capabilities/src/numa-capabilities.ts`
  - `packages/orchestration/src/index.ts`
  - `packages/orchestrators/qwen/src/index.ts`
  - `packages/runtime/src/slice.ts`
  - `packages/runtime/test/numa-hr-orchestrator-tools.test.ts`
  - `packages/workflows/src/hr-workflow.ts`
  - `packages/workflows/src/numa-hr-response-renderer.ts`
  - `packages/workflows/test/numa-hr-response-renderer.test.ts`
  - `docs/operations/numa-openwebui-demo-validation.md`
- Motivo:
  - Cubrir las preguntas solicitadas por el cliente para la demo de prevencion/RRHH sin hardcodear trabajadores ni preguntas.

## Estado actual
Terminado

## Validaciones realizadas
- Comando o prueba: `npm run check:boundaries`
- Resultado: PASS
- Comando o prueba: `npm run typecheck`
- Resultado: PASS
- Comando o prueba: `npm test`
- Resultado: PASS, `382 tests`, `379 pass`, `3 skipped`, `0 fail`
- Comando o prueba: `git diff --check`
- Resultado: PASS
- Prueba manual/smoke: OpenWebUI -> `kern-numa` -> Postgres Numa
- Resultado: PASS para:
  - `Cuanta gente hay ahora mismo trabajando?`
  - `El dia 2026-01-07 que trabajadores trabajaron?`
  - `Dime todos los fichajes de todos los trabajadores del dia 7 de enero de 2026`
  - `Dame los fichajes del trabajador BEATRIZ VERA desde 2026-01-01 al 2026-01-07`
  - `Cuantas horas ha trabajado BEATRIZ VERA desde 2026-01-01 al 2026-01-07?`
- Prueba de entorno:
  - `kern-numa`: levantado
  - `openwebui`: healthy
  - `numa-dev-pg`: levantado

## Decisiones tomadas
- La pregunta "cuanta gente hay ahora mismo trabajando" usa una ventana movil reciente configurada en el runtime.
- Motivo: no presentar fichajes antiguos como presencia actual.
- Alternativa descartada: contar cualquier ultimo fichaje de entrada sin limite temporal.
- Consecuencia: con la BBDD de demo, que no tiene fichajes recientes, la respuesta correcta actual es 0 personas trabajando ahora mismo.
- Limitacion conocida: si un trabajador ficha entrada y no ficha salida dentro de la ventana, puede seguir apareciendo como dentro; esto es inherente a datos de fichaje incompletos.

## Problemas conocidos
- La pregunta de trabajadores por dia devuelve muchos registros y puede aparecer truncada.
- Esto no indica perdida de datos; es una proteccion de tamano de respuesta.
- Hay casos de turnos nocturnos donde entrada/salida del mismo dia pueden producir `0 h 00 min` si la salida pertenece al dia siguiente/anterior. Para la demo, usar la pregunta como "quien tuvo fichajes" y no como cierre contable perfecto de turnos nocturnos.
- La BBDD de demo tiene fichajes hasta `2026-07-01 22:06:34`; por tanto, el dia actual `2026-07-13` no tiene presencia real reciente.

## Bloqueos
- Ningun bloqueo tecnico para la demo controlada.
- No existe `infra.md` en `/home/jlu/proyectos`; si se necesita, habra que localizarlo fuera de esa ruta o crearlo.

## Proximo paso exacto
- Antes de la demo del 2026-07-14, abrir OpenWebUI con el usuario demo y ejecutar el checklist visible:
  1. Confirmar que solo aparece `Kern - Numa HR`.
  2. Confirmar que el modelo se selecciona solo.
  3. Ejecutar las preguntas de vacaciones/asuntos propios ya validadas.
  4. Ejecutar las preguntas nuevas de prevencion/fichajes.
  5. Explicar que "ahora mismo" devuelve 0 porque la BBDD de demo no contiene fichajes recientes.

## Como retomar el trabajo
1. Abrir el repo: `cd "/home/jlu/proyectos/kern core/kern"`.
2. Confirmar estado: `git status --short && git log --oneline -5`.
3. Confirmar contenedores: `sudo docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | rg 'kern-numa|openwebui|numa-dev-pg'`.
4. Entrar en OpenWebUI y probar las preguntas de demo.

## Archivos y modulos relevantes
- `docs/operations/numa-openwebui-demo-validation.md`
- `deploy/numa-demo/docker-compose.yml`
- `deploy/numa-demo/runtime.installation.json` (config real local, no versionar secretos)
- `packages/adapters/numa-postgres/src/hr.ts`
- `packages/adapters/numa-postgres/src/index.ts`
- `packages/orchestrators/qwen/src/index.ts`
- `packages/workflows/src/numa-hr-response-renderer.ts`

## Documentacion actualizada
- `docs/operations/numa-openwebui-demo-validation.md`
- Este cierre diario:
  - `docs/worklogs/2026/07/2026-07-13-numa-demo-attendance-questions.md`

## Cambios locales sin guardar
- Al iniciar el cierre: ninguno.
- Tras este cierre: solo este worklog hasta que se haga commit.

## Notas adicionales
- Rango real confirmado en BBDD:
  - `core_punches`: `2014-01-02 05:44:00` -> `2026-07-01 22:06:34`
  - `ta_requests.arg_date_1`: `2025-02-27` -> `2026-12-28`
  - `ta_requests.utc_stamp`: `2025-03-03 16:25:02` -> `2026-07-01 09:42:34`
- Frases utiles para demo:
  - `Dias de vacaciones de BEATRIZ VERA en 2025`
  - `Que fechas estuvo de vacaciones ALVARO GARCIA en 2025`
  - `Cuantos dias de asuntos propios tuvo AMADOR MOLINA OCANA en 2025`
  - `El dia 7 de enero de 2026 que trabajadores trabajaron?`
  - `Dame los fichajes de BEATRIZ VERA desde 2026-01-01 al 2026-01-07`
  - `Cuantas horas ha trabajado BEATRIZ VERA desde 2026-01-01 al 2026-01-07?`

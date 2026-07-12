# Cierre diario — 2026-07-12

## Responsable
Nombre: JLu / Codex

## Proyecto
Proyecto: Kern
Repositorio: `github.com/juanlusoft/kern`
Ruta: `/home/jlu/proyectos/kern core/kern`
Rama: `main`
Rama base: `main`
Ultimo commit: `f063a9d harden(numa): package OpenWebUI install`
PR o ticket: `#120`

## Objetivo del dia
- Dejar la demo Numa/OpenWebUI/Kern estable, segura para demo controlada y documentada.
- Empaquetar la instalacion OpenWebUI custom para Kern.
- Cerrar hardening pendiente antes de la demo.
- Confirmar que el modelo `kern-numa` queda seleccionado automaticamente.

## Trabajo completado
- PR `#120` fusionado con squash merge.
- OpenWebUI custom empaquetado en `deploy/openwebui-kern`.
- Red Docker por empresa documentada/configurada para Numa: `kern_numa_internal`.
- Backup/restore por empresa documentado.
- Demo viva validada:
  - `openwebui` healthy.
  - `kern-numa` activo.
  - `https://kern.jlu.app` operativo previamente.
  - usuario demo ve solo `Kern · Numa HR`.
  - modelo `kern-numa` auto-seleccionado tras corregir config de OpenWebUI.
- Corregida config viva de OpenWebUI:
  - `ui.default_models` estaba como array JSON `["kern-numa"]`.
  - valor corregido a string JSON `"kern-numa"`, que es lo que espera OpenWebUI 0.10.2.
- Parches OpenWebUI reforzados:
  - bootstrap de modelo por `sessionStorage`.
  - redireccion interna con `?models=kern-numa`.
  - parche del bundle de Chat para forzar `kern-numa` cuando esta disponible.
- Eliminado codigo muerto:
  - `getPgPresenceQueryCatalog`.
  - `PgPresenceQueryCatalogEntry`.
  - `normalizeHrDateString`.
- Validacion temprana de Numa:
  - si `numa-postgres-read` esta activo, se exige `company_id_by_organization_id` para la organizacion instalada.
- Eliminado seed automatico `org-acme` del mock external read adapter.
- Preparado guion de demo funcional y tecnico.

## Cambios realizados
- Proyecto: Kern
- Rama de trabajo: `harden/numa-clean-dead-code-defaults`
- Merge final: `main`
- Commit resultante: `f063a9d`
- PR: `#120`

Archivos principales:
- `deploy/openwebui-kern/Dockerfile`
- `deploy/openwebui-kern/docker-compose.example.yml`
- `deploy/openwebui-kern/env.example`
- `deploy/openwebui-kern/README.md`
- `deploy/openwebui-kern/branding/apply-kern-runtime-patches.py`
- `deploy/openwebui-kern/branding/custom.css`
- `deploy/openwebui-kern/branding/start-kern.sh`
- `deploy/openwebui-kern/branding/validate-env.sh`
- `deploy/numa-demo/docker-compose.yml`
- `deploy/numa-demo/runtime.installation.example.json`
- `docs/operations/company-backup-restore.md`
- `docs/operations/numa-demo-docker-installation.md`
- `packages/adapters/numa-postgres/src/index.ts`
- `packages/adapters/numa-postgres/test/numa-postgres-read-adapter.test.ts`
- `packages/external-read-adapters/src/index.ts`
- `packages/runtime/src/config.ts`
- `packages/runtime/test/installation-config.test.ts`
- `packages/runtime/test/numa-postgres-runtime.test.ts`

## Estado actual
Terminado para demo.

No se recomienda tocar mas codigo antes de la demo salvo bug bloqueante.

## Validaciones realizadas
- Comando o prueba: `npm run check:boundaries`
- Resultado: PASS

- Comando o prueba: `npm run typecheck`
- Resultado: PASS

- Comando o prueba: `npm test`
- Resultado: PASS, 373 pass / 3 skipped / 0 fail

- Comando o prueba: `git diff --check`
- Resultado: PASS

- Comando o prueba: `sudo docker build -t kern-openwebui:0.10.2-kern.1-test deploy/openwebui-kern`
- Resultado: PASS antes de fusionar `#120`; imagen de test eliminada despues.

- Comando o prueba: `curl -fsS http://127.0.0.1:3001/health`
- Resultado: PASS, `{"status":true}`

- Comando o prueba: `sudo docker ps`
- Resultado:
  - `openwebui`: healthy.
  - `kern-numa`: up.
  - `numa-dev-pg`: up.
  - `vllm-qwen3vl`: up.

- Prueba manual: entrada en OpenWebUI con usuario demo.
- Resultado: PASS.

- Prueba manual: modelo `kern-numa` auto-seleccionado.
- Resultado: PASS.

- Prueba manual: preguntas Numa HR con trabajadores reales.
- Resultado: PASS en las preguntas probadas durante la jornada.

## Decisiones tomadas
- No tocar mas codigo antes de la demo salvo bug bloqueante.
- Mantener OpenWebUI como imagen Docker custom de Kern, no como parche manual suelto.
- Separar empresas por instalacion/configuracion/red Docker/datos, no por un unico estado compartido.
- Backups por empresa individual, incluyendo OpenWebUI, runtime, evidencia, memoria, logs, compose/proxy y referencias a BBDD externas.
- Mantener `organization_id` como identidad logica Kern y `company_id` como scope fisico Numa/Postgres.
- Mantener `org-acme` restante como fixtures de identidad por ahora; separar el resolver fixture es trabajo post-demo.

## Problemas conocidos
- OpenWebUI 0.10.2 rompe si `ui.default_models` queda persistido como array JSON; debe ser string CSV/JSON string.
- La instalacion viva fue corregida manualmente en SQLite y el paquete queda reforzado para instalaciones limpias.
- Los parches de OpenWebUI dependen de anclas del build upstream; el build falla si no encuentra anclas criticas.
- Queda trabajo post-demo para convertir el backup/restore en scripts ejecutables con retencion y restore probado.

## Bloqueos
- Ninguno bloqueante para la demo.

## Proximo paso exacto
- Ejecutar la demo con el guion preparado y no modificar codigo salvo bug bloqueante.
- Despues de la demo, decidir prioridades:
  1. instalacion productiva repetible;
  2. scripts reales de backup/restore por empresa;
  3. limpieza de fixtures `org-acme` de identidad;
  4. reportes de feedback bueno/malo;
  5. alta multiempresa Numa/MiPC/Pacoprint/Proinsur.

## Como retomar el trabajo
1. Abrir `/home/jlu/proyectos/kern core/kern`.
2. Confirmar `git branch --show-current` = `main`.
3. Confirmar `git log --oneline -3` incluye `f063a9d`.
4. Comprobar `curl -fsS http://127.0.0.1:3001/health`.
5. Entrar en `https://kern.jlu.app` con usuario demo y validar que `Kern · Numa HR` sale seleccionado.
6. Usar el guion de demo preparado en la conversacion.

## Archivos y modulos relevantes
- `deploy/openwebui-kern/`
- `deploy/numa-demo/`
- `docs/operations/company-backup-restore.md`
- `docs/operations/numa-demo-docker-installation.md`
- `packages/runtime/src/config.ts`
- `packages/adapters/numa-postgres/src/index.ts`
- `/opt/openwebui/branding/apply-kern-runtime-patches.py` en la instalacion viva.
- `/opt/openwebui/data/webui.db` en la instalacion viva.

## Documentacion actualizada
- `docs/operations/company-backup-restore.md`
- `docs/operations/numa-demo-docker-installation.md`
- `deploy/openwebui-kern/README.md`
- Este cierre diario.

## Cambios locales sin guardar
- Al crear este cierre diario, queda pendiente commitear este archivo de worklog.

## Notas adicionales
- No se han guardado secretos en Git.
- La configuracion viva de OpenWebUI fue respaldada antes de cambiar `ui.default_models`.
- La demo esta lista; el siguiente trabajo tecnico debe esperar a despues de la demo salvo incidencia.

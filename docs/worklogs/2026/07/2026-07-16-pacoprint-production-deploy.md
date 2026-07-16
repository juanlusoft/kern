# Cierre operativo — 2026-07-16

## Responsable
Nombre: Codex

## Proyecto
Proyecto: Kern / PacoPrint
Repositorio: github.com/juanlusoft/kern
Ruta local: `/home/jlu/proyectos/kern core/kern`
Rama: `main`
Rama base: `main`
Ultimo commit desplegado: `f204bd2 fix(pacoprint): render web pricing measure rejections (#135)`
PR o ticket: `#134`, `#135`

## Objetivo
- Guardar y desplegar en produccion PacoPrint los fixes de pricing:
- No enviar atributos no pedidos como velcro o diseno.
- Mostrar al usuario que la web rechaza una medida cuando el bloqueo viene de la API/web de precios.

## Trabajo completado
- Produccion PacoPrint actualizada desde `main`.
- Imagen Docker `kern-runtime:pacoprint-agents` reconstruida en la Spark de PacoPrint.
- Contenedores recreados:
  - `kern-pacoprint-gema-administracion`
  - `kern-pacoprint-juan-lopez`
- Se preservaron configs reales, secretos y volumenes de datos/evidencia/memoria/logs.
- No se tocaron Numa, MiPC ni otros agentes v1.

## Cambios realizados
- Codigo desplegado en Spark PacoPrint:
  - `/opt/kern-pacoprint-agents/source`
- Compose:
  - `/opt/kern-pacoprint-agents/source/deploy/pacoprint-agents/docker-compose.yml`
- Backup previo:
  - `/opt/kern-pacoprint-agents/backups/pacoprint-agents-config-20260716-161805.tgz`
- Imagen desplegada:
  - `kern-runtime:pacoprint-agents`
  - image id: `sha256:14fa69d958d3d9611924812c2135095bf55d2c52df3873efc9f4ca6b81eee02b`

## Estado actual
Terminado.

## Validaciones realizadas
- `npm run check:boundaries`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS, `408 pass / 3 skipped`
- `git diff --check`: PASS
- `docker compose config --quiet` en Spark PacoPrint: PASS
- `docker compose up -d --build` en Spark PacoPrint: PASS
- Logs filtrados de ambos contenedores: `ready`, sin `409`, sin `conflict`, sin `error`.

## Smoke produccion
- Smoke simulado dentro de la imagen de produccion, sin llamar a Telegram real.
- Caso lona sin velcro ni diseno:
  - Respuesta: `54,56 € (neto 45,09 € + IVA 21%)`
  - Atributos enviados: `{ "1": 1, "3": 30, "4": 17, "8": 117 }`
  - Sin velcro.
  - Sin diseno.
- Caso Dibond 70x50 rechazado por la web:
  - Respuesta: `La web rechaza la medida: alto por debajo del mínimo permitido.`
  - No se expone `PacoPrint` como nombre interno del adapter.

## Decisiones tomadas
- Se desplego sobre los contenedores Core ya existentes para PacoPrint.
- No se arrancaron agentes v1 de Gema/Juan para evitar doble consumidor de Telegram.
- Se preservaron configs reales mediante exclusiones de `rsync`.
- El smoke de Telegram se hizo con transporte en memoria para no enviar mensajes reales al cliente.

## Problemas conocidos
- El runtime de Telegram no tiene healthcheck Docker especifico; `docker compose ps` solo valida que el proceso este vivo.
- El rollback v1 historico no esta completamente documentado como comando reproducible.
- Los precios deben seguir viniendo de la API/web. Si el payload de Kern es correcto y la web devuelve un precio incorrecto, el fallo debe escalarse a la web/catalogo.

## Bloqueos
- Ninguno para el despliegue actual.

## Proximo paso exacto
- Pedir a Juan/Gema que prueben por Telegram:
  1. Lona sin velcro.
  2. Lona con velcro explicito.
  3. Dibond 70x50.
  4. Ultimo presupuesto de Grupo M&T.
  5. Facturas pendientes de Grupo M&T.
- Revisar logs si reportan respuesta incorrecta:
  `ssh pacoprint 'docker logs --tail=200 kern-pacoprint-juan-lopez'`

## Como retomar el trabajo
1. Entrar por `ssh pacoprint`.
2. Ir a `/opt/kern-pacoprint-agents/source/deploy/pacoprint-agents`.
3. Revisar estado con `docker compose ps`.
4. Revisar logs filtrando errores o conflictos.
5. Si hay que revertir v2, usar `docker compose down` y restaurar backup/config segun el caso.

## Archivos y modulos relevantes
- `packages/workflows/src/pricing-line.ts`
- `packages/channels/telegram/src/index.ts`
- `deploy/pacoprint-agents/docker-compose.yml`
- `deploy/pacoprint-agents/juan-lopez/runtime.installation.example.json`
- `deploy/pacoprint-agents/gema-administracion/runtime.installation.example.json`

## Documentacion actualizada
- `docs/worklogs/2026/07/2026-07-16-pacoprint-production-deploy.md`

## Cambios locales sin guardar
- Este worklog queda pendiente de commit si se decide versionarlo.

## Notas adicionales
- No se han guardado secretos en este documento.
- No se han impreso tokens durante el despliegue.

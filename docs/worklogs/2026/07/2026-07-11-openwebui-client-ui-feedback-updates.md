# Cierre diario — 2026-07-11

## Responsable
Nombre: Sol / ChatGPT CTO

## Proyecto
Proyecto: Kern / OpenWebUI Spark
Repositorio: `https://github.com/juanlusoft/kern.git`
Ruta: `/home/jlu/proyectos/kern core/kern`
Rama: `main`
Rama base: `main`
Último commit: `34148a7`
PR o ticket: ninguno; cambios operativos en `/opt/openwebui`

## Objetivo del día
- Ajustar OpenWebUI para una demo/uso cliente de Kern:
  - mostrar solo copiar, respuesta buena y respuesta mala en respuestas del agente;
  - registrar votos positivos/negativos para seguimiento interno;
  - ocultar avisos de actualización al cliente;
  - mantener un reporte interno de feedback y updates.

## Trabajo completado
- Se confirmó la captura del panel OpenWebUI y los botones no deseados.
- Se creó y aplicó `custom.css` persistente para OpenWebUI.
- Se ocultaron acciones de editar, leer en voz/audio y regenerar.
- Se verificó que el botón de regenerar ya no aparece tras `Ctrl+F5`.
- Se comprobó que OpenWebUI registra votos en SQLite.
- Se verificaron 2 votos para `kern-numa`:
  - 1 positivo.
  - 1 negativo.
- Se desactivó el chequeo de actualización visible al cliente con `ENABLE_VERSION_UPDATE_CHECK=false`.
- Se añadió script interno de comprobación de update.
- Se añadió script de reporte diario de operaciones.
- Se documentó el runbook en `docs/operations/openwebui-kern-client-ui-and-ops.md`.

## Cambios realizados
- Proyecto: OpenWebUI Spark
- Ruta operativa: `/opt/openwebui`
- Archivos principales:
  - `/opt/openwebui/branding/custom.css`
  - `/opt/openwebui/branding/start-kern.sh`
  - `/opt/openwebui/docker-compose.yml`
  - `/opt/openwebui/check-openwebui-update.sh`
  - `/opt/openwebui/kern-daily-ops-report.sh`
  - `/opt/openwebui/reports/2026-07-11-openwebui-kern-report.txt`
- Backups:
  - `/opt/openwebui/docker-compose.yml.bak-disable-update-notices-20260711-185908`
  - `/opt/openwebui/branding/start-kern.sh.bak-ui-actions-20260711-183844`
- Documentación versionada:
  - `docs/operations/openwebui-kern-client-ui-and-ops.md`
  - `docs/worklogs/2026/07/2026-07-11-openwebui-client-ui-feedback-updates.md`

## Estado actual
Terminado para la personalización operativa de OpenWebUI en la Spark actual.

## Validaciones realizadas
- Comando o prueba: `curl -fsS http://127.0.0.1:3001/static/custom.css`
- Resultado: PASS, CSS servido y contiene selector `regenerate-response-button`.

- Comando o prueba: hard refresh `Ctrl+F5` en OpenWebUI.
- Resultado: PASS confirmado por usuario; el botón regenerar ya no aparece.

- Comando o prueba: consulta SQLite solo sobre `feedback` sin leer `snapshot` ni mensajes.
- Resultado: PASS, `kern-numa` tiene 1 voto positivo y 1 negativo el `2026-07-11`.

- Comando o prueba: `cd /opt/openwebui && sudo docker compose up -d`
- Resultado: PASS, contenedor `openwebui` recreado y arrancado.

- Comando o prueba: `sudo docker exec openwebui sh -lc 'env | grep "^ENABLE_VERSION_UPDATE_CHECK="'`
- Resultado: PASS, `ENABLE_VERSION_UPDATE_CHECK=false`.

- Comando o prueba: Python dentro del contenedor lee `ENABLE_VERSION_UPDATE_CHECK`.
- Resultado: PASS, `False`.

- Comando o prueba: `curl -fsS -o /tmp/openwebui-index.html -w 'http=%{http_code}\n' http://127.0.0.1:3001/`
- Resultado: PASS, `http=200`.

- Comando o prueba: `sudo /opt/openwebui/check-openwebui-update.sh openwebui`
- Resultado: PASS, `status=up-to-date`.

- Comando o prueba: `sudo /opt/openwebui/kern-daily-ops-report.sh 2026-07-11`
- Resultado: PASS, genera `/opt/openwebui/reports/2026-07-11-openwebui-kern-report.txt`.

## Decisiones tomadas
- Se decidió ocultar acciones por CSS persistente en OpenWebUI porque la petición es visual/operativa y no requiere fork inmediato.
- Se descartó una regla CSS demasiado agresiva por posición y se dejó una regla específica para `OpenWebUI 0.10.2`:
  - `.buttons > button.regenerate-response-button`
  - `.buttons > button.regenerate-response-button + span[role="button"]`
- Se decidió que el feedback bueno/malo es para seguimiento interno de calidad, no para entrenamiento automático del modelo.
- Se decidió no leer contenido de mensajes ni `snapshot` al generar reportes.
- Se decidió desactivar `ENABLE_VERSION_UPDATE_CHECK` para que el cliente no reciba avisos de upstream.
- Se decidió mantener awareness interno mediante `/opt/openwebui/check-openwebui-update.sh`.

## Problemas conocidos
- La personalización CSS depende del DOM/clases de OpenWebUI `0.10.2`.
- Después de actualizar OpenWebUI hay que verificar de nuevo:
  - botones visibles;
  - registro de feedback;
  - modelo `kern-numa`;
  - reenvío de `X-OpenWebUI-User-Id`;
  - ocultación de avisos de update.
- `ENABLE_VERSION_UPDATE_CHECK=false` impide el aviso en el panel; por tanto la comprobación interna debe ejecutarse como operación.

## Bloqueos
- Ninguno para el estado actual.

## Próximo paso exacto
- Probar desde el panel OpenWebUI con un usuario cliente no admin:
  1. Abrir `http://192.168.1.21:3001`.
  2. Seleccionar `kern-numa`.
  3. Verificar que en las respuestas solo aparecen copiar, pulgar arriba y pulgar abajo.
  4. Emitir un voto.
  5. Ejecutar `sudo /opt/openwebui/kern-daily-ops-report.sh` y confirmar que aumenta el contador.

## Cómo retomar el trabajo
1. Abrir `/home/jlu/proyectos/kern core/kern`.
2. Leer `docs/operations/openwebui-kern-client-ui-and-ops.md`.
3. Revisar estado operativo:

```bash
cd /opt/openwebui
sudo docker compose ps
sudo /opt/openwebui/kern-daily-ops-report.sh
```

## Archivos y módulos relevantes
- `/opt/openwebui/docker-compose.yml`
- `/opt/openwebui/branding/custom.css`
- `/opt/openwebui/branding/start-kern.sh`
- `/opt/openwebui/check-openwebui-update.sh`
- `/opt/openwebui/kern-daily-ops-report.sh`
- `/opt/openwebui/data/webui.db`
- `/opt/openwebui/reports/`
- `docs/operations/openwebui-kern-client-ui-and-ops.md`

## Documentación actualizada
- `docs/operations/openwebui-kern-client-ui-and-ops.md`
- `docs/worklogs/2026/07/2026-07-11-openwebui-client-ui-feedback-updates.md`

## Cambios locales sin guardar
- Pendiente de revisar con `git status --short` tras crear esta documentación.

## Notas adicionales
- No se tocaron:
  - Pacoprint.
  - Telegram.
  - Holded.
  - HR/Postgres SQL.
  - Kern runtime.
  - Frontend de Kern.
- No se guardaron secretos en documentación.

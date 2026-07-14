# Cierre diario - 2026-07-14

## Responsable
Nombre: Codex

## Proyecto
Proyecto: Kern - PacoPrint
Repositorio: github.com/juanlusoft/kern
Ruta: `/home/jlu/proyectos/kern core/kern`
Rama: `docs/pacoprint-deploy-permissions`
Rama base: `main`
Ultimo commit:
- Rama actual: `6f731a0 docs(pacoprint): document deploy folder permissions`
- `main`: `8dc7d74 fix(pacoprint): stabilize telegram runtime and pricing reads (#124)`
PR o ticket:
- PR #124: fusionado
- PR #125: abierto, mergeable

## Objetivo del dia
- Estabilizar la instalacion Kern Core para PacoPrint en la Spark de PacoPrint.
- Sustituir el uso operativo de Kern v1 por contenedores Kern Core persistentes.
- Corregir el bucle de Telegram y validar rutas de pricing/Holded.
- Documentar permisos de carpetas persistentes para evitar errores de escritura en despliegue.

## Trabajo completado
- PR #124 fusionado en `main` con el runner persistente de Telegram y fixes de pricing/Holded.
- Despliegue realizado en la Spark de PacoPrint.
- Contenedores Kern Core levantados:
  - `kern-pacoprint-gema-administracion`
  - `kern-pacoprint-juan-lopez`
- Contenedores v1 detenidos/no usados:
  - `agente-ai-gema-administracion`
  - `agente-ai-juan-lopez`
- Loop de Telegram corregido: el proceso ya no se relanza en bucle perdiendo offset.
- Smoke real de Telegram ejecutado con rutas de pricing y Holded.
- Notificacion enviada por Telegram al finalizar la correccion operativa.
- PR #125 abierto para documentar permisos de carpetas persistentes.

## Cambios realizados
- Proyecto: Kern
- Rama de implementacion ya fusionada: `fix/pacoprint-telegram-runtime-and-pricing`
- PR fusionado: #124
- Cambio: runner persistente para instalaciones Telegram y estabilizacion de lecturas PacoPrint.
- Archivos principales afectados por #124:
  - `deploy/pacoprint-agents/`
  - `packages/runtime/src/run-telegram-installation.ts`
  - `packages/orchestration/src/holded-read.ts`
  - `packages/workflows/src/pricing-line.ts`
  - `packages/workflows/src/pricing-parse.ts`
- Rama actual: `docs/pacoprint-deploy-permissions`
- PR abierto: #125
- Cambio: documentar que las carpetas persistentes montadas en Docker deben ser escribibles por UID/GID `1000:1000`.
- Archivo modificado en #125:
  - `deploy/pacoprint-agents/README.md`

## Estado actual
En revision.

El runtime PacoPrint esta desplegado y operativo, pero queda pendiente fusionar el PR #125 de documentacion. Queda tambien pendiente validacion real adicional por PacoPrint y revisar el caso de Carton Pluma.

## Validaciones realizadas
- Comando o prueba: `npm run check:boundaries`
- Resultado: PASS en PR #124 pre/post merge.
- Comando o prueba: `npm run typecheck`
- Resultado: PASS en PR #124 pre/post merge.
- Comando o prueba: `npm test`
- Resultado: PASS antes de fusionar PR #124.
- Comando o prueba: `git diff --check`
- Resultado: PASS en PR #124 y en PR #125 antes de abrirlo.
- Prueba manual: Telegram con contenedores `kern-pacoprint-gema-administracion` y `kern-pacoprint-juan-lopez`.
- Resultado: PASS operativo; el bucle de respuestas quedo corregido.
- Prueba manual: presupuesto Holded `P26/04685`.
- Resultado: PASS; lectura directa de documento.
- Prueba manual: pricing de lona con aclaracion corta `Corte escuadrado`.
- Resultado: PASS; conserva contexto reciente y completa el precio.
- Prueba manual: Carton Pluma `120x50`, `diseno diferente: 3`, `10mm`.
- Resultado: el fallo original de diseno/10mm no se reproduce; ahora la API devuelve `PacoPrint alto below minimum`.

## Decisiones tomadas
- Se mantiene un bot independiente por agente, como se definio al inicio del proyecto PacoPrint.
- Durante la validacion, Gema y Juan pueden tener acceso a pricing y Holded; la separacion fina por rol se hara despues de que lo prueben.
- Se usa Kern Core para la nueva instalacion; Kern v1 queda detenido y no debe arrancarse para esta linea.
- El runtime persistente se ejecuta como usuario `node`; por eso las carpetas bind-mounted se corrigen con propiedad `1000:1000` en vez de ejecutar el contenedor como root.

## Problemas conocidos
- Carton Pluma con medidas `120x50` llega ahora a la API, pero la API responde `PacoPrint alto below minimum`.
- Pendiente determinar si ese bloqueo es una regla real del catalogo o un problema de orientacion ancho/alto.
- PR #125 esta abierto y pendiente de merge.
- `rsync --delete` puede recrear carpetas persistentes con propietario incorrecto si no se aplica el paso documentado de `chown`.

## Bloqueos
- No hay bloqueo critico para que PacoPrint siga probando.
- Pendiente informacion funcional sobre la regla real de minimo de Carton Pluma.

## Proximo paso exacto
- Fusionar PR #125 si la documentacion de permisos queda aprobada.
- Pedir a Juan que repita las pruebas reales desde Telegram con los productos de las capturas.
- Para Carton Pluma, probar `120x50` y `50x120`, revisar las reglas de minimo de la API PacoPrint y decidir si hay bug de orientacion o solo restriccion real de catalogo.
- Mantener Numa separado: la demo Numa se retoma como linea independiente.

## Como retomar el trabajo
1. Entrar en `/home/jlu/proyectos/kern core/kern`.
2. Ejecutar `git checkout main && git pull --ff-only origin main`.
3. Revisar PR #125 con `gh pr view 125`.
4. Si se aprueba, fusionar PR #125 y volver a `main`.
5. Conectarse a la Spark de PacoPrint usando la informacion de infraestructura disponible localmente, sin imprimir secretos.
6. Revisar logs de `kern-pacoprint-gema-administracion` y `kern-pacoprint-juan-lopez`.
7. Ejecutar las pruebas reales pendientes de Telegram/PacoPrint.

## Archivos y modulos relevantes
- `deploy/pacoprint-agents/README.md`
- `deploy/pacoprint-agents/docker-compose.yml`
- `packages/runtime/src/run-telegram-installation.ts`
- `packages/orchestration/src/holded-read.ts`
- `packages/workflows/src/pricing-line.ts`
- `packages/workflows/src/pricing-parse.ts`
- `docs/worklogs/2026/07/2026-07-14-pacoprint-kern-core-deploy.md`

## Documentacion actualizada
- `deploy/pacoprint-agents/README.md` en PR #125.
- Este cierre diario.

## Cambios locales sin guardar
- Ninguno antes de crear este cierre.

## Notas adicionales
- No se han guardado secretos en Git.
- No se ha mezclado Numa con PacoPrint en esta jornada.
- La instalacion Numa y su demo quedan como trabajo separado.

# M13 - Client boundary check and debt inventory

- **Estado:** Draft implementation note
- **Fecha:** 2026-07-20
- **Base:** ADR-0002, ADR-0004, ADR-0006 seccion 7, boundary checker existente

## 1. Que introduce M13

M13 implementa el primer invariante verificable de la tabla de ADR-0006 seccion 7:

`Core no menciona empresas -> busqueda estatica de nombres de cliente en paquetes core/gobernados, con allowlist explicita.`

No mueve codigo, no crea modulos de empresa y no refactoriza nada. Solo instala el
mecanismo que impide que la mezcla siga creciendo mientras dura la migracion.

Piezas:

- `scripts/check-client-boundaries.mjs`: el escaner y el evaluador.
- `scripts/client-boundary-allowlist.json`: la deuda registrada, con motivo, destino,
  responsable y fecha.
- `packages/compliance-tests/test/m13-client-boundary.test.ts`: los tests de cumplimiento.
- `npm run check:client-boundaries`, encadenado en `npm test`.

## 2. La regla

Un paquete comun de Kern no puede nombrar una empresa concreta.

Se consideran comunes todos los paquetes bajo `packages/` salvo dos excepciones:

- un paquete cuya propia ruta declara una empresa puede nombrar **solo** a esa empresa
  (`packages/adapters/pacoprint-catalog`, `packages/adapters/numa-postgres` y el futuro
  `packages/customer-modules/<empresa>`);
- `packages/compliance-tests`, que verifica comportamiento de todas las instalaciones
  (ADR-0006 seccion 7 contempla explicitamente la allowlist de tests).

Un modulo de empresa que nombra a otra empresa **si** es violacion: `numa-postgres` no
puede hablar de PacoPrint.

Alcance del escaneo: ficheros de codigo bajo `packages/**/src/**`. Los tests quedan fuera
porque ADR-0006 seccion 2.3 incluye los tests de comportamiento dentro del modulo de empresa.

Deteccion: se busca el nombre del cliente como unidad lexica, en las grafias reales que
aparecen en codigo (`numa`, `Numa`, `NUMA`, `pacoprint`, `PacoPrint`, `pacoPrint`,
`PACOPRINT`). Eso cubre identificadores, rutas de import, claves de configuracion, nombres
de secreto, ids de organizacion, prompts embebidos y comentarios. No cubre subcadenas
dentro de otra palabra (`pneuma`, `numeral`, `numatic` no son violaciones): se prioriza la
precision, porque un check con falsos positivos acaba desactivado.

Limitacion conocida y aceptada: la regla detecta **nombres**, no semantica. Un mapeo
especifico de un cliente que no menciona su nombre (por ejemplo `time_type_by_label`) no
se detecta. Esa clase de mezcla se cubre con revision y con los demas invariantes de la
tabla de ADR-0006 seccion 7.

## 3. Relacion con `check-boundaries.mjs`

Son dos invariantes distintos y se mantienen separados a proposito:

| | `check-boundaries.mjs` | `check-client-boundaries.mjs` |
| --- | --- | --- |
| Verifica | grafo de imports | menciones de cliente |
| Invariante ADR-0006 | "Core no importa modulos de empresa" | "Core no menciona empresas" |
| Paquete `runtime` | exento por diseno (es el punto de composicion) | **no exento** |
| Excepciones | ninguna: debe estar en cero | allowlist con fecha y responsable |

La exencion de `runtime` en el checker de imports es justamente lo que deja fuera de
control a `packages/runtime/src/slice.ts`, que hoy es el mayor foco de mezcla. El check de
menciones si lo contabiliza (72 ocurrencias registradas).

## 4. Allowlist decreciente

La allowlist no es una lista de perdones abierta. El evaluador rompe el build cuando:

- `new_violation`: un fichero comun no registrado menciona a un cliente;
- `grown_violation`: un fichero registrado supera sus `allowed_occurrences`;
- `client_mismatch`: los clientes reales de un fichero no coinciden exactamente con
  `entry.clients` (impide sustituir deuda Numa por deuda PacoPrint conservando el total);
- `shrunk_violation`: un fichero tiene menos ocurrencias que las declaradas y obliga a
  reducir su entrada y el presupuesto en el mismo cambio;
- `stale_entry`: un fichero registrado ya esta limpio (hay que borrar la entrada);
- `missing_file`: la entrada apunta a un fichero inexistente;
- `budget_exceeded`: `budget.max_entries` no coincide con el numero de entradas, o las
  ocurrencias declaradas no coinciden con `budget.max_occurrences`;
- `allowlist_growth`: una ruta, un cliente, un techo por fichero o el presupuesto crecen
  respecto a la allowlist del commit anterior.

El checker compara cambios sin commit contra `HEAD` y commits limpios contra `HEAD^`. El
commit que introduce M13 establece el inventario inicial; desde el siguiente commit, las
rutas, clientes y techos solo pueden mantenerse o decrecer. La igualdad estricta de ambos
presupuestos con la allowlist hace que una limpieza parcial tambien tenga que consolidarse.

Estado al abrir el mecanismo: **21 ficheros / 477 menciones**.

## 5. Inventario de deuda por tipo

### 5.1 Contratos de dominio de cliente (`domain-contract`) - 147 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/contracts/src/index.ts` | 109 | ~40 interfaces `NumaHr*`, tipos `PacoPrintCatalog*`, `PacoPrintQuoteLineInput` y la clave `numa.hr.read` dentro de la union cerrada de workflows gobernados | Contratos de dominio dentro de cada modulo de empresa; `contracts` conserva solo puertos y tipos comunes (seccion 3.7) |
| `packages/core/src/hr.ts` | 33 | `CoreNumaHrReadPort` y reexposicion de los tipos de RRHH Numa dentro de Core | `customer-modules/numa-hr`, o un puerto `hr-read` sin marca si aparece un segundo caso real (seccion 2.1) |
| `packages/workflows/src/workflow-runtime-context.ts` | 5 | El contexto de ejecucion comun tipa puertos con nombre de cliente | Contexto generico + extension tipada aportada por el modulo |

`packages/contracts` es la deuda mas delicada: es la raiz de la que depende todo el
sistema, asi que debe migrarse la ultima y por partes.

### 5.2 Workflows de dominio (`domain-workflow`) - 62 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/workflows/src/pricing-workflow.ts` | 18 | Workflow de pricing sobre el puerto de catalogo PacoPrint | `customer-modules/pacoprint-pricing` |
| `packages/workflows/src/runtime.ts` | 17 | El runtime comun recibe puertos de cliente y enruta `numa.hr.read` | Registro de contribuciones del modulo activo (seccion 3.4) |
| `packages/workflows/src/hr-workflow.ts` | 10 | Workflow gobernado de lectura de RRHH Numa | `customer-modules/numa-hr` |
| `packages/workflows/src/numa-hr-response-renderer.ts` | 7 | Renderizado de respuestas de RRHH Numa (excepcion nombrada en seccion 3.2) | `customer-modules/numa-hr` |
| `packages/workflows/src/pricing-line.ts` | 5 | Linea de presupuesto acoplada a candidatos de catalogo PacoPrint | `customer-modules/pacoprint-pricing` |
| `packages/workflows/src/pricing-draft-workflow.ts` | 3 | Borrador multi-linea PacoPrint: proposito y mensajes | `customer-modules/pacoprint-pricing` |
| `packages/workflows/src/pricing-parse.ts` | 2 | Regla de negocio del parser documentada en cabecera | `customer-modules/pacoprint-pricing` |

### 5.3 Capabilities de dominio (`domain-capability`) - 67 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/capabilities/src/numa-capabilities.ts` | 58 | Las 9 capabilities de RRHH Numa (excepcion nombrada en seccion 3.2) | `customer-modules/numa-hr` |
| `packages/workflows/src/mock-capabilities.ts` | 8 | Capabilities de prueba de pricing PacoPrint y organizacion por defecto `org-pacoprint` | Fixtures del modulo; los mocks comunes deben usar una organizacion neutra |
| `packages/capabilities/src/index.ts` | 1 | El barrel comun re-exporta `./numa-capabilities` | Desaparece al migrar el fichero anterior |

### 5.4 Mapeos y routing de dominio (`domain-mapping`) - 61 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/orchestration/src/index.ts` | 54 | Validacion de propuestas Numa HR, routing override y transporte de `numaHrConfig` (time types, cupos anuales) | Contribucion registrada por el modulo; la orquestacion comun no debe crecer con ramas por empresa (seccion 3.4) |
| `packages/orchestration/src/numa-hr.ts` | 7 | Mapeo de tools y de etiquetas de tipo de ausencia (excepcion nombrada en seccion 3.2) | `customer-modules/numa-hr` |

### 5.5 Prompt de cliente (`customer-prompt`) - 9 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/orchestrators/qwen/src/index.ts` | 9 | El prompt de sistema compartido mezcla instrucciones y ejemplos de RRHH Numa con reglas de pricing PacoPrint | Fragmentos aportados por el modulo activo; el orquestador solo compone (seccion 3.3) |

### 5.6 Configuracion y bootstrap de instalacion - 127 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/runtime/src/slice.ts` | 72 | El slice comun importa y cablea directamente `numa-postgres` y `pacoprint-catalog` y resuelve la company de Numa | Bootstrap **por instalacion**: es el unico punto que puede conocer modulo e integraciones a la vez, pero no puede ser el runtime comun (secciones 3.4 y 3.7) |
| `packages/runtime/src/config.ts` | 48 | Tipa y valida `runtime_options.numa_hr`, el secreto `PACOPRINT_API_TOKEN` y defaults como `org-pacoprint`, `company-pacoprint`, `telegram-chat-pacoprint` | Bloque de configuracion tipado y validado por cada modulo; Core solo valida el envelope comun (seccion 5) |
| `packages/runtime/src/transports.ts` | 7 | Transporte HTTP nombrado y apuntado al endpoint de PacoPrint | Transporte generico parametrizado + integracion del modulo pacoprint |

### 5.7 Renderizado en canales reutilizables (`channel-rendering`) - 4 menciones

| Fichero | Menciones | Que contiene | Destino ADR-0006 |
| --- | --- | --- | --- |
| `packages/channels/telegram/src/index.ts` | 2 | Etiqueta "Linea de PacoPrint" y parseo de motivos de rechazo con prefijo `PacoPrint alto/ancho` | Renderer del modulo pacoprint-pricing; el canal solo transporta (seccion 3.3) |
| `packages/channels/openwebui/src/index.ts` | 2 | Id de modelo `kern-numa` expuesto y asumido por defecto | Id declarado en el manifest de instalacion (seccion 3.3) |

## 6. Mezcla estructural no detectable por nombre

Detectada durante el inventario, documentada aqui porque el check por menciones no la ve
y porque condiciona el orden de la limpieza. No se corrige en M13.

- El catalogo de tools es un array estatico con las tools de todos los clientes: es el
  registro global que ADR-0006 seccion 3.4 prohibe expresamente.
- El prompt de sistema es compartido entre imprenta y RRHH. Existe un gancho `systemPrompt`
  que `slice.ts` no usa; seria la costura natural para las contribuciones por modulo.
- Las capabilities de RRHH se conceden por existir el puerto, no por declararse. Por eso
  hay ejemplos que funcionan con `active_capabilities: []`, lo que contradice el
  fail-closed de ADR-0002 seccion 2.5.
- `RuntimeModuleKey` esta triplicado (dos veces en `config.ts` y otra en `slice.ts`), asi
  que dar de alta un modulo obliga a tocar tres sitios.

## 7. Orden de limpieza sugerido

Sigue el plan de ADR-0006 seccion 8 y va de menor a mayor acoplamiento:

1. Canales reutilizables (4 menciones): sacar renderizado e id de modelo a config/modulo.
2. Prompt del orquestador (9): usar el gancho `systemPrompt` con fragmentos por modulo.
3. `transports.ts` (7) y `mock-capabilities.ts` (8).
4. Crear `packages/customer-modules/numa-hr` y mover renderer, capabilities, mapeo,
   workflow y puerto de Core (115 menciones en cinco ficheros).
5. Crear `packages/customer-modules/pacoprint-pricing` y mover los workflows de pricing (28).
6. Sustituir el cableado comun por un registro de contribuciones del modulo activo:
   `workflows/runtime.ts` (17), `workflow-runtime-context.ts` (5),
   `orchestration/src/index.ts` (54) y el barrel de capabilities (1). Aqui es donde se
   retiran tambien el catalogo de tools global y la concesion implicita de capabilities
   descritas en la seccion 6.
7. Convertir `slice.ts` en bootstrap por instalacion y `config.ts` en envelope comun +
   bloques por modulo (120).
8. Partir `packages/contracts` el ultimo (109), cuando ya no queden consumidores comunes.

Cada paso baja `budget.max_entries` y `budget.max_occurrences` en el mismo PR.

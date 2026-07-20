# ADR-0006 — Separacion de Core, integraciones reutilizables y modulos especificos de empresa

- **Estado:** Proposed
- **Pendiente:** aceptacion del decisor. El primer invariante de la seccion 7 ya esta implementado y en verde (ver seccion 11); al aceptar, cambiar el estado a `Accepted` y retirar esta linea.
- **Fecha:** 2026-07-14
- **Decisor:** Juan Luis, con ChatGPT como CTO/arquitecto
- **Contexto:** Crecimiento multiempresa de Kern con PacoPrint, Numa, MiPC y futuras empresas
- **Base:** ADR-0002, ADR-0004, ADR-0005, RFC-0002, RFC-0004, RFC-0006, boundary checker actual

## 1. Contexto

Kern esta creciendo desde un Core comun hacia varias lineas de negocio reales:

- PacoPrint: presupuestos, pricing, catalogo, Holded y Telegram.
- Numa / Proinsur: RRHH, fichajes, ausencias, PostgreSQL y OpenWebUI.
- MiPC y futuras empresas: aplicaciones propias, datos propios y canales propios.

ADR-0002 ya fija que los modulos y adaptadores se activan por instalacion.

ADR-0004 ya fija que una rama debe contener un solo concepto y no mezclar clientes.

ADR-0005 ya fija que produccion usa despliegues Docker por instalacion, con contenedor, config, secretos, datos, logs, evidence y backup separados.

Pero falta una decision explicita sobre la frontera entre:

- Core comun de Kern;
- integraciones reutilizables, como Holded, Telegram, OpenWebUI o PostgreSQL;
- logica especifica de una empresa, como presupuestos PacoPrint o RRHH Numa.

La configuracion por instalacion no basta si el runtime comun, los workflows comunes, las capabilities comunes o la orquestacion comun contienen decisiones, prompts, reglas, nombres o mapeos especificos de una empresa.

Tambien seria incorrecto resolver el problema copiando el repositorio completo por empresa. Eso produciria forks divergentes de Core, duplicaria fixes de seguridad y haria mas dificil mantener los invariantes de identidad, evidencia, policy, fail-closed y boundaries.

La decision debe permitir reutilizar integraciones comunes sin convertir la logica de un cliente en plantilla implicita para otro.

## 2. Definiciones

### 2.1 Core

Core es el nucleo comun de Kern.

Incluye conceptos como:

- contratos;
- identidad;
- organizacion y tenancy;
- policy;
- evidence;
- decision binding;
- turn lifecycle;
- runtime gobernado;
- puertos y tipos comunes.

Core no conoce empresas concretas, productos de clientes, nombres de cliente, tablas concretas de un cliente, prompts de cliente ni reglas de negocio particulares.

### 2.2 Integracion reutilizable

Una integracion reutilizable implementa un proveedor, protocolo o transporte sin semantica propia de una empresa.

Ejemplos:

- `holded-read`;
- `telegram-channel`;
- `openwebui-channel`;
- `postgres-read`;
- adaptadores HTTP genericos;
- runners de queries cerradas parametrizadas.

Una integracion puede tener configuracion por instalacion, pero no debe contener reglas nominadas por cliente.

Usar Holded en PacoPrint no convierte Holded en un modulo PacoPrint.

Usar PostgreSQL en Numa no convierte PostgreSQL en un modulo Numa.

### 2.3 Modulo especifico de empresa

Un modulo especifico de empresa contiene comportamiento que no es universal.

Puede contener:

- workflows de negocio;
- capabilities de dominio;
- prompts y catalogos de herramientas;
- mapeos de dominio;
- schemas de configuracion especificos;
- vocabulario de la empresa;
- reglas de negocio;
- renderizado de respuestas de dominio;
- tests de comportamiento del cliente.

Ejemplos conceptuales:

- `pacoprint-pricing`;
- `numa-hr`;
- `mipc-support`;
- `proinsur-hr`.

Un modulo especifico de empresa puede reutilizar integraciones comunes, pero no debe importar otro modulo especifico de empresa.

### 2.4 Instalacion

Una instalacion es una composicion operativa concreta de:

- Core;
- integraciones reutilizables;
- un modulo especifico de empresa;
- configuracion;
- secretos;
- identidad;
- datos;
- storage;
- redes;
- backups.

La instalacion es la unidad de ejecucion y operacion.

El modulo de empresa es la unidad de comportamiento especifico.

El `organization_id` protege datos y autorizacion, pero no sustituye al modulo de empresa.

## 3. Decision

### 3.1 Un Core comun, no forks por empresa

Kern mantiene un unico Core comun.

No se crean forks del repositorio ni copias divergentes de Core por empresa.

Los fixes de seguridad, boundaries, identidad, evidence, runtime y policy deben aplicarse una vez y beneficiar a todas las instalaciones.

### 3.2 Separacion explicita de modulos de empresa

Toda logica especifica de empresa debe vivir en una unidad explicita de modulo de empresa.

La ubicacion final puede evolucionar, pero el objetivo arquitectonico es que exista una frontera clara, por ejemplo:

```text
packages/
  customer-modules/
    pacoprint-pricing/
    numa-hr/
    mipc-support/
```

Mientras la migracion no este completada, cualquier excepcion debe quedar documentada como deuda tecnica con:

- paquete afectado;
- motivo;
- fecha o hito de retirada;
- test que evite regresiones de aislamiento.

Excepciones conocidas al aprobar este ADR:

- `packages/adapters/pacoprint-catalog`: contiene pricing y capability de dominio PacoPrint dentro de un paquete clasificado hoy como adapter/provider. Debe separarse en una integracion reutilizable, si existe, y un modulo de empresa `pacoprint-pricing`.
- `packages/adapters/numa-postgres`: contiene queries y tipos de dominio HR Numa dentro de un adapter PostgreSQL. Debe separarse en una integracion PostgreSQL reutilizable y un modulo de empresa `numa-hr` que aporte queries cerradas, mappings y semantics de RRHH.
- `packages/orchestration/src/numa-hr.ts`, `packages/capabilities/src/numa-capabilities.ts` y `packages/workflows/src/numa-hr-response-renderer.ts`: contienen comportamiento Numa en paquetes gobernados comunes. Deben migrarse al modulo de empresa `numa-hr` o quedar detras de contribuciones explicitas de ese modulo.

Estas excepciones no bloquean el ADR porque su estado es `Proposed`, pero deben ser retiradas durante la migracion a modulos especificos de empresa.

Desde M13 estas excepciones, y todas las demas detectadas al inventariar, estan registradas de forma legible por maquina en `scripts/client-boundary-allowlist.json`, con paquete afectado, motivo, destino, hito de retirada, responsable y fecha, tal y como exige esta seccion. El inventario narrado por tipo esta en `docs/implementation/m13-client-boundary-check.md`.

### 3.3 Integraciones compartidas no contienen negocio de cliente

Las integraciones reutilizables no deben contener reglas, nombres, prompts, mapeos ni semantica de un cliente.

Correcto:

```text
holded-read          -> lee documentos Holded de forma gobernada
telegram-channel     -> transporta mensajes Telegram
openwebui-channel    -> expone endpoint OpenAI-style para OpenWebUI
postgres-read        -> ejecuta queries cerradas parametrizadas
```

Incorrecto:

```text
holded-read          -> sabe como hacer presupuestos PacoPrint
telegram-channel     -> sabe reglas de pricing PacoPrint
postgres-read        -> sabe reglas HR Numa
openwebui-channel    -> sabe prompts Numa
```

Si una empresa necesita comportamiento especifico sobre una integracion comun, ese comportamiento vive en su modulo de empresa.

### 3.4 Composicion por bootstrap de instalacion

La composicion ocurre en un punto de assembly/bootstrap de instalacion.

Ese bootstrap puede conocer simultaneamente:

- Core;
- integraciones reutilizables necesarias;
- modulo especifico de empresa;
- manifest de instalacion.

El runtime comun no debe crecer mediante condicionales como:

```text
if organization_id == "numa"
if customer == "pacoprint"
```

Ni mediante registros globales donde todas las herramientas de todos los clientes esten disponibles por defecto.

El manifest declara explicitamente que modulo de empresa esta activo y que integraciones usa.

### 3.5 Una instalacion productiva compone una empresa

En produccion temprana, una instalacion productiva compone una sola empresa.

Ejemplos:

```text
kern-pacoprint -> modulo pacoprint-pricing
kern-numa      -> modulo numa-hr
kern-mipc      -> modulo mipc-support
```

Cada instalacion tiene su propio:

- `installation_id`;
- `organization_id`;
- identity mappings;
- secretos;
- volumenes;
- evidence ledger;
- memoria conversacional;
- logs;
- red;
- backup;
- restore.

Si en el futuro se admite una instalacion multiempresa dentro de un mismo proceso, debe aprobarse en otro ADR y mantener invariantes equivalentes de aislamiento.

### 3.6 No hay fallback entre empresas

Nunca debe haber fallback de:

- modulo;
- capability;
- workflow;
- prompt;
- secreto;
- adapter;
- identidad;
- organizacion;
- configuracion;
- evidencia;
- datos persistentes.

Si una request llega a una instalacion que no tiene el modulo requerido, debe fallar cerrado con un estado explicito como `denied`, `blocked`, `unavailable`, `unsupported`, `authentication_error` o `config_missing`.

No se debe intentar resolverla con otro modulo de empresa.

### 3.7 Modelo de dependencias

La direccion deseada de dependencias es:

```text
contracts <- core / governed runtime
contracts <- reusable adapters / channels / orchestrators
contracts + reusable integrations <- customer module
core + integrations + customer module <- installation bootstrap
```

Reglas:

- Core no importa modulos de empresa.
- Core no importa adaptadores concretos.
- Un modulo de empresa no importa otro modulo de empresa.
- Una integracion reutilizable no importa modulos de empresa.
- El bootstrap de instalacion es el unico punto que puede conocer el modulo de empresa y sus integraciones concretas al mismo tiempo.

## 4. Relacion con ADR existentes

### 4.1 Relacion con ADR-0002

ADR-0002 define activacion de modulos y adaptadores por instalacion.

ADR-0006 define que algunos modulos son especificos de empresa y no deben confundirse con integraciones reutilizables.

### 4.2 Relacion con ADR-0004

ADR-0004 define aislamiento de trabajo: una rama, un concepto.

ADR-0006 define aislamiento arquitectonico: una empresa no debe contaminar el codigo especifico de otra.

### 4.3 Relacion con ADR-0005

ADR-0005 define aislamiento operativo por contenedor, config, secretos, volumenes, red y backups.

ADR-0006 define aislamiento de comportamiento y composicion.

## 5. Reglas de configuracion

Cada manifest de instalacion debe declarar explicitamente:

- `installation_id`;
- `organization_id`;
- modulo especifico de empresa activo;
- integraciones reutilizables activas;
- capabilities expuestas;
- referencias de secretos;
- paths de datos, evidence, memoria y logs;
- identity mappings;
- red y destinos externos permitidos cuando aplique.

La configuracion de dominio especifico pertenece al modulo de empresa o a un bloque tipado propio.

Ejemplos:

```text
pacoprint:
  pricing_defaults
  catalog_rules
  holded_customer_mapping
```

```text
numa:
  time_type_by_label
  annual_quota_by_time_type
  company_id_by_organization_id
```

Core solo valida el envelope comun y delega la validacion de dominio al modulo correspondiente.

## 6. Despliegue, datos y backup

Se mantiene la decision de ADR-0005:

- misma imagen Kern por digest inmutable;
- contenedor por empresa en produccion temprana;
- carpeta de instalacion por empresa;
- secretos separados;
- redes privadas;
- evidence, memory, data y logs separados;
- backup y restore por empresa.

Un backup debe contener metadata suficiente para impedir restore cruzado accidental:

- `installation_id`;
- `organization_id`;
- modulo de empresa;
- version/digest de imagen;
- schema/config version;
- fecha;
- origen.

Restaurar un backup de Numa sobre PacoPrint o MiPC debe bloquearse.

## 7. Invariantes verificables

Los siguientes invariantes deben convertirse progresivamente en checks automatizados:

| Invariante | Verificacion esperada |
| --- | --- |
| Core no menciona empresas | **Implementado**: `scripts/check-client-boundaries.mjs` + `scripts/client-boundary-allowlist.json`, encadenado en `npm test` y cubierto por M13. Ver seccion 11. |
| Core no importa modulos de empresa | Extension de `check-boundaries.mjs` con categoria `customer-module`. |
| Integraciones no importan modulos de empresa | Check de grafo de imports. |
| Modulos de empresa no se importan entre si | Check de grafo de imports. |
| Cada instalacion productiva declara un modulo de empresa | Validacion de schema del manifest. |
| Capability no declarada no ejecuta | Test con adaptadores espia: cero llamadas externas. |
| Request cruzada falla cerrado | Test con identidad/organizacion de otra empresa. |
| Secretos no se comparten | Preflight de referencias y paths por instalacion. |
| Evidence/memory/logs no se comparten | Preflight de rutas bajo carpeta de instalacion. |
| Red aislada por empresa | Lint de compose/redes y ausencia de puertos publicos directos de Kern. |
| Backup no restaura cruzado | Metadata validada antes del restore. |
| Cambiar un modulo no altera instalaciones ajenas | Matriz CI por instalacion representativa. |

## 8. Plan de migracion

La migracion debe ser incremental.

Orden recomendado:

1. Inventariar referencias de empresa en `packages/`, `docs/`, `deploy/` y tests.
2. Separar primero las areas con mas riesgo de mezcla:
   - adapters que hoy mezclan proveedor con negocio de cliente, empezando por `packages/adapters/pacoprint-catalog` y `packages/adapters/numa-postgres`;
   - prompts;
   - catalogos de tools;
   - workflows de dominio;
   - capabilities de dominio;
   - renderizadores de respuesta;
   - schemas de configuracion especifica.
3. Crear modulos explicitos para PacoPrint y Numa.
4. Mantener adaptadores reutilizables separados:
   - Holded;
   - Telegram;
   - OpenWebUI;
   - PostgreSQL.
5. Convertir el runtime global en bootstrap/assembly por instalacion.
6. Endurecer `check-boundaries.mjs`.
7. Anadir tests de composicion por instalacion.
8. Retirar excepciones temporales documentadas.

La migracion no debe bloquear fixes urgentes ni demos, pero cualquier trabajo nuevo especifico de empresa debe evitar aumentar la mezcla existente.

## 9. Consecuencias

### 9.1 Consecuencias positivas

- Reduce contaminacion entre clientes.
- Evita forks completos de Kern por empresa.
- Permite reutilizar integraciones sin copiar logica de cliente.
- Hace mas revisables los PRs.
- Facilita backups, restores y rollbacks por empresa.
- Refuerza fail-closed y multi-tenant.
- Hace mas facil incorporar una tercera empresa que use Holded sin heredar reglas PacoPrint.
- Con el mecanismo de la seccion 11, la mezcla existente deja de crecer sin necesidad de parar produccion ni de refactorizar a lo bruto.

### 9.2 Costes y trade-offs

- Habra mas paquetes y mas wiring explicito.
- Algunas abstracciones actuales tendran que moverse.
- El boundary checker debera evolucionar.
- Las migraciones de Numa y PacoPrint requeriran PRs pequenos y ordenados.
- Puede haber deuda temporal mientras se extraen modulos existentes.

### 9.3 Riesgos aceptados

- No se generalizara prematuramente cada dominio.
- Si algo es claramente especifico de cliente, primero se encapsula como modulo de empresa.
- Solo se promueve a componente reutilizable cuando haya dos o mas casos reales y una semantica comun estable.

## 10. Out of scope

Este ADR no implementa la migracion.

No mueve codigo.

No crea paquetes nuevos.

No modifica `check-boundaries.mjs`.

No cambia despliegues existentes.

No cambia PRs abiertos de PacoPrint o Numa.

No introduce marketplace.

No introduce carga dinamica remota de plugins.

No permite ejecutar varias empresas en el mismo proceso productivo.

No decide nombres finales de todos los paquetes futuros.

Este ADR fija la direccion arquitectonica y los invariantes que deben guiar los siguientes PRs.

## 11. Mecanismo de control implementado (M13)

Este ADR seguia siendo texto mientras la contaminacion podia crecer sin que nada la
detectase. M13 cierra esa brecha implementando el primer invariante de la seccion 7.

### 11.1 La regla

Un paquete comun de Kern no puede nombrar una empresa concreta. Se consideran comunes
todos los paquetes bajo `packages/` salvo:

- los que declaran una empresa en su propia ruta (`packages/adapters/pacoprint-catalog`,
  `packages/adapters/numa-postgres`, futuro `packages/customer-modules/<empresa>`), que
  pueden nombrar unicamente a esa empresa y nunca a otra;
- `packages/compliance-tests`, y en general los tests, porque los tests de comportamiento
  de un cliente forman parte de su modulo (seccion 2.3).

La busqueda es estatica y lexica sobre `packages/**/src/**`: cubre identificadores, rutas
de import, claves de configuracion, nombres de secreto, ids de organizacion, prompts
embebidos y comentarios. Detecta nombres, no semantica: un mapeo de cliente que no se
nombra a si mismo no se detecta, y esa clase de mezcla sigue dependiendo de revision.

### 11.2 Piezas

- `scripts/check-client-boundaries.mjs`, disponible como `npm run check:client-boundaries`
  y encadenado en `npm test`.
- `scripts/client-boundary-allowlist.json`, la deuda registrada con motivo, destino, hito
  de retirada, responsable y fecha.
- `packages/compliance-tests/test/m13-client-boundary.test.ts` (M13).
- `docs/implementation/m13-client-boundary-check.md`, con el inventario por tipo y el plan
  de limpieza.

Se mantiene separado de `check-boundaries.mjs`, que verifica el grafo de imports y debe
estar siempre en cero. El check de menciones arrastra allowlist, y a diferencia del de
imports **no exime al paquete `runtime`**: `packages/runtime/src/slice.ts` es hoy el mayor
foco de mezcla y queda contabilizado.

### 11.3 La allowlist solo puede decrecer

Rompen el build una violacion nueva, el crecimiento de una ya registrada, una entrada
obsoleta cuyo fichero ya esta limpio, una entrada que apunta a un fichero inexistente y
cualquier descuadre del presupuesto declarado. Limpiar obliga a bajar el contador y
ensuciar obliga a subirlo en un diff visible.

Estado al implantar el mecanismo: **21 ficheros y 477 menciones** de cliente en paquetes
comunes. Ese es el numero que la migracion debe llevar a cero.

### 11.4 Consecuencias

- La direccion del ADR pasa de ser una intencion a ser una condicion de merge.
- Trabajo nuevo especifico de empresa que aumente la mezcla falla en `npm test`, que es
  exactamente lo que pide la seccion 8.
- La deuda existente no bloquea produccion ni obliga a un refactor grande de golpe, pero
  deja de ser invisible: es contable y tiene destino asignado por fichero.
- Coste asumido: al limpiar un fichero hay que borrar su entrada y bajar el presupuesto en
  el mismo PR, y dar de alta una empresa nueva incluye anadir su nombre al checker.
- Los demas invariantes de la tabla de la seccion 7 siguen pendientes.

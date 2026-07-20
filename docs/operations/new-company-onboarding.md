# Alta de una empresa nueva en Kern

Guia operativa para dar de alta una empresa (instalacion) sobre el Core comun de Kern
**sin crear un fork implicito**.

- **Base normativa:** ADR-0002 (pluggability por instalacion), ADR-0004 (una rama = un
  concepto), ADR-0005 (Docker por instalacion), ADR-0006 (separacion Core / integracion /
  modulo de empresa).
- **Caso inmediato:** Proinsur (perfil Numa: RRHH, fichajes, ausencias, PostgreSQL,
  OpenWebUI).
- **Caso objetivo:** la empresa numero cinco, sin que el coste de alta crezca.

Este documento describe el codigo **tal y como esta hoy**, no el diagrama ideal del ADR.
Donde el codigo real contradice al ADR se dice explicitamente y se marca como trampa.

---

## 1. El recorrido real de PacoPrint, de punta a punta

Mensaje de Telegram -> respuesta con precio. Cada salto con fichero y funcion reales.

| # | Paso | Fichero | Entrada -> salida |
|---|------|---------|-------------------|
| 1 | Arranque del proceso | `packages/runtime/src/run-telegram-installation.ts` | Lee `KERN_RUNTIME_CONFIG_PATH` / `KERN_RUNTIME_CONFIG_JSON`, llama a `startInstallationRuntime`, y hace `setInterval` de polling |
| 2 | Validacion de config | `packages/runtime/src/config.ts` -> `loadInstallationConfig` | JSON crudo -> `RuntimeInstallationConfig` + `ResolvedRuntimeSecrets`. Falla cerrado con `RuntimeConfigError` |
| 3 | **Bootstrap / assembly** | `packages/runtime/src/slice.ts` -> `startInstallationRuntime` | Instancia transports, adapters, capabilities, canales y boundary segun `active_modules` |
| 4 | Polling | `slice.ts` -> `InstallationRuntimeSliceImpl.pollOnce` | `telegramTransport.getUpdates()` -> lista de `TelegramChannelUpdate` |
| 5 | Canal + identidad | `packages/channels/telegram/src/index.ts` -> `handleTelegramUpdate` | Resuelve `identity_mappings` por `telegram_user_id`. Sin mapping -> denegado, no se llama al modelo |
| 6 | Memoria conversacional | `packages/runtime/src/conversation-memory.ts` | Lee historial por `(installation_id, chat_id)` |
| 7 | **Boundary de orquestacion** | `packages/orchestration/src/index.ts` -> `InMemoryOrchestrationBoundary.execute` | Fail-closed, calcula `active_capabilities`, aplica *routing overrides*, llama al orquestador |
| 8 | Modelo | `packages/orchestrators/qwen/src/index.ts` -> `createQwenOrchestrator` | Prompt de sistema + catalogo de tools -> `OrchestrationProposal { capability_key, params }` |
| 9 | Validacion de propuesta | `orchestration/src/index.ts` -> `validateProposal` / `resolveWorkflowRequest` | `capability_key` -> `GovernedWorkflowKind`. Params invalidos -> `blocked`, nunca se inventa |
| 10 | **Runtime de workflows** | `packages/workflows/src/runtime.ts` -> `executeWorkflow` | Despacha por `kind` (cadena de ternarios) |
| 11 | Workflow de dominio | `packages/workflows/src/pricing-workflow.ts` -> `executePricingQuoteLineWorkflow` | Politica -> binding -> invocacion de capability |
| 12 | Capability | `packages/workflows/src/pricing-line.ts` (`createPricingQuoteLineCapability`) | Parsea medidas/opciones, llama al puerto de catalogo |
| 13 | Adaptador de proveedor | `packages/adapters/pacoprint-catalog/src/index.ts` | HTTP a `https://pacoprint.com/api/v1` -> precio real |
| 14 | Evidencia | `packages/evidence/src/index.ts` | Cada paso escribe en el ledger por `correlation_id` |
| 15 | Respuesta | `channels/telegram` -> `buildOutboundMessage` -> `transport.sendMessage` | Y `conversationMemoryStore.append` |

Camino equivalente de Numa/Proinsur: pasos 1-3 iguales, pero la entrada es
`serve-installation.ts` -> `packages/channels/openwebui/src/index.ts` (HTTP estilo OpenAI,
identidad por cabecera `x-openwebui-user-id`), y los pasos 10-13 son
`hr-workflow.ts` -> `capabilities/src/numa-capabilities.ts` ->
`adapters/numa-postgres/src/hr.ts` (SQL cerrado sobre PostgreSQL).

### Donde esta cada cosa

**Comun de verdad (reutilizable tal cual):** identidad y organizacion
(`packages/identity`), politica (`packages/policy`), bindings (`packages/bindings`),
evidencia (`packages/evidence`), turnos (`packages/turns`), ciclo de vida del boundary,
canales `telegram` y `openwebui` como transporte, memoria conversacional, y el
`InMemoryRuntimeModuleRegistry` de `slice.ts`.

**Especifico de imprenta (PacoPrint):** `adapters/pacoprint-catalog`,
`workflows/pricing-*.ts`, las capabilities `pricing.quote_line` / `pricing.quote_draft`,
y las reglas de presupuesto dentro del prompt de sistema.

**Especifico de RRHH (Numa):** `adapters/numa-postgres`,
`workflows/hr-workflow.ts`, `workflows/numa-hr-response-renderer.ts`,
`capabilities/numa-capabilities.ts`, `orchestration/numa-hr.ts`, y el bloque
`runtime_options.numa_hr`.

**Mezclado, y ahi esta el problema:** el bootstrap (`slice.ts`), el catalogo de tools, el
prompt de sistema, la union `GovernedWorkflowKind` en `contracts`, y el despacho de
`executeWorkflow`. Ver seccion 5.

---

## 2. Puntos de extension legitimos

Estos son los ganchos que **si** debe usar una empresa nueva.

### 2.1 Puertos que implementa un adaptador

Definidos en `packages/contracts/src/index.ts`. Un adaptador nuevo implementa uno de
estos y **no importa nada de Core ni de otro proveedor**:

- `ExternalReadAdapter` — lectura gobernada generica (M6). El caso mas reutilizable.
- `PresenceReadPort` — presencia/fichajes.
- `NumaHrReadPort` — RRHH completo (fichajes, ausencias, saldos, informes).
- `PacoPrintCatalogAdapterPort` — catalogo y pricing.

Un puerto nuevo solo se crea si ninguno encaja, y entonces se anade a `contracts`
**con nombre de dominio, no de cliente** (`HrReadPort`, no `ProinsurHrReadPort`).

### 2.2 Registro de modulo

`packages/runtime/src/config.ts`:

```ts
export type RuntimeModuleKey =
  | 'telegram-channel'
  | 'qwen-orchestrator'
  | 'holded-read'
  | 'pacoprint-catalog'
  | 'numa-postgres-read'
  | 'openwebui-channel';
```

Union cerrada. Un modulo nuevo se anade aqui **y** en la constante `SUPPORTED_MODULES`
duplicada en `config.ts` (linea ~120) **y** en la de `slice.ts` (linea ~52). Las tres.
Si solo se toca una, el arranque falla con `Unsupported module key`.

### 2.3 Activacion por instalacion

En el `runtime.installation.json` de la empresa:

```json
"active_modules": ["qwen-orchestrator", "numa-postgres-read", "openwebui-channel"],
"active_capabilities": []
```

`slice.ts` solo instancia un adaptador si su clave esta en `active_modules`
(`buildOrchestrationBoundary`, lineas 820-860). Sin declararlo, el adaptador no existe en
ese proceso: **ese es el mecanismo de aislamiento que si funciona hoy.**

### 2.4 Secretos

`RuntimeSecretRefs` en `config.ts`. El JSON declara solo el *nombre* de la variable; el
valor vive en `env.runtime` fuera de Git. `resolveRuntimeSecrets` exige el secreto solo si
el modulo esta activo — un secreto de otra empresa ausente no bloquea el arranque.

Las variables de PostgreSQL **no pasan por `secret_refs`**: se leen directamente del
entorno en `createPgConnectionConfigFromEnv` (`adapters/numa-postgres/src/index.ts:437`),
con prefijo `NUMA_` fijo: `NUMA_PGHOST`, `NUMA_PGPORT`, `NUMA_PGDATABASE`, `NUMA_PGUSER`,
`NUMA_PGPASSWORD`, `NUMA_PGSSLMODE`, `NUMA_PGSTATEMENT_TIMEOUT_MS`, `NUMA_PGAPPNAME`.

### 2.5 Config de dominio por instalacion

`runtime_options.numa_hr` (validado por `normalizeNumaHrConfig`) mapea vocabulario de
negocio a ids internos sin tocar codigo:

```json
"numa_hr": {
  "time_type_by_label": { "vacaciones": [5], "asuntos propios": [34] },
  "annual_quota_by_time_type": { "5": 22, "34": 6 },
  "company_id_by_organization_id": { "proinsur": "<company_id real>" }
}
```

Este es el mejor ejemplo del repo de extension bien hecha: **etiquetas de negocio y
cuotas son datos, no codigo.** Copia este patron para cualquier mapeo nuevo.

### 2.6 Prompt de sistema por instalacion

`createQwenOrchestrator` acepta `systemPrompt?: string | null`
(`orchestrators/qwen/src/index.ts:123`), que sustituye por completo a `buildSystemPrompt`.

**Existe pero `slice.ts` nunca lo pasa.** Es el gancho correcto para sacar las reglas de
negocio del prompt comun; ver trampa T4.

### 2.7 Identidad

`identity_mappings` (canal `telegram` u `openwebui`) y, para OpenWebUI,
`runtime_options.openwebui_channel.users`. Sin mapping activo la peticion se deniega antes
de llegar al modelo. No hay fallback y no debe anadirse ninguno.

---

## 3. Checklist: dar de alta una empresa nueva

Orden real de trabajo. Una rama por paso agrupado (ADR-0004).

### Fase A — Decidir la naturaleza de la empresa

1. **Averigua si el software de la empresa ya esta soportado.** No preguntes "que
   sector es", pregunta "que sistema hay detras".
   - Mismo sistema que un cliente existente (misma API, mismo esquema de BBDD) ->
     **cero codigo nuevo**, solo instalacion. Es el caso de Proinsur sobre Numa.
   - Sistema distinto, protocolo conocido (otro PostgreSQL, otro HTTP) -> adaptador
     nuevo reutilizando el runner de queries.
   - Dominio nuevo -> modulo de empresa nuevo.
2. **Comprueba el esquema real** antes de asumir reutilizacion. Las queries de
   `adapters/numa-postgres/src/hr.ts` estan atadas a estas tablas:
   `core_punches`, `core_persons`, `core_punching_points`, `employees`, `org_employees`,
   `org_employee_groups`, `org_employee_groups_employees`, `ta_requests`, `ta_time_types`.
   Si faltan, no es "perfil Numa" aunque el sector sea RRHH.

### Fase B — Preparar el origen de datos

3. Crea el rol de solo lectura en la BBDD del cliente. ADR-0005 §2.7: rol `kern_ro`,
   solo `SELECT`, sin `INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE`,
   `statement_timeout`. El adaptador ya fuerza `BEGIN READ ONLY` y `SET LOCAL
   statement_timeout` (`adapters/numa-postgres/src/runner.ts`), pero eso no sustituye a
   los permisos.
4. Verifica conectividad de red desde el contenedor. Red Docker privada por instalacion,
   allowlist de salida solo a la BBDD propia.

### Fase C — Instalacion

5. Crea la carpeta segun ADR-0005 §2.2:

   ```text
   /opt/kern/installations/proinsur/
     installation.json
     env.runtime
     data/  logs/  evidence/  memory/
   ```

6. Escribe `installation.json` partiendo de `runtime.installation.numa.example.json`
   (raiz del repo). Cambia obligatoriamente:
   - `installation_id` (unico)
   - `organization.organization_id`, `.name`, `.isolation_boundary`
   - `principals` y `identity_mappings` reales
   - `active_modules` — solo lo que esa empresa usa
   - `runtime_options.*_file_path` — **dentro de la carpeta de la instalacion**
   - `runtime_options.numa_hr.company_id_by_organization_id` — la clave debe ser el
     `organization_id` de *esta* instalacion. Si no coincide, `validateModuleSpecificConfig`
     bloquea el arranque (`config.ts:711`). Es intencionado.
   - `openwebui_channel.users` — el `x-openwebui-user-id` real
7. Escribe `env.runtime` desde `runtime.installation.numa.env.example`. Nunca en Git.
8. Anade el servicio al compose copiando `deploy/numa-demo/docker-compose.yml`:
   contenedor propio, `read_only: true`, `cap_drop: ALL`,
   `no-new-privileges`, red privada propia, puerto solo en loopback, imagen **por digest**.

### Fase D — Aislamiento en el canal

9. Registra la empresa como modelo/endpoint separado en OpenWebUI y pon ACL por
   usuario/grupo. Sin ACL, un usuario de otra empresa puede seleccionar este modelo.
10. Verifica que el proxy **elimina** cualquier `X-OpenWebUI-User-Id` entrante del cliente
    antes de inyectar el autenticado (ADR-0005 §2.4). Si no, la identidad es falsificable.

### Fase E — Verificacion

11. `npm run check:boundaries` y `npm test`.
12. Preflight de arranque: config invalida, secreto ausente o mapping cruzado deben dar
    `installation start blocked` **antes** de aceptar trafico.
13. Prueba negativa: peticion con identidad de otra empresa -> denegada.
14. Prueba de capability no declarada -> `denied` / `unavailable`, cero llamadas externas.
15. Comprueba que `evidence/`, `memory/`, `logs/` escriben en la carpeta de esta
    instalacion y en ninguna otra.

### Fase F — Solo si hace falta codigo nuevo

16. Rama desde `main`, un concepto (ADR-0004).
17. Adaptador nuevo en `packages/adapters/<proveedor>/` — nombre de **proveedor**, no de
    cliente. `postgres-hr-read`, no `proinsur-postgres`.
18. Modulo de empresa en `packages/customer-modules/<empresa>/` (ubicacion objetivo de
    ADR-0006 §3.2; hoy no existe la carpeta — crearla es el paso correcto, no una excusa
    para meter la logica en `workflows/`).
19. Registra la clave en los tres sitios de la seccion 2.2 y cablea en `slice.ts`
    **dentro de un `if (active_modules.includes(...))`**.
20. Documenta en `docs/operations/` y anota la deuda si has tenido que tocar algo comun.

---

## 4. Lo que NO se toca nunca

Toda modificacion aqui es una senal de que la frontera se esta rompiendo:

| Paquete | Por que es intocable |
|---------|----------------------|
| `packages/identity` | Resolucion de organizacion y principal. Un `if` por cliente aqui rompe el aislamiento multi-tenant entero |
| `packages/policy` | Decisiones de politica |
| `packages/bindings` | Decision binding |
| `packages/evidence` | Ledger de evidencia |
| `packages/turns` | Ciclo de vida del turno |
| `packages/core` | Nucleo comun |
| `scripts/check-boundaries.mjs` | El checker. Si te bloquea, el problema es tu diseno, no el checker |

Y dentro de lo tocable, nunca:

- Anadir una rama `else if (organization_id === '...')` en cualquier sitio.
- Anadir un `capability_key` de tu empresa a una funcion `isXCapabilityKey` existente de
  otro cliente.
- Ampliar un adaptador ajeno (`pacoprint-catalog`, `holded`) para que "tambien" haga lo
  tuyo.
- Relajar un fail-closed para que tu caso pase.

---

## 5. Trampas concretas: los ficheros comunes ya contaminados

Inventario reproducible con `scripts/check-client-boundaries.mjs`: **21 ficheros y 477
menciones**. La particion sin solapamientos es: contratos de dominio 147, workflows 62,
capabilities 67, mapeos/routing 61, prompt 9, configuracion/bootstrap 127 y canales 4.
`packages/contracts/src/index.ts` concentra 109 menciones y es el foco mas delicado por ser
la raiz de dependencias del sistema.

Para cada uno: si bloquea a Proinsur y que hacer.

### T1 — `packages/contracts/src/index.ts` (109 menciones) — CRITICO

```ts
export type GovernedWorkflowKind =
  'mock.estimate.read' | 'mock.email.send' | 'pricing.quote_line'
  | 'pricing.quote_draft' | 'numa.hr.read';
```

Mas ~40 interfaces `NumaHr*` (`NumaHrPunchDayResult`, `NumaHrLeaveBalanceParams`,
`NumaHrReadPort`...). ADR-0002 §2.7 dice "contracts define ports" y el checker prohibe que
`contracts` importe nada — pero nadie prohibe que *nombre* clientes, y aqui esta el dominio
RRHH completo con nombre de cliente en el paquete raiz del que depende todo.

- **Bloquea a Proinsur?** No, si Proinsur es perfil Numa: reutiliza los tipos tal cual.
- **Obliga a un `if`?** No hoy. Pero el dia que Proinsur necesite un campo propio, tocara
  `contracts` y el cambio afectara a Numa y a PacoPrint a la vez.
- **Arreglo:** renombrar `NumaHr*` -> `Hr*` (es dominio, no cliente) y abrir
  `GovernedWorkflowKind` a `string` validado en registro, o moverla a un registro de kinds
  contribuido por modulos. Renombrado puro, sin cambio de comportamiento.

### T2 — `packages/workflows/src/runtime.ts` — CRITICO, fallback entre empresas

```ts
return input.kind === 'mock.estimate.read' ? ...
  : input.kind === 'mock.email.send' ? ...
    : input.kind === 'numa.hr.read' ? ...
      : input.kind === 'pricing.quote_draft' ? ...
        : executePricingQuoteLineWorkflow(runtimeContext, input);
```

**El `else` final es un workflow de PacoPrint.** Una llamada directa al runtime con un
`kind` no reconocido ejecuta pricing de imprenta. El flujo normal de orquestacion lo
deniega antes mediante `validateProposal` y `resolveWorkflowKind`, por lo que es un fallo
de defensa en profundidad y mantenibilidad, no un cruce explotable demostrado en los
canales actuales. Aun asi contradice ADR-0006 §3.6 y debe fallar cerrado.

- **Bloquea a Proinsur?** No, pero es una mina: si Proinsur anade un `kind` y olvida una
  rama, en vez de fallar cerrado ejecuta silenciosamente el workflow de otro cliente.
- **Arreglo (hacerlo antes de Proinsur, es de bajo riesgo):** convertir la cadena en un
  `Map<GovernedWorkflowKind, WorkflowExecutor>` poblado en el bootstrap, y que el fallo sea
  `unavailable` explicito. Es la correccion de mayor valor por linea del repo.

### T3 — `packages/runtime/src/slice.ts` — el registro global de tools

`buildQwenToolCatalog()` (lineas 238-626) devuelve un array **estatico** con las 2 tools de
pricing PacoPrint + las 9 de RRHH Numa + `request_clarification`. Se pasa a
`createQwenOrchestrator` sin filtrar por `active_modules`.

`createQwenOrchestrator` recibe la definicion global, pero el modelo **no ve todas las
tools**: `QwenOrchestrator.propose` filtra por `active_capabilities` antes de construir la
peticion al modelo (`orchestrators/qwen/src/index.ts:773`). No hay exposicion cruzada de
tools demostrada. La deuda es estructural: registrar una tool nueva sigue obligando a
tocar el catalogo comun y mezclar definiciones de modulos distintos.

- **Bloquea a Proinsur?** No.
- **Obliga a un `if`?** Si, en cuanto Proinsur quiera una tool propia: el desarrollador
  anadira su bloque a este array de 400 lineas, junto a los de PacoPrint. Es el punto donde
  el fork implicito se materializa.
- **Arreglo:** que cada modulo de empresa aporte sus `QwenToolDefinition`; mantener el
  filtrado existente por `active_capabilities` como segunda barrera.

### T4 — `packages/orchestrators/qwen/src/index.ts` — prompt compartido

`buildSystemPrompt` (linea 290) mezcla en un solo string reglas de PacoPrint
("haz un presupuesto para \<cliente\>", linea 315) y de Numa ("For Numa HR leave
questions...", lineas 346-353).

- **Bloquea a Proinsur?** No, pero el modelo de Proinsur recibe instrucciones de imprenta.
- **Arreglo inmediato y barato:** ya existe `options.systemPrompt`. Basta con exponer
  `runtime_options.system_prompt_path` en la config y pasarlo desde `slice.ts`. Cero
  cambios en Core, cada instalacion con su prompt.

### T5 — `packages/orchestration/src/index.ts` (54 menciones)

Contiene `isNumaHrCapabilityKey`, `isValidNumaHrProposal` (con lista de campos prohibidos y
frases colectivas en espanol) y, en `execute` (linea 937):

```ts
const routingOverride =
  deriveNumaHrRoutingOverride(orchestratorRequest.user_message, this.now()) ??
  deriveHoldedReadRoutingOverride(orchestratorRequest.user_message);
```

- **Bloquea a Proinsur?** No: el override se aplica solo si la capability forzada esta en
  `active_capabilities`, asi que en la practica esta protegido.
- **Obliga a un `if`?** Si. Toda validacion de propuesta nueva se anade a esta cascada.
- **Arreglo:** que cada modulo contribuya su validador y su override al boundary via
  constructor, en vez de que el boundary los conozca por import.

### T6 — `packages/orchestration/src/numa-hr.ts`

`deriveNumaHrRoutingOverride` es una heuristica regex en espanol:
`/\basuntos propios\b/` + `/\b(?:el\s+)?ano\s+pasado\b/` -> fuerza `leave.days`.
Regla de negocio de un cliente, en un paquete gobernado comun.

- **Bloquea a Proinsur?** No. Si Proinsur usa el mismo vocabulario, incluso le sirve.
- **Arreglo:** mover a `customer-modules/` y declararla como dato de configuracion
  (patron/capability/params), no como codigo.

### T7 — `packages/runtime/src/config.ts` (48 menciones)

Tres problemas acumulados:
- `RuntimeSecretRefs` y `ResolvedRuntimeSecrets` con `HOLDED_API_KEY` y
  `PACOPRINT_API_TOKEN` como campos fijos. Un secreto nuevo obliga a tocar Core.
- `runtime_options.numa_hr`: bloque tipado con nombre de cliente en la config comun.
- `createSampleInstallationConfig()` devuelve una config de PacoPrint (`org-pacoprint`,
  Gema, Juan) **y ademas** un bloque `numa_hr` con `"org-pacoprint": "company-pacoprint"`.
  Es la mezcla de dos clientes en una sola funcion de Core, y se usa como fallback en
  `startInstallationRuntime` cuando la config es invalida (`slice.ts:942`).

- **Bloquea a Proinsur?** No.
- **Arreglo:** `secret_refs` como `Record<string, string>` validado, `numa_hr` renombrado a
  un bloque de dominio (`hr`) o movido a `module_config: { "<module-key>": {...} }`.

### T8 — `packages/capabilities/src/numa-capabilities.ts` + `presence-capabilities.ts`

`createNumaHrCapabilitySet` / `createPresenceCapabilitySet` en un paquete gobernado.
Exportados desde `capabilities/src/index.ts` (linea 902-903).

- **Bloquea a Proinsur?** No, los reutiliza enteros.
- **Arreglo:** destino natural del modulo `hr` / `numa-hr` de ADR-0006 §3.2.

### T9 — `packages/workflows/src/hr-workflow.ts` y `numa-hr-response-renderer.ts`

El renderer produce texto de negocio ("Vacaciones", saldos, formato de dias) en un paquete
comun. Es literalmente la excepcion que ADR-0006 §3.2 lista por nombre.

- **Bloquea a Proinsur?** No.
- **Obliga a un `if`?** **Si, y este es el mas probable.** En cuanto Proinsur quiera un
  literal distinto ("Asuntos propios" vs "Dias personales") o un formato propio, la via
  rapida es un `if` por `organization_id` dentro del renderer. **Esa es la trampa numero
  uno de este proyecto.** El renderer ya acepta `time_type_label_by_id` desde config: usa
  ese mecanismo y amplialo, no anadas ramas.

### T10 — `packages/workflows/src/pricing-*.ts` (4 ficheros) y `mock-capabilities.ts`

Logica de imprenta pura en el paquete comun de workflows.

- **Bloquea a Proinsur?** No.
- **Arreglo:** mover a `customer-modules/pacoprint-pricing/`. Es trabajo de PacoPrint, no
  de Proinsur — no lo metas en la rama de Proinsur (ADR-0004).

### T11 — `packages/workflows/src/workflow-runtime-context.ts`

`WorkflowRuntimeContext` tiene un campo `pacoPrintCatalogAdapter: PacoPrintCatalogAdapterPort | null`.
Nombre de cliente en el contexto que reciben **todos** los workflows, incluidos los de RRHH.

- **Arreglo:** renombrar a `catalogReadPort`. Es un rename mecanico.

### T12 — `packages/core/src/hr.ts` (33 menciones)

Tipos HR con prefijo `Numa` en `packages/core`, el paquete que ADR-0006 §2.1 define como
"no conoce empresas concretas". Mismo arreglo que T1: rename de dominio.

### T13 — `packages/runtime/src/transports.ts`

`createNodeFetchPacoPrintTransport` y `createNodeFetchHoldedTransport` con URL
`https://pacoprint.com/api/v1` hardcodeada tambien en `slice.ts` (lineas 832 y 1048).
No afecta a Proinsur, pero muestra el patron a no repetir: la URL base de tu proveedor va
en `runtime_options`, como ya hace `holded_base_url`.

### T14 — El checker no te va a avisar

`scripts/check-boundaries.mjs`, linea ~177:

```js
if (sourceCategory === 'runtime') {
  return null;
}
```

**El paquete `runtime` esta exento del checker de imports.** Por eso `slice.ts` puede
importar los adaptadores. Es coherente con que sea el bootstrap (ADR-0006 §3.7), pero deja
sin controlar ese grafo concreto.

El checker historico solo analiza **imports**. La rama
`feat/core-client-boundary-check` anade el control lexico de menciones, incluido runtime,
con allowlist historica decreciente. Hasta que esa rama se fusione, el invariante no forma
parte de `main`.

### T15 — Capabilities HR concedidas sin declararlas

`slice.ts:880-888`:

```ts
installationCapabilities: {
  [config.installation_id]: [
    ...config.active_capabilities,
    ...(presenceReadPort ? ['employee.find', 'punches.list', 'presence.current'] : []),
    ...(hrReadPort ? ['presence.current-workers', 'punch.day', ... ] : [])
  ]
}
```

Las 9 capabilities de RRHH se conceden **por el mero hecho de que el puerto exista**, no
porque la instalacion las declare. Por eso el ejemplo de Numa funciona con
`"active_capabilities": []`.

- **Impacto en Proinsur:** funcionara sin declarar nada, y por eso nadie lo notara. Pero
  no se puede dar a Proinsur un subconjunto de RRHH (p.ej. fichajes si, nominas no) sin
  tocar Core.
- **Arreglo:** exigir que `active_capabilities` las liste y usar el puerto solo como
  condicion adicional. Declaralas explicitamente en el `installation.json` de Proinsur
  aunque hoy no sea obligatorio — el dia que se arregle, tu config ya sera correcta.

---

## 6. Proinsur en concreto: que hay, que falta

**Hipotesis a confirmar en el paso A.1:** Proinsur usa el mismo software que Numa, con su
propia instancia de BBDD y su propio `company_id`. Si es asi, Proinsur es **una instalacion,
no un desarrollo**.

### Ya construido y reutilizable tal cual

- `packages/adapters/numa-postgres` — implementado, probado y validado en smoke real: 11 queries cerradas con
  parametros ligados, `BEGIN READ ONLY`, `statement_timeout`, scope por `company_id`,
  resolucion de empleado y grupo por nombre. Esto no acredita por si solo una instalacion
  productiva reproducible; el preflight de Numa mantiene pendientes operativos. Estado: probado
  (`m12-pg-presence-runtime.test.ts`).
- `packages/channels/openwebui` — canal HTTP estilo OpenAI con identidad por cabecera.
- `capabilities/numa-capabilities.ts` — las 9 capabilities de RRHH.
- `workflows/hr-workflow.ts` + `numa-hr-response-renderer.ts` — ejecucion y render.
- `orchestration` — validacion de propuestas HR y anti-fuga de ids internos
  (`isValidNumaHrProposal` prohibe `employee_id`, `time_type_id`, etc. en los params del
  modelo: el modelo trabaja con nombres, el runtime resuelve los ids).
- `deploy/numa-demo/` + los dos ficheros `runtime.installation.numa.*` de la raiz —
  plantilla de instalacion lista para copiar.

### Falta (trabajo real de Proinsur)

1. `installation.json` y `env.runtime` de Proinsur, con su `organization_id`, su
   `company_id_by_organization_id`, sus usuarios de OpenWebUI y sus rutas de volumen.
2. Rol `kern_ro` y conectividad a la BBDD de Proinsur.
3. Servicio en compose + ACL de OpenWebUI + saneado de la cabecera en el proxy.
4. `time_type_by_label` y `annual_quota_by_time_type` **de Proinsur** — los ids de tipo de
   ausencia y las cuotas de convenio casi seguro difieren de los de Numa. Es config, no
   codigo.
5. Verificacion de que el esquema de la BBDD tiene las tablas de la Fase B.2.

### Falta a nivel de producto (no de Proinsur, pero le afecta)

- El prefijo `NUMA_` de las variables de PostgreSQL: Proinsur tendra que poner
  `NUMA_PGHOST=<host de Proinsur>`, que es confuso pero **funciona y no requiere tocar
  codigo**. Renombrar a `KERN_PG*` con retrocompatibilidad es un PR aparte; no lo metas en
  la rama de alta de Proinsur.
- Si Proinsur pide una sola cosa que Numa no tiene, no la anadas a `numa-capabilities.ts`:
  ese es el momento de crear `packages/customer-modules/proinsur-hr/`.

### Lo que NO hay que crear de cero

Nada de RRHH. Si te encuentras escribiendo SQL de fichajes, un renderer de ausencias o una
capability `punch.*`, para: ya existe. Estas a punto de crear el segundo fork.

---

## 7. Senales de alarma

Si te ves haciendo cualquiera de estas cosas, **parate**: estas rompiendo la frontera.

1. Copiar un fichero de `pacoprint-*` o `numa-*` y sustituir el nombre por el de tu
   empresa. Es la definicion de fork implicito.
2. Escribir `if (organization_id === ...)` o `if (installation_id === ...)` en cualquier
   fichero de `packages/` que no sea `slice.ts` — y en `slice.ts`, tambien.
3. Anadir tu `capability_key` a `isNumaHrCapabilityKey` o a cualquier
   `isXCapabilityKey` de otro cliente.
4. Anadir una rama a la cadena de ternarios de `executeWorkflow` sin convertirla antes en
   un mapa (T2).
5. Anadir tu tool al array de `buildQwenToolCatalog()` (T3).
6. Anadir un campo con nombre de tu empresa a `RuntimeSecretRefs`, `RuntimeOptions` o
   `WorkflowRuntimeContext`.
7. Anadir literales de tu empresa a `numa-hr-response-renderer.ts` (T9).
8. Tocar `packages/identity`, `packages/policy`, `packages/bindings`, `packages/evidence`
   o `packages/turns` para que "tu caso" pase.
9. Editar `scripts/check-boundaries.mjs` para que deje de quejarse.
10. Relajar un fail-closed, anadir un `?? valorPorDefecto` donde antes se bloqueaba, o
    convertir un `blocked` en un `warning`.
11. Compartir un secreto, un volumen, un ledger de evidencia o una red entre dos empresas
    "temporalmente".
12. Meter en la misma rama el alta de tu empresa y un arreglo de otra (ADR-0004 §2.1). Si
    arreglando T2 o T4 mejoras la vida de PacoPrint, eso va en su propia rama.
13. Justificar cualquiera de las anteriores con "es que asi es mas rapido" o "luego lo
    refactorizo". La deuda actual de 21 ficheros y 477 menciones muestra el coste acumulado
    de ese patron.

### Regla practica

> Si tu cambio hace que el codigo de otra empresa se comporte distinto, esta en el sitio
> equivocado.

Y el contraste que decide la ubicacion:

| Pregunta | Si | Entonces va en |
|----------|-----|----------------|
| Es cierto para cualquier empresa? | Si | Core / paquete gobernado |
| Es cierto para cualquier usuario de este proveedor o protocolo? | Si | Integracion reutilizable (`adapters/`, `channels/`) |
| Es cierto solo para esta empresa? | Si | Modulo de empresa (`customer-modules/`) |
| Es un valor, un nombre, un id o una etiqueta? | Si | `installation.json` — no es codigo |

---

## 8. Orden de arreglos recomendado

Ninguno es requisito para dar de alta a Proinsur, pero cada uno reduce la probabilidad de
que la empresa numero cinco duela. De mayor a menor relacion valor/riesgo:

1. **T2** — dispatch explicito con fallo cerrado. La rama
   `fix/workflow-dispatch-fail-closed` deja preparada esta defensa.
2. **T4** — `system_prompt_path` por instalacion. Ya existe el gancho.
3. **T3** — sustituir el catalogo global por contribuciones de modulo; el filtrado por
   `active_capabilities` ya existe.
4. **T15** — exigir `active_capabilities` explicitas para las capabilities de RRHH.
5. **T11 / T12 / T1** — renames de dominio (`pacoPrintCatalogAdapter` -> `catalogReadPort`,
   `NumaHr*` -> `Hr*`). Mecanicos, sin cambio de comportamiento.
6. **T14** — categoria `customer-module` en el checker + check estatico de nombres de
   cliente en paquetes gobernados. Es el invariante que convierte esta guia en algo que se
   cumple solo.
7. **T9 / T10 / T8** — extraccion a `packages/customer-modules/`. El grueso de la migracion
   de ADR-0006 §8.

Cada uno, su propia rama desde `main`.

# Core v1 Implementation Plan
- **Estado:** Draft implementation plan
- **Fecha:** 2026-06-28
- **Base normativa:** RFC-0000 a RFC-0010 Accepted
- **Objetivo:** Definir el primer plano ejecutable para implementar Kern Core v1 sin romper las garantías fundacionales.

## 1. Resumen ejecutivo
Core v1 no intenta construir todo Kern. Define el núcleo mínimo que permite ejecutar decisiones y lecturas de forma gobernada, con organización correcta, identidad correcta, policy antes de acción, bindings antes de efectos, evidencia durable, lectura gobernada, agentes sin autoridad propia, aislamiento multi-tenant y fail-closed ante ambigüedad.

Core v1 debe ser pequeño, verificable y aburrido. Su objetivo no es parecer inteligente, sino impedir que cualquier agente, tool, integration, workflow o modelo pueda saltarse las garantías aceptadas en los RFC.

El plan traduce los RFC aceptados en módulos mínimos, contratos internos y una secuencia de implementación que prioriza enforcement, trazabilidad y pruebas negativas antes de cualquier superficie de producto.

## 2. Principios de implementación
- Core es la frontera de enforcement.
- Ningún componente externo se autoautoriza.
- Todo se evalúa dentro de una organización.
- Toda acción relevante tiene correlación.
- Todo efecto externo requiere policy y, cuando aplique, Decision Binding.
- Toda lectura de conocimiento pasa por Knowledge Gateway o Context Assembly controlado por Core.
- El modelo no decide autoridad.
- La memoria no es autoridad.
- Un plan no es autorización.
- Un resultado incierto no se convierte automáticamente en éxito o fallo.
- Fail-closed ante ambigüedad crítica.

## 3. Alcance de Core v1
Core v1 debe incluir como mínimo:

1. Organization Context.
2. Identity Context.
3. Policy Evaluation.
4. Decision Binding.
5. Evidence Ledger.
6. Turn Runtime.
7. Capability Gateway.
8. Knowledge Gateway.
9. Agent/Workflow Runtime mínimo.
10. Compliance Test Suite.

## 4. Fuera de alcance de Core v1
Quedan explícitamente fuera de Core v1:

- marketplace de plugins;
- UI final de cliente;
- billing;
- sistema completo de approvals visuales;
- motor avanzado de workflows;
- memoria semántica avanzada;
- multiagente distribuido complejo;
- optimización de costes;
- elección final de base de datos;
- elección final de cola;
- RAG avanzado;
- clustering;
- alta disponibilidad;
- SDK público estable;
- soporte multi-proveedor completo;
- self-service completo para empresas.

Algunos de estos elementos pueden existir como stubs, pero no como capacidades finales.

## 5. Mapa de módulos

### 5.1 Core Kernel
Responsable de:

- recibir solicitudes normalizadas;
- asignar correlación;
- preservar organización;
- orquestar policy, bindings, evidence y ejecución;
- impedir rutas laterales.

Depende de RFC-0002, RFC-0003, RFC-0005, RFC-0007 y RFC-0008.

### 5.2 Organization & Identity Context
Responsable de:

- resolver organización;
- resolver identidad humana, de servicio o de agente;
- resolver identidad delegada;
- validar scopes;
- aplicar revocación.

Depende de RFC-0004.

### 5.3 Policy Engine
Responsable de:

- evaluar allow/deny/defer;
- devolver obligaciones;
- fallar cerrado ante atributos críticos ausentes;
- invalidar decisiones ante cambios relevantes.

Depende de RFC-0005.

### 5.4 Decision Binding Store
Responsable de:

- crear bindings antes de efectos;
- asociarlos a organización, identidad, payload, policy, expiry y evidencia;
- validar binding en effect-time;
- impedir replay o reutilización fuera de alcance.

Depende de RFC-0003 y RFC-0007.

### 5.5 Evidence Ledger
Responsable de:

- registrar intención;
- registrar decisión;
- registrar binding;
- registrar Point of No Return;
- registrar resultado;
- registrar Unknown Outcome;
- registrar reconciliación;
- preservar trazabilidad.

Depende de RFC-0007 y RFC-0008.

### 5.6 Turn Runtime
Responsable de:

- crear y transicionar Turns;
- gestionar estados;
- bloquear Completed si hay Unknown Outcome;
- preservar contexto mínimo;
- soportar cancelación y reanudación gobernadas.

Depende de RFC-0008.

### 5.7 Capability Gateway
Responsable de:

- mediar Tools, Integrations y Extensions;
- validar precondiciones;
- aplicar bindings;
- impedir que integraciones ejecuten por autoridad propia;
- aislar credenciales.

Depende de RFC-0006 y RFC-0007.

### 5.8 Knowledge Gateway
Responsable de:

- leer fuentes de conocimiento;
- aplicar Retrieval Scope;
- excluir over-fetch;
- preservar procedencia, clasificación, taint y restricciones;
- entregar contexto mínimo a Context Consumers.

Depende de RFC-0009.

### 5.9 Agent/Workflow Runtime
Responsable de:

- instanciar agentes;
- instanciar workflows;
- manejar planes como intención propuesta;
- controlar delegación;
- limitar autonomía;
- tratar Inter-Agent Output como no confiable;
- evitar fragmentación de efectos.

Depende de RFC-0010.

### 5.10 Compliance Test Suite
Responsable de:

- convertir invariantes RFC en tests;
- bloquear regresiones;
- validar que ningún módulo puede eludir Core.

Depende de RFC-0003 a RFC-0010.

## 6. Contratos internos mínimos
- `CoreRequest`: propósito, correlación, organización, principal, intención normalizada; no contiene autoridad implícita ni efecto ejecutable.
- `OrganizationContext`: propósito, organización activa, límites y políticas aplicables; no contiene contexto de otras organizaciones.
- `IdentityContext`: propósito, identidad humana o de servicio, identidad delegada, scopes, revocación; no contiene permisos fuera de alcance.
- `PolicyDecision`: propósito, allow/deny/defer, limitaciones, transformaciones y obligaciones; no contiene autorización ejecutable por sí sola.
- `PolicyObligation`: propósito, condición verificable, deadline, consumo/atómico cuando aplique; no contiene lógica de enforcement dispersa.
- `DecisionBinding`: propósito, atar decisión a una ejecución concreta; campos conceptuales: organización, identidad, payload final, policy, expiry, evidencia, correlation, hash/huella; no contiene autoridad reutilizable.
- `EvidenceRecord`: propósito, registrar lo sucedido; campos conceptuales: qué, quién, cuándo, correlación, referencia a binding, resultado, incertidumbre; no contiene payload sensible innecesario.
- `Turn`: propósito, representar una ejecución gobernada; campos conceptuales: estado, organización, correlación, identidad, evidencia, reconciliación; no contiene autoridad nueva.
- `ExecutionContext`: propósito, contexto mínimo para ejecutar; campos conceptuales: organización, identidad, policy, binding, límites, referencias; no contiene datos fuera de scope.
- `CapabilityInvocation`: propósito, solicitud mediatizada a tool/integration/extension; campos conceptuales: capability, organización, binding, precondiciones, credenciales confinadas; no contiene credenciales libres.
- `KnowledgeRequest`: propósito, solicitud de lectura gobernada; campos conceptuales: organización, finalidad, retrieval scope, fuente, constraints; no contiene over-fetch.
- `ContextPackage`: propósito, paquete mínimo para consumo contextual; campos conceptuales: procedencia, clasificación, taint, restricciones, huellas; no contiene autoridad de sistema.
- `AgentInstance`: propósito, instancia lógica de agente; campos conceptuales: organización, sponsor, estado, límites, contexto mínimo; no contiene identidad humana.
- `WorkflowInstance`: propósito, instancia lógica de workflow; campos conceptuales: organización, plan, pasos, subefectos, estado; no contiene autorización global.
- `PlanStep`: propósito, paso planificado; campos conceptuales: intención, dependencias, posible efecto, límites, correlación; no contiene binding por sí mismo.
- `Delegation`: propósito, delegación acotada; campos conceptuales: principal, delegado, scope, duración, revocación, límites; no contiene autoridad ampliada.
- `InterAgentOutput`: propósito, salida intermedia no confiable; campos conceptuales: emisor, receptor, referencia, procedencia, clasificación; no contiene instrucción de sistema ni autorización.

## 7. Modelo de datos conceptual
Entidades conceptuales mínimas:

- Organization: unidad de aislamiento y política.
- Principal: humano, servicio o agente identificable.
- Agent Identity: identidad operativa limitada.
- Scope: límites explícitos y revocables.
- Policy Decision: resolución de autoridad para una solicitud concreta.
- Binding: vínculo entre decisión, payload y ejecución.
- Evidence: rastro durable de intención, decisión, efecto y resultado.
- Turn: ejecución gobernada con estado.
- Capability: capacidad mediada por Core.
- Knowledge Source: fuente de lectura gobernada.
- Retrieved Knowledge: resultado de lectura bajo scope.
- Context Package: contexto mínimo y trazable.
- Agent Instance: instancia lógica de un agente.
- Workflow Instance: instancia lógica de un workflow.
- Delegation Chain: cadena verificable de delegaciones.

Esto no decide la base de datos, el esquema final ni la estrategia de persistencia.

## 8. Flujo mínimo de ejecución
1. Llega una solicitud.
2. Core crea la correlación.
3. Core resuelve organización e identidad.
4. Core normaliza la intención.
5. Core solicita policy.
6. Si hay efecto, Core crea binding.
7. Core registra evidencia de intención.
8. Core invoca Capability Gateway.
9. Core detecta Point of No Return.
10. Core registra resultado.
11. Si hay incertidumbre, Core marca Unknown Outcome.
12. Core exige reconciliación antes de completar.

## 9. Flujo mínimo de lectura de conocimiento
1. Llega una solicitud de conocimiento.
2. Core resuelve organización e identidad.
3. Core verifica finalidad.
4. Core calcula Retrieval Scope.
5. Knowledge Gateway accede a la Knowledge Source permitida.
6. Core excluye over-fetch.
7. Core estampa procedencia, clasificación, taint y restricciones.
8. Core o Context Assembly controlado por Core compone el contexto.
9. El contexto mínimo se entrega al Context Consumer.
10. Si el conocimiento se usa para un efecto relevante, queda evidencia asociada.

## 10. Flujo mínimo de agente/workflow
1. Se crea un Agent Instance.
2. Se crea un Plan.
3. Cada Plan Step se trata como solicitud potencial.
4. Core evalúa autonomía.
5. Si aplica, Core autoriza una delegación explícita.
6. El Subagent recibe contexto mínimo.
7. Inter-Agent Output se trata como contenido no confiable.
8. Core compone efectos a través de subagentes, ramas y tiempo.
9. Si se exceden límites, Core escala o bloquea.
10. El cierre solo ocurre si no hay Unknown Outcome pendiente.

## 11. Policy, Decision Binding y Evidence
Policy decide si una solicitud puede avanzar, qué límites aplica y qué obligaciones impone. Decision Binding ata esa decisión a una ejecución concreta. Evidence prueba qué se decidió, qué se intentó, qué se hizo y qué resultado hubo.

No debe existir efecto externo relevante sin un binding válido cuando aplique. Policy sin binding no ejecuta. Binding sin evidencia no satisface trazabilidad.

## 12. Estados, reanudación y Unknown Outcome
Core v1 debe soportar al menos estos estados conceptuales:

- Created
- Evaluating
- Waiting for Approval
- Executing
- Waiting for External Result
- Waiting for Reconciliation
- Completed
- Failed
- Cancelled
- Expired

`Unknown Outcome` bloquea `Completed` y exige reconciliación. Reanudar una ejecución requiere volver a validar contexto, policy, bindings, identidad y límites aplicables.

## 13. Tools, Integrations y Extensions
- Una Tool no decide autoridad.
- Una Integration no decide autoridad.
- Una Extension es no confiable por defecto.
- Las credenciales externas se confinan.
- Toda invocación pasa por Capability Gateway.

## 14. Seguridad multi-tenant
- Ninguna memoria entre organizaciones.
- Ningún contexto cruzado.
- Ningún cache compartido sin aislamiento.
- Ningún agente puede elegir organización.
- Toda evidencia está separada por organización.
- Toda lectura y efecto se evalúa bajo organización.

## 15. Test suite de cumplimiento

### RFC-0003
- no external effect without governed request;
- no replayed binding;
- composite effect requires composition evaluation.

### RFC-0004
- no cross-tenant identity;
- revoked scope blocks execution;
- delegated identity cannot exceed principal.

### RFC-0005
- missing critical attribute fails closed;
- deny is terminal;
- obligations are all-or-nothing.

### RFC-0006
- tool cannot self-authorize;
- extension cannot access credentials directly;
- integration metadata is not authority.

### RFC-0007
- invalid binding blocks effect;
- Unknown Outcome cannot become success automatically;
- Point of No Return is evidenced.

### RFC-0008
- cancelled turn does not imply no effect;
- resumed turn revalidates context;
- Completed blocked by reconciliation.

### RFC-0009
- broad credential does not expand Retrieval Scope;
- over-fetch excluded before Context Assembly;
- stale derived knowledge cannot be reused without validation.

### RFC-0010
- plan is not authorization;
- inter-agent output is untrusted;
- delegation never amplifies authority;
- fragmented effects across subagents/time still require composed evaluation.

## 16. Orden recomendado de implementación

### Phase 0 — Repository and contracts
- carpetas;
- tipos conceptuales;
- documentación de invariantes;
- test skeleton.

### Phase 1 — Organization, Identity and Policy skeleton
- resolver organization context;
- resolver identity context;
- policy decision stub determinista;
- fail-closed básico.

### Phase 2 — Evidence and Binding
- evidence records;
- binding creation and validation;
- no effect without binding.

### Phase 3 — Turn Runtime
- turn states;
- cancellation;
- unknown outcome;
- reconciliation placeholder.

### Phase 4 — Capability Gateway
- tool invocation path;
- integration credential confinement placeholder;
- extension boundary placeholder.

### Phase 5 — Knowledge Gateway
- knowledge request;
- retrieval scope;
- provenance/classification/taint placeholders;
- context package.

### Phase 6 — Agent/Workflow minimal runtime
- agent instance;
- workflow instance;
- plan step;
- delegation chain;
- inter-agent output untrusted;
- anti-fragmentation checks as policy hook.

### Phase 7 — Compliance tests
- convert RFC invariants to executable tests;
- regression gates.

## 17. Stubs permitidos
- Policy Engine puede empezar con reglas deterministas en memoria.
- Evidence Ledger puede empezar append-only local.
- Binding Store puede empezar en memoria o fichero local.
- Knowledge Gateway puede empezar con fuente mock.
- Capability Gateway puede empezar con tools mock.
- Agent Runtime puede empezar con planes manuales, sin LLM.
- Approval puede empezar como decisión simulada.

Los stubs deben mantener el contrato de seguridad, aunque no sean producción.

## 18. Riesgos técnicos principales
- convertir policy en ifs dispersos;
- dejar que tools llamen APIs directamente;
- mezclar memoria con autorización;
- no modelar Unknown Outcome;
- no registrar evidencia antes de efectos;
- dejar que agentes decidan su propio contexto;
- tratar output inter-agente como confiable;
- implementar RAG antes de Retrieval Scope;
- crear workflows antes de bindings;
- meter LLM demasiado pronto.

## 19. Criterios de aceptación de Core v1
Core v1 se considera aceptable cuando:

- existe una ruta mínima de ejecución gobernada;
- existe una ruta mínima de lectura gobernada;
- existe una ruta mínima de agente/workflow;
- todas pasan por Core;
- hay evidence records;
- hay policy decisions;
- hay bindings para efectos relevantes;
- hay tests negativos;
- no hay rutas laterales;
- los stubs respetan los RFC;
- README explica cómo ejecutar tests.

## 20. Referencias RFC
- RFC-0000: define el proceso normativo que legitima este plan.
- RFC-0001: fija la dirección fundacional de Kern y la responsabilidad empresarial.
- RFC-0002: define el control plane, la separación de fronteras y el desacoplamiento lógico.
- RFC-0003: exige ejecución gobernada, solicitudes correlacionadas y verificación antes del efecto.
- RFC-0004: define identidad, tenancy, scopes, delegación y separación de deberes.
- RFC-0005: define la evaluación de policy, el fail-closed y la composición de decisiones.
- RFC-0006: delimita capabilities, tools, integrations y extensiones no confiables.
- RFC-0007: obliga a Decision Binding, evidencia y tratamiento de Unknown Outcome.
- RFC-0008: regula turns, reanudación, reconciliación y estado operativo durable.
- RFC-0009: gobierna lectura de conocimiento, Retrieval Scope y procedencia.
- RFC-0010: limita agentes, workflows, delegación y fragmentación de efectos.

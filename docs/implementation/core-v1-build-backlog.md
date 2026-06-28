# Core v1 Build Backlog
- **Estado:** Draft build backlog
- **Fecha:** 2026-06-28
- **Base:** Core v1 Implementation Plan
- **Base normativa:** RFC-0000 a RFC-0010 Accepted
- **Objetivo:** Dividir Core v1 en épicas y tareas implementables, manteniendo las garantías fundacionales antes de escribir código de producto.

## 1. Resumen ejecutivo
Este backlog transforma el plan Core v1 en trabajo ejecutable por fases, sin decidir todavía stack final ni arquitectura de producto. Su propósito es convertir garantías normativas en tareas documentales, contratos conceptuales, pruebas negativas y stubs seguros.

El objetivo de Core v1 no es crear una experiencia final de producto, sino construir el camino mínimo por el que toda ejecución, lectura, agente, tool o workflow tenga que pasar por Core.

El backlog prioriza seguridad, aislamiento, trazabilidad y pruebas negativas antes que inteligencia, automatización avanzada o experiencia visual.

## 2. Reglas del backlog
- Cada tarea debe mapear a uno o más RFC.
- Ninguna tarea puede introducir una ruta lateral fuera de Core.
- Todo stub debe respetar el contrato de seguridad.
- Cada módulo debe tener pruebas negativas.
- No se implementan integraciones reales antes de Capability Gateway.
- No se implementa RAG real antes de Knowledge Gateway.
- No se implementa autonomía real antes de Agent/Workflow Runtime mínimo.
- No se añade LLM hasta que los contratos básicos estén definidos.
- No se mezcla memoria con autorización.
- No se permite efecto externo sin policy/binding cuando aplique.

## 3. Definición de Done global
Una tarea solo está done si:

- compila o valida según el stack que se elija después;
- tiene tests mínimos;
- tiene al menos un test negativo cuando toca seguridad;
- no rompe RFCs;
- no crea rutas laterales;
- documenta el contrato que introduce;
- mantiene separación por organización;
- falla cerrado ante ambigüedad crítica;
- deja trazabilidad suficiente;
- no introduce dependencia tecnológica no aprobada.

Como todavía no se ha elegido stack, esta definición es conceptual hasta que haya implementación.

## 4. Épicas de Core v1

### EPIC-00 Repository foundation
- Propósito: preparar la base documental y de contratos sin escribir código de producto.
- RFCs relacionados: RFC-0000, RFC-0001, RFC-0002.
- Entregables: estructura de documentación, mapa de contratos, índice de invariantes, checklist fail-closed.
- Dependencias: ninguna.
- No objetivos: implementar runtime, UI o integraciones reales.

### EPIC-01 Core contracts
- Propósito: fijar nombres y responsabilidades de los contratos conceptuales.
- RFCs relacionados: RFC-0003 a RFC-0010.
- Entregables: catálogo de contratos, campos conceptuales mínimos, reglas de exclusión.
- Dependencias: EPIC-00.
- No objetivos: modelado físico de datos ni APIs finales.

### EPIC-02 Organization and Identity Context
- Propósito: resolver organización e identidad antes de cualquier efecto.
- RFCs relacionados: RFC-0004.
- Entregables: OrganizationContext, IdentityContext, validaciones y revocación.
- Dependencias: EPIC-01.
- No objetivos: suplantación, federación o login productivo.

### EPIC-03 Policy Engine skeleton
- Propósito: establecer decisión de policy fail-closed y obligaciones.
- RFCs relacionados: RFC-0005.
- Entregables: PolicyDecision conceptual, obligations, negación terminal, stub determinista.
- Dependencias: EPIC-02.
- No objetivos: motor de policy final ni reglas dispersas.

### EPIC-04 Evidence Ledger
- Propósito: conservar evidencia durable y correlacionada.
- RFCs relacionados: RFC-0007, RFC-0008.
- Entregables: EvidenceRecord, ledger append-only conceptual, trazabilidad durable.
- Dependencias: EPIC-03.
- No objetivos: diseño final de persistencia.

### EPIC-05 Decision Binding Store
- Propósito: atar policy a ejecución concreta y bloquear replay.
- RFCs relacionados: RFC-0003, RFC-0007.
- Entregables: DecisionBinding, validación effect-time, invalidación por cambios relevantes.
- Dependencias: EPIC-03 y EPIC-04.
- No objetivos: autorización reutilizable o bindings globales.

### EPIC-06 Turn Runtime
- Propósito: representar Turns y estados de ejecución gobernada.
- RFCs relacionados: RFC-0008.
- Entregables: Turn, máquina de estados, Unknown Outcome, reanudación gobernada.
- Dependencias: EPIC-04 y EPIC-05.
- No objetivos: orquestación avanzada ni checkpoints de producto.

### EPIC-07 Capability Gateway
- Propósito: mediar Tools, Integrations y Extensions.
- RFCs relacionados: RFC-0006, RFC-0007.
- Entregables: CapabilityInvocation, límites, confinamiento de credenciales, precondiciones.
- Dependencias: EPIC-05.
- No objetivos: conectores reales directos o autoridad local de tools.

### EPIC-08 Knowledge Gateway
- Propósito: leer conocimiento gobernado bajo Retrieval Scope.
- RFCs relacionados: RFC-0009.
- Entregables: KnowledgeRequest, RetrievedKnowledge, ContextPackage, exclusión de over-fetch.
- Dependencias: EPIC-02 y EPIC-04.
- No objetivos: RAG avanzado ni cachés compartidos sin aislamiento.

### EPIC-09 Agent/Workflow Runtime
- Propósito: ejecutar agentes y workflows mínimos sin autoridad propia.
- RFCs relacionados: RFC-0010.
- Entregables: AgentInstance, WorkflowInstance, PlanStep, Delegation, InterAgentOutput.
- Dependencias: EPIC-02, EPIC-05, EPIC-06 y EPIC-08.
- No objetivos: multiagente distribuido complejo ni planificación autónoma avanzada.

### EPIC-10 Compliance Test Suite
- Propósito: convertir invariantes RFC en pruebas ejecutables.
- RFCs relacionados: RFC-0003 a RFC-0010.
- Entregables: tests negativos, gates de regresión, suite de cumplimiento documental.
- Dependencias: EPIC-01 a EPIC-09.
- No objetivos: tests cosméticos sin bloqueo real.

### EPIC-11 Developer documentation
- Propósito: explicar cómo trabajar sobre Core v1 sin romper garantías.
- RFCs relacionados: RFC-0000 a RFC-0010.
- Entregables: guías de contribución, orden de implementación, definiciones operativas.
- Dependencias: EPIC-00 a EPIC-10.
- No objetivos: material de marketing o documentación de producto final.

## 5. Backlog Phase 0 — Repository and contracts

### TASK-0001 — Define Core v1 source layout proposal
- **Épica:** EPIC-00
- **Tipo:** docs
- **RFCs:** RFC-0000, RFC-0002, RFC-0003
- **Depende de:** None
- **Objetivo:** proponer estructura de carpetas sin implementarla todavía.
- **Entregables:**
  - propuesta de carpetas para core;
  - propuesta de carpetas para contracts;
  - propuesta de carpetas para tests;
  - propuesta de carpetas para docs y adapters.
- **Criterios de aceptación:**
  - la propuesta no crea carpetas reales;
  - la propuesta no elige stack;
  - la propuesta respeta aislamiento por organización.
- **Tests mínimos:**
  - verificación documental de carpetas previstas;
  - revisión de dependencias entre carpetas.
- **Tests negativos:**
  - no se introducen carpetas de producto final;
  - no se introduce código real.
- **Fuera de alcance:**
  - crear carpetas reales de código.

### TASK-0002 — Define canonical contract naming
- **Épica:** EPIC-01
- **Tipo:** docs
- **RFCs:** RFC-0003, RFC-0004, RFC-0005, RFC-0006, RFC-0007, RFC-0008, RFC-0009, RFC-0010
- **Depende de:** None
- **Objetivo:** fijar nombres conceptuales de contratos.
- **Entregables:**
  - lista canónica de contratos;
  - glosario de responsabilidad;
  - exclusiones de autoridad.
- **Criterios de aceptación:**
  - los nombres son estables;
  - no se mezclan responsabilidades;
  - no se asigna autoridad implícita.
- **Tests mínimos:**
  - coherencia de nombres entre módulos;
  - presencia de todos los contratos requeridos.
- **Tests negativos:**
  - ningún contrato permite autoautorización;
  - ningún contrato es ambiguo sobre organización.
- **Fuera de alcance:**
  - tipos de código concretos.

### TASK-0003 — Create RFC invariant index
- **Épica:** EPIC-00
- **Tipo:** docs
- **RFCs:** RFC-0003, RFC-0004, RFC-0005, RFC-0006, RFC-0007, RFC-0008, RFC-0009, RFC-0010
- **Depende de:** None
- **Objetivo:** listar invariantes de RFC-0003 a RFC-0010 que deben convertirse en tests.
- **Entregables:**
  - índice de invariantes por RFC;
  - referencias cruzadas a fases del backlog.
- **Criterios de aceptación:**
  - cada RFC tiene invariantes indexados;
  - el índice es trazable.
- **Tests mínimos:**
  - comprobación de cobertura por RFC;
  - comprobación de cobertura por tipo de invariantes.
- **Tests negativos:**
  - ningún RFC queda sin índice;
  - ningún invariante queda sin propietario de backlog.
- **Fuera de alcance:**
  - implementación de tests ejecutables.

### TASK-0004 — Define fail-closed checklist
- **Épica:** EPIC-00
- **Tipo:** docs/test
- **RFCs:** RFC-0003, RFC-0004, RFC-0005, RFC-0006, RFC-0007, RFC-0008, RFC-0009, RFC-0010
- **Depende de:** TASK-0002, TASK-0003
- **Objetivo:** documentar cuándo Core debe fallar cerrado.
- **Entregables:**
  - checklist fail-closed;
  - mapa de atributos críticos;
  - criterios de bloqueo.
- **Criterios de aceptación:**
  - cubre atributos críticos ausentes;
  - cubre organización ambigua;
  - cubre identidad inválida;
  - cubre policy deny;
  - cubre binding inválido;
  - cubre unknown outcome;
  - cubre over-fetch;
  - cubre inter-agent output no confiable.
- **Tests mínimos:**
  - atributos críticos ausentes;
  - identidad inválida;
  - policy deny;
  - binding inválido.
- **Tests negativos:**
  - no se permite avance con ambigüedad;
  - no se permite bypass documental.
- **Fuera de alcance:**
  - lógica de enforcement implementada.

## 6. Backlog Phase 1 — Organization, Identity and Policy skeleton

### TASK-0101 — Define OrganizationContext contract
- **Épica:** EPIC-02
- **Tipo:** contract
- **RFCs:** RFC-0004
- **Depende de:** TASK-0002
- **Objetivo:** definir organización antes de toda ejecución.
- **Entregables:**
  - `organization_id`;
  - `organization_state`;
  - `source`;
  - `resolved_at`;
  - `isolation_boundary`;
  - `revocation_version`.
- **Criterios de aceptación:**
  - la organización es obligatoria;
  - el contexto es organization-scoped;
  - la revocación es verificable.
- **Tests mínimos:**
  - organización presente;
  - organización válida;
  - organización revocada bloqueada.
- **Tests negativos:**
  - organización ausente;
  - organización ambigua;
  - organización inactiva;
  - intento de elegir organización desde Agent.
- **Fuera de alcance:**
  - federación completa.

### TASK-0102 — Define IdentityContext contract
- **Épica:** EPIC-02
- **Tipo:** contract
- **RFCs:** RFC-0004
- **Depende de:** TASK-0101
- **Objetivo:** definir identidad humana, de servicio o agente.
- **Entregables:**
  - `principal_id`;
  - `principal_type`;
  - `delegated_identity`;
  - `scopes`;
  - `auth_method`;
  - `resolved_at`;
  - `revocation_version`.
- **Criterios de aceptación:**
  - la identidad es explícita;
  - la identidad delegada es limitada;
  - la revocación se comprueba.
- **Tests mínimos:**
  - identidad humana válida;
  - identidad de servicio válida;
  - identidad delegada válida.
- **Tests negativos:**
  - usuario revocado;
  - scope ausente;
  - agente intentando suplantar humano;
  - identidad delegada excede principal.
- **Fuera de alcance:**
  - login final o UX de autenticación.

### TASK-0103 — Define PolicyDecision contract
- **Épica:** EPIC-03
- **Tipo:** contract
- **RFCs:** RFC-0005
- **Depende de:** TASK-0101, TASK-0102
- **Objetivo:** representar allow/deny/defer y obligaciones.
- **Entregables:**
  - `allow`;
  - `deny`;
  - `defer`;
  - `obligations`;
  - atributos críticos ausentes;
  - `decision_reason`;
  - `evaluated_at`;
  - `policy_version`.
- **Criterios de aceptación:**
  - `deny` es terminal;
  - `defer` bloquea hasta resolución;
  - obligaciones son verificables.
- **Tests mínimos:**
  - allow con obligaciones;
  - deny terminal;
  - defer bloqueante.
- **Tests negativos:**
  - atributo crítico ausente falla cerrado;
  - deny ignorado;
  - obligaciones incompletas bloquean ejecución.
- **Fuera de alcance:**
  - motor de policy final.

### TASK-0104 — Define deterministic Policy Engine stub
- **Épica:** EPIC-03
- **Tipo:** skeleton / implementation-placeholder
- **RFCs:** RFC-0005
- **Depende de:** TASK-0103
- **Objetivo:** stub conceptual para permitir tests sin elegir motor real.
- **Entregables:**
  - stub determinista;
  - respuesta fail-closed;
  - contrato de entrada/salida.
- **Criterios de aceptación:**
  - no es policy final;
  - no decide autoridad fuera del contrato;
  - permite tests negativos.
- **Tests mínimos:**
  - allow básico;
  - deny básico;
  - defer básico;
  - missing critical attribute basic.
- **Tests negativos:**
  - no autoriza sin atributos críticos;
  - no ignora deny;
  - no convierte defer en allow.
- **Fuera de alcance:**
  - reglas dispersas en código de producto.

## 7. Backlog Phase 2 — Evidence and Decision Binding

### TASK-0201 — Define EvidenceRecord contract
- **Épica:** EPIC-04
- **Tipo:** contract
- **RFCs:** RFC-0007, RFC-0008
- **Depende de:** TASK-0103
- **Objetivo:** registrar evidencia durable de la ejecución.
- **Entregables:**
  - `intent`;
  - `policy decision`;
  - `approval`;
  - `binding`;
  - `invocation`;
  - `Point of No Return`;
  - `result`;
  - `Unknown Outcome`;
  - `reconciliation`.
- **Criterios de aceptación:**
  - la evidencia es correlacionada;
  - la evidencia es durable;
  - la reconciliación queda registrada.
- **Tests mínimos:**
  - intención con correlación;
  - resultado con correlación;
  - reconciliación con evento previo.
- **Tests negativos:**
  - efecto sin evidencia de intención;
  - resultado sin correlación;
  - reconciliación sin evento previo.
- **Fuera de alcance:**
  - formato físico de almacenamiento.

### TASK-0202 — Define append-only Evidence Ledger stub
- **Épica:** EPIC-04
- **Tipo:** skeleton / implementation-placeholder
- **RFCs:** RFC-0007, RFC-0008
- **Depende de:** TASK-0201
- **Objetivo:** mantener un ledger append-only conceptual y reemplazable.
- **Entregables:**
  - ledger conceptual append-only;
  - scope por organización;
  - correlación obligatoria;
  - no borrar evidencia por cancelación.
- **Criterios de aceptación:**
  - el ledger no borra entradas;
  - el ledger no mezcla organizaciones;
  - el ledger permite auditoría.
- **Tests mínimos:**
  - append de evidencia;
  - consulta por correlación;
  - separación por organización.
- **Tests negativos:**
  - intento de borrado;
  - mezcla entre organizaciones;
  - cancelación que elimina evidencia.
- **Fuera de alcance:**
  - elección de base de datos.

### TASK-0203 — Define DecisionBinding contract
- **Épica:** EPIC-05
- **Tipo:** contract
- **RFCs:** RFC-0003, RFC-0007
- **Depende de:** TASK-0103, TASK-0201
- **Objetivo:** asociar decisión, payload y evidencia a una ejecución concreta.
- **Entregables:**
  - `binding_id`;
  - `organization_id`;
  - `principal`;
  - `delegated_identity`;
  - `request_hash` conceptual;
  - `payload_reference` conceptual;
  - `policy_decision_id`;
  - `obligations`;
  - `expiry`;
  - `binding_state`;
  - `evidence_reference`.
- **Criterios de aceptación:**
  - el binding es organization-scoped;
  - el binding expira;
  - el binding se puede invalidar.
- **Tests mínimos:**
  - binding válido;
  - binding expirado bloqueado;
  - binding con obligaciones completas.
- **Tests negativos:**
  - binding caducado;
  - binding de otra organización;
  - payload distinto;
  - replay;
  - obligaciones no cumplidas.
- **Fuera de alcance:**
  - binding reutilizable globalmente.

### TASK-0204 — Define Binding validation flow
- **Épica:** EPIC-05
- **Tipo:** docs/test
- **RFCs:** RFC-0003, RFC-0007
- **Depende de:** TASK-0203
- **Objetivo:** describir creación y validación del binding antes y durante el efecto.
- **Entregables:**
  - flujo de creación antes de efecto;
  - validación en effect-time;
  - invalidación por cambios relevantes;
  - rechazo ante replay.
- **Criterios de aceptación:**
  - ningún efecto relevante pasa sin binding válido;
  - los cambios relevantes invalidan el binding.
- **Tests mínimos:**
  - validación previa;
  - validación effect-time;
  - invalidación por cambio.
- **Tests negativos:**
  - replay permitido;
  - binding viejo aceptado;
  - binding distinto de payload aceptado.
- **Fuera de alcance:**
  - implementación física de firmas.

## 8. Backlog Phase 3 — Turn Runtime

### TASK-0301 — Define Turn contract
- **Épica:** EPIC-06
- **Tipo:** contract
- **RFCs:** RFC-0008
- **Depende de:** TASK-0201, TASK-0203
- **Objetivo:** representar un Turn de ejecución gobernada.
- **Entregables:**
  - `turn_id`;
  - `organization_id`;
  - `actor`;
  - `state`;
  - `execution_context`;
  - `pending_effects`;
  - `unknown_outcomes`;
  - `evidence_links`;
  - `created_at`;
  - `updated_at`.
- **Criterios de aceptación:**
  - el Turn es correlacionado;
  - el Turn es organization-scoped;
  - el Turn admite reconciliación.
- **Tests mínimos:**
  - creación de Turn;
  - transición de estado;
  - asociación de evidencia.
- **Tests negativos:**
  - estado sin correlación;
  - actor sin organización;
  - pending effect sin evidencia.
- **Fuera de alcance:**
  - scheduler o colas reales.

### TASK-0302 — Define Turn state machine
- **Épica:** EPIC-06
- **Tipo:** docs/test
- **RFCs:** RFC-0008
- **Depende de:** TASK-0301
- **Objetivo:** definir la máquina de estados mínima de un Turn.
- **Entregables:**
  - estados Created, Evaluating, Waiting for Approval, Executing, Waiting for External Result, Waiting for Reconciliation, Completed, Failed, Cancelled, Expired;
  - reglas de transición;
  - bloqueo de Completed por Unknown Outcome.
- **Criterios de aceptación:**
  - Completed no ocurre con Unknown Outcome;
  - cancelación no implica no efecto;
  - reanudación exige revalidación.
- **Tests mínimos:**
  - transición válida;
  - Waiting for Reconciliation;
  - Expired tras plazo.
- **Tests negativos:**
  - Completed con Unknown Outcome;
  - cancelación interpretada como no efecto;
  - reanudación sin revalidar contexto.
- **Fuera de alcance:**
  - optimización de workflow engine.

### TASK-0303 — Define Unknown Outcome handling
- **Épica:** EPIC-06
- **Tipo:** contract
- **RFCs:** RFC-0008
- **Depende de:** TASK-0301, TASK-0302
- **Objetivo:** cubrir detección y reconciliación de resultados inciertos.
- **Entregables:**
  - detección;
  - bloqueo de Completed;
  - necesidad de reconciliación;
  - no replay automático;
  - evidencia.
- **Criterios de aceptación:**
  - Unknown Outcome no se resuelve solo;
  - toda reconciliación deja evidencia.
- **Tests mínimos:**
  - detección de incertidumbre;
  - bloqueo de cierre;
  - registro de reconciliación.
- **Tests negativos:**
  - Unknown Outcome convertido en success automáticamente;
  - replay automático;
  - cierre sin evidencia.
- **Fuera de alcance:**
  - heurísticas de producto para reconciliación.

## 9. Backlog Phase 4 — Capability Gateway

### TASK-0401 — Define CapabilityInvocation contract
- **Épica:** EPIC-07
- **Tipo:** contract
- **RFCs:** RFC-0006, RFC-0007
- **Depende de:** TASK-0203, TASK-0301
- **Objetivo:** representar una invocación mediatizada de capability.
- **Entregables:**
  - `capability_id`;
  - `organization_id`;
  - `identity_context`;
  - `input_reference`;
  - `classification`;
  - `binding_required`;
  - `binding_id`;
  - `evidence_id`;
  - `invocation_state`.
- **Criterios de aceptación:**
  - la invocación depende de Core;
  - la invocación no contiene autoridad propia;
  - la invocación puede bloquearse.
- **Tests mínimos:**
  - invocación permitida;
  - invocación denegada;
  - invocación con binding.
- **Tests negativos:**
  - invocation sin binding;
  - invocation cross-tenant;
  - invocation with stale evidence.
- **Fuera de alcance:**
  - conectores productivos.

### TASK-0402 — Define Tool boundary
- **Épica:** EPIC-07
- **Tipo:** docs/test
- **RFCs:** RFC-0006
- **Depende de:** TASK-0401
- **Objetivo:** delimitar Tool sin autoridad.
- **Entregables:**
  - reglas de autorización;
  - confinamiento de credenciales;
  - validación de binding;
  - procedencia de resultados.
- **Criterios de aceptación:**
  - Tool no decide autoridad;
  - Tool no recibe credenciales fuera de scope;
  - Tool devuelve resultado con procedencia.
- **Tests mínimos:**
  - Tool con binding válido;
  - Tool con credencial confinada;
  - Tool con resultado trazable.
- **Tests negativos:**
  - Tool autoautorizada;
  - Tool con credencial fuera de scope;
  - Tool sin procedencia.
- **Fuera de alcance:**
  - APIs reales directas.

### TASK-0403 — Define Integration boundary
- **Épica:** EPIC-07
- **Tipo:** docs/test
- **RFCs:** RFC-0006
- **Depende de:** TASK-0401
- **Objetivo:** delimitar Integration sin autoridad.
- **Entregables:**
  - metadata no-autoridad;
  - credenciales confinadas;
  - organización obligatoria;
  - no effects outside Gateway.
- **Criterios de aceptación:**
  - Integration no ejecuta por sí misma;
  - Integration no amplía scopes.
- **Tests mínimos:**
  - metadata aceptada como dato;
  - credencial confinada;
  - organización obligatoria.
- **Tests negativos:**
  - metadata tratada como autoridad;
  - credencial fuera de scope;
  - efecto directo fuera de Gateway.
- **Fuera de alcance:**
  - integraciones reales en producción.

### TASK-0404 — Define Extension boundary
- **Épica:** EPIC-07
- **Tipo:** docs/test
- **RFCs:** RFC-0006
- **Depende de:** TASK-0401
- **Objetivo:** dejar claro que las extensions son no confiables por defecto.
- **Entregables:**
  - boundary de extensión;
  - telemetría gobernada;
  - no acceso directo a credenciales;
  - no bypass de Core.
- **Criterios de aceptación:**
  - la extensión no obtiene autoridad local;
  - la extensión no toca credenciales directamente.
- **Tests mínimos:**
  - extensión permitida por Core;
  - telemetría gobernada;
  - boundary de autorización.
- **Tests negativos:**
  - extensión autoautorizada;
  - acceso directo a credenciales;
  - bypass de Core.
- **Fuera de alcance:**
  - marketplace de extensiones.

### TASK-0405 — Define mock capability for tests
- **Épica:** EPIC-07
- **Tipo:** skeleton / implementation-placeholder
- **RFCs:** RFC-0006, RFC-0007, RFC-0008
- **Depende de:** TASK-0402, TASK-0403, TASK-0404
- **Objetivo:** permitir probar efectos permitidos y bloqueados sin integración real.
- **Entregables:**
  - mock permitida;
  - mock denegada;
  - mock con binding inválido;
  - mock de Unknown Outcome.
- **Criterios de aceptación:**
  - la mock respeta Gateway;
  - la mock no simula autoridad propia.
- **Tests mínimos:**
  - efecto permitido;
  - efecto denegado;
  - binding inválido;
  - unknown outcome simulado.
- **Tests negativos:**
  - mock autoautorizada;
  - mock con credencial fuera de scope;
  - mock que salta Evidence.
- **Fuera de alcance:**
  - proveedor externo real.

## 10. Backlog Phase 5 — Knowledge Gateway

### TASK-0501 — Define KnowledgeRequest contract
- **Épica:** EPIC-08
- **Tipo:** contract
- **RFCs:** RFC-0009
- **Depende de:** TASK-0101, TASK-0102
- **Objetivo:** representar una lectura gobernada.
- **Entregables:**
  - `organization_id`;
  - `identity_context`;
  - `purpose`;
  - `retrieval_scope`;
  - `source_id`;
  - `requested_fields`;
  - `classification_limit`;
  - `destination`;
  - `correlation_id`.
- **Criterios de aceptación:**
  - la petición es organization-scoped;
  - retrieval scope es explícito;
  - la finalidad es verificable.
- **Tests mínimos:**
  - solicitud válida;
  - scope válido;
  - destino válido.
- **Tests negativos:**
  - broad credential expands scope;
  - organización ausente;
  - finalidad ambigua.
- **Fuera de alcance:**
  - RAG avanzado.

### TASK-0502 — Define RetrievedKnowledge contract
- **Épica:** EPIC-08
- **Tipo:** contract
- **RFCs:** RFC-0009
- **Depende de:** TASK-0501
- **Objetivo:** representar el conocimiento leído bajo control.
- **Entregables:**
  - `source`;
  - `provenance`;
  - `classification`;
  - `taint`;
  - `restrictions`;
  - `obligations`;
  - `freshness`;
  - `scope_match`;
  - `excluded_overfetch_reference` conceptual.
- **Criterios de aceptación:**
  - la procedencia se conserva;
  - el over-fetch queda excluido;
  - la frescura es verificable.
- **Tests mínimos:**
  - procedencia conservada;
  - scope match correcto;
  - freshness válida.
- **Tests negativos:**
  - over-fetch llega a Context Assembly;
  - stale derived knowledge reused without validation;
  - taint perdida.
- **Fuera de alcance:**
  - esquema físico de índices.

### TASK-0503 — Define ContextPackage contract
- **Épica:** EPIC-08
- **Tipo:** contract
- **RFCs:** RFC-0009
- **Depende de:** TASK-0502
- **Objetivo:** entregar contexto mínimo y trazable.
- **Entregables:**
  - allowed knowledge;
  - provenance map;
  - classification;
  - taint;
  - restrictions;
  - expiry;
  - consumer;
  - evidence links when needed.
- **Criterios de aceptación:**
  - el paquete es mínimo;
  - el paquete preserva restricciones;
  - el paquete no expone over-fetch.
- **Tests mínimos:**
  - paquete mínimo;
  - paquete con procedencia;
  - paquete con restricciones.
- **Tests negativos:**
  - contexto cruzado;
  - taint perdida;
  - over-fetch incluido.
- **Fuera de alcance:**
  - serialización final.

### TASK-0504 — Define over-fetch exclusion tests
- **Épica:** EPIC-08
- **Tipo:** test
- **RFCs:** RFC-0009
- **Depende de:** TASK-0501, TASK-0502, TASK-0503
- **Objetivo:** bloquear fuga de contexto o expansión de lectura.
- **Entregables:**
  - tests de exclusión;
  - tests de derivado obsoleto;
  - tests de control de scope.
- **Criterios de aceptación:**
  - el scope no se amplía;
  - el over-fetch no llega a Context Assembly.
- **Tests mínimos:**
  - scope correcto;
  - exclusión previa a assembly;
  - validación de freshness.
- **Tests negativos:**
  - broad credential expands scope;
  - over-fetch reaches Context Package;
  - stale derived knowledge used.
- **Fuera de alcance:**
  - heurísticas de ranking reales.

### TASK-0505 — Define mock Knowledge Source
- **Épica:** EPIC-08
- **Tipo:** skeleton / implementation-placeholder
- **RFCs:** RFC-0009
- **Depende de:** TASK-0501
- **Objetivo:** permitir lectura gobernada sin integración real.
- **Entregables:**
  - fuente mock;
  - resultados trazables;
  - procedencia simulada;
  - restricciones simuladas.
- **Criterios de aceptación:**
  - la fuente mock no amplía scope;
  - la fuente mock permite tests negativos.
- **Tests mínimos:**
  - lectura mock válida;
  - scope mínimo;
  - procedencia preservada.
- **Tests negativos:**
  - fuente mock con over-fetch;
  - fuente mock sin procedencia;
  - fuente mock fuera de organización.
- **Fuera de alcance:**
  - proveedor de conocimiento real.

## 11. Backlog Phase 6 — Agent/Workflow minimal runtime

### TASK-0601 — Define AgentInstance contract
- **Épica:** EPIC-09
- **Tipo:** contract
- **RFCs:** RFC-0010
- **Depende de:** TASK-0101, TASK-0102
- **Objetivo:** representar una instancia de agente limitada.
- **Entregables:**
  - `agent_id`;
  - `organization_id`;
  - `agent_identity`;
  - `role`;
  - `autonomy_boundary`;
  - `supervisor`;
  - `sponsor`;
  - `state`;
  - `memory_reference`;
  - `evidence_links`.
- **Criterios de aceptación:**
  - el agente no tiene autoridad propia;
  - la organización es explícita;
  - el estado es verificable.
- **Tests mínimos:**
  - agente en organización válida;
  - agente con sponsor;
  - agente con evidencia.
- **Tests negativos:**
  - agente sin organización;
  - memoria como autoridad;
  - estado sin correlación.
- **Fuera de alcance:**
  - identidad humana simulada.

### TASK-0602 — Define WorkflowInstance contract
- **Épica:** EPIC-09
- **Tipo:** contract
- **RFCs:** RFC-0010
- **Depende de:** TASK-0601
- **Objetivo:** representar un workflow sin autoridad global.
- **Entregables:**
  - `workflow_id`;
  - `organization_id`;
  - `plan`;
  - `state`;
  - `delegation_chain`;
  - `pending_steps`;
  - `unknown_outcomes`;
  - `evidence_links`.
- **Criterios de aceptación:**
  - el workflow es organization-scoped;
  - el workflow no equivale a permiso;
  - el workflow conserva evidencia.
- **Tests mínimos:**
  - workflow creado;
  - workflow con plan;
  - workflow con evidencia.
- **Tests negativos:**
  - workflow global permission;
  - workflow sin organización;
  - workflow con unknown outcome ignorado.
- **Fuera de alcance:**
  - motor avanzado de workflows.

### TASK-0603 — Define PlanStep contract
- **Épica:** EPIC-09
- **Tipo:** contract
- **RFCs:** RFC-0010
- **Depende de:** TASK-0602
- **Objetivo:** dejar claro que PlanStep es intención propuesta, no autorización.
- **Entregables:**
  - paso planificado;
  - dependencias;
  - intención;
  - posible efecto;
  - límites;
  - correlación.
- **Criterios de aceptación:**
  - PlanStep no concede permiso;
  - cada paso requiere evaluación aplicable.
- **Tests mínimos:**
  - plan step definido;
  - dependencia visible;
  - correlación visible.
- **Tests negativos:**
  - plan ejecutado como autorización;
  - plan sin evaluación;
  - plan con autoridad implícita.
- **Fuera de alcance:**
  - planificación autónoma avanzada.

### TASK-0604 — Define Delegation contract
- **Épica:** EPIC-09
- **Tipo:** contract
- **RFCs:** RFC-0004, RFC-0010
- **Depende de:** TASK-0601, TASK-0603
- **Objetivo:** expresar delegación acotada y revocable.
- **Entregables:**
  - `delegator`;
  - `delegate`;
  - `scope`;
  - `autonomy_limits`;
  - `context_limits`;
  - `chain_depth`;
  - `expiry`;
  - `correlation`;
  - `evidence`.
- **Criterios de aceptación:**
  - la delegación no amplía permisos;
  - la delegación es revocable;
  - la cadena es trazable.
- **Tests mínimos:**
  - delegación válida;
  - expiración visible;
  - evidencia de cadena.
- **Tests negativos:**
  - delegación amplía permisos;
  - delegación circular;
  - subdelegación sin permiso;
  - fan-out multiplica cuota.
- **Fuera de alcance:**
  - autonomía real distribuida.

### TASK-0605 — Define InterAgentOutput contract
- **Épica:** EPIC-09
- **Tipo:** contract
- **RFCs:** RFC-0010
- **Depende de:** TASK-0603, TASK-0604
- **Objetivo:** tratar la salida inter-agente como no confiable.
- **Entregables:**
  - `emitter`;
  - `receiver`;
  - `provenance`;
  - `taint`;
  - `classification`;
  - `restrictions`;
  - `correlation`;
  - `verification_state`.
- **Criterios de aceptación:**
  - no se trata como system instruction;
  - no se acepta autoatestación;
  - conserva trazabilidad.
- **Tests mínimos:**
  - output con procedencia;
  - output con taint;
  - output verificado por Core.
- **Tests negativos:**
  - InterAgentOutput tratado como system instruction;
  - subagent output asumido correcto;
  - autoatestación de taint aceptada sin Core.
- **Fuera de alcance:**
  - canal seguro de agente a agente con autoridad.

### TASK-0606 — Define anti-fragmentation policy hook
- **Épica:** EPIC-09
- **Tipo:** docs/test
- **RFCs:** RFC-0003, RFC-0005, RFC-0010
- **Depende de:** TASK-0602, TASK-0605
- **Objetivo:** impedir que fragmentar trabajo reduzca controles.
- **Entregables:**
  - hook documental de composición;
  - reglas para subagentes, ramas, reintentos y tiempo;
  - escalación cuando no se puede determinar composición.
- **Criterios de aceptación:**
  - la fragmentación no reduce controles;
  - se trata el efecto compuesto relevante;
  - la ambigüedad escala o falla cerrado.
- **Tests mínimos:**
  - efecto compuesto detectado;
  - ramas reunidas por misma finalidad;
  - reintentos tratados como composición.
- **Tests negativos:**
  - fragmentación evita aprobación;
  - fan-out evita evidencia;
  - tiempo divide obligación.
- **Fuera de alcance:**
  - heurística final de coordinación multiagente.

## 12. Backlog Phase 7 — Compliance Test Suite

### TASK-0701 — Create RFC-0003 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0003
- **Depende de:** TASK-0003, TASK-0203, TASK-0606
- **Objetivo:** definir pruebas de gobernanza de ejecución.
- **Tests mínimos:**
  - solicitud gobernada;
  - binding previo a efecto;
  - composición de efectos;
  - evidencia previa a cierre.
- **Tests negativos:**
  - efecto sin solicitud gobernada;
  - replay de binding;
  - ruta lateral;
  - falta de evidencia.

### TASK-0702 — Create RFC-0004 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0004
- **Depende de:** TASK-0101, TASK-0102
- **Objetivo:** definir pruebas de identidad y tenancy.
- **Tests mínimos:**
  - organización válida;
  - identidad válida;
  - scope vigente;
  - delegación acotada.
- **Tests negativos:**
  - cross-tenant identity;
  - revoked scope;
  - self-assigned tenancy;
  - delegated identity exceeds principal.

### TASK-0703 — Create RFC-0005 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0005
- **Depende de:** TASK-0103
- **Objetivo:** definir pruebas de evaluation, obligations y fail-closed.
- **Tests mínimos:**
  - allow with obligations;
  - deny terminal;
  - defer blocked;
  - missing critical attribute fails closed.
- **Tests negativos:**
  - deny ignored;
  - partial obligations;
  - ambiguous attribute accepted;
  - policy bypass.

### TASK-0704 — Create RFC-0006 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0006
- **Depende de:** TASK-0402, TASK-0403, TASK-0404
- **Objetivo:** definir pruebas de tools, integrations y extensions no confiables.
- **Tests mínimos:**
  - tool mediated by Gateway;
  - integration metadata not authority;
  - extension isolated;
  - credentials confined.
- **Tests negativos:**
  - tool self-authorizes;
  - integration bypasses gateway;
  - extension reads credentials directly;
  - telemetry as authority.

### TASK-0705 — Create RFC-0007 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0007
- **Depende de:** TASK-0203, TASK-0204, TASK-0303
- **Objetivo:** definir pruebas de binding, evidencia y Unknown Outcome.
- **Tests mínimos:**
  - invalid binding blocked;
  - Point of No Return recorded;
  - evidence linked to effect;
  - reconciliation required.
- **Tests negativos:**
  - binding replay;
  - Unknown Outcome becomes success;
  - effect without evidence;
  - effect after expiry.

### TASK-0706 — Create RFC-0008 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0008
- **Depende de:** TASK-0301, TASK-0302, TASK-0303
- **Objetivo:** definir pruebas de turn lifecycle y reanudación.
- **Tests mínimos:**
  - cancelled turn retains evidence;
  - resumed turn revalidates context;
  - Completed blocked by reconciliation;
  - Waiting for Reconciliation state exists.
- **Tests negativos:**
  - cancel implies no effect;
  - resume without revalidation;
  - Completed with Unknown Outcome;
  - stale context accepted.

### TASK-0707 — Create RFC-0009 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0009
- **Depende de:** TASK-0501, TASK-0502, TASK-0503
- **Objetivo:** definir pruebas de lectura gobernada y procedencia.
- **Tests mínimos:**
  - broad credential does not expand scope;
  - over-fetch excluded before Context Assembly;
  - provenance preserved;
  - taint preserved.
- **Tests negativos:**
  - stale derived knowledge reused;
  - cross-org cache reuse;
  - over-fetch reaches context package;
  - lack of freshness validation.

### TASK-0708 — Create RFC-0010 compliance tests plan
- **Épica:** EPIC-10
- **Tipo:** test
- **RFCs:** RFC-0010
- **Depende de:** TASK-0601, TASK-0604, TASK-0605, TASK-0606
- **Objetivo:** definir pruebas de agente/workflow, delegación y composición.
- **Tests mínimos:**
  - plan is not authorization;
  - inter-agent output is untrusted;
  - delegation never amplifies authority;
  - composed evaluation applies across subagents/time.
- **Tests negativos:**
  - subagent amplifies permissions;
  - fan-out avoids approval;
  - time-splitting reduces controls;
  - Agent chooses organization.

## 13. Dependencias entre tareas

| Tarea | Depende de | Motivo |
|---|---|---|
| TASK-0001 | None | Arranque documental. |
| TASK-0002 | None | Nombres canónicos antes de contratos. |
| TASK-0003 | None | Índice de invariantes base. |
| TASK-0004 | TASK-0002, TASK-0003 | Necesita nombres e invariantes. |
| TASK-0101 | TASK-0002 | OrganizationContext usa nombres canónicos. |
| TASK-0102 | TASK-0101 | IdentityContext depende de organización. |
| TASK-0103 | TASK-0101, TASK-0102 | Policy usa organización e identidad. |
| TASK-0104 | TASK-0103 | Stub después del contrato. |
| TASK-0201 | TASK-0103 | Evidence registra decisiones. |
| TASK-0202 | TASK-0201 | Ledger depende del contrato. |
| TASK-0203 | TASK-0103, TASK-0201 | Binding depende de policy y evidencia. |
| TASK-0204 | TASK-0203 | Validación depende del contrato. |
| TASK-0301 | TASK-0201, TASK-0203 | Turn necesita evidencia y binding. |
| TASK-0302 | TASK-0301 | Máquina de estados depende de Turn. |
| TASK-0303 | TASK-0301, TASK-0302 | Unknown Outcome depende de estado. |
| TASK-0401 | TASK-0203, TASK-0301 | CapabilityInvocation depende de binding y Turn. |
| TASK-0402 | TASK-0401 | Tool boundary depende de invocación. |
| TASK-0403 | TASK-0401 | Integration boundary depende de invocación. |
| TASK-0404 | TASK-0401 | Extension boundary depende de invocación. |
| TASK-0405 | TASK-0402, TASK-0403, TASK-0404 | Mock capability depende de boundaries. |
| TASK-0501 | TASK-0101, TASK-0102 | KnowledgeRequest usa organización e identidad. |
| TASK-0502 | TASK-0501 | RetrievedKnowledge depende de request. |
| TASK-0503 | TASK-0502 | ContextPackage depende de retrieved knowledge. |
| TASK-0504 | TASK-0501, TASK-0502, TASK-0503 | Tests necesitan los contratos. |
| TASK-0505 | TASK-0501 | Mock source depende de request. |
| TASK-0601 | TASK-0101, TASK-0102 | AgentInstance requiere contexto base. |
| TASK-0602 | TASK-0601 | WorkflowInstance depende del agente. |
| TASK-0603 | TASK-0602 | PlanStep depende del workflow. |
| TASK-0604 | TASK-0601, TASK-0603 | Delegation depende de agente y plan. |
| TASK-0605 | TASK-0603, TASK-0604 | InterAgentOutput depende de interacción. |
| TASK-0606 | TASK-0602, TASK-0605 | Hook anti-fragmentación depende de workflow y output. |
| TASK-0701 | TASK-0003, TASK-0203, TASK-0606 | Tests RFC-0003 dependen de invariantes y binding. |
| TASK-0702 | TASK-0101, TASK-0102 | Tests RFC-0004 dependen de contexto base. |
| TASK-0703 | TASK-0103 | Tests RFC-0005 dependen de policy. |
| TASK-0704 | TASK-0402, TASK-0403, TASK-0404 | Tests RFC-0006 dependen de boundaries. |
| TASK-0705 | TASK-0203, TASK-0204, TASK-0303 | Tests RFC-0007 dependen de binding y reconciliación. |
| TASK-0706 | TASK-0301, TASK-0302, TASK-0303 | Tests RFC-0008 dependen de Turn. |
| TASK-0707 | TASK-0501, TASK-0502, TASK-0503 | Tests RFC-0009 dependen de lectura gobernada. |
| TASK-0708 | TASK-0601, TASK-0604, TASK-0605, TASK-0606 | Tests RFC-0010 dependen del runtime de agentes. |

## 14. Orden recomendado de ejecución

### Wave 1 — Contracts before code
TASK-0001 a TASK-0004, TASK-0101 a TASK-0103.

### Wave 2 — Policy, Evidence, Binding
TASK-0104, TASK-0201 a TASK-0204.

### Wave 3 — Turn Runtime
TASK-0301 a TASK-0303.

### Wave 4 — Gateways
TASK-0401 a TASK-0505.

### Wave 5 — Agent/Workflow
TASK-0601 a TASK-0606.

### Wave 6 — Compliance tests
TASK-0701 a TASK-0708.

## 15. Tests negativos obligatorios
- efecto externo sin binding;
- binding replay;
- binding de otra organización;
- deny ignorado;
- obligación parcial ejecutada;
- tool autoautorizada;
- integration con credencial fuera de scope;
- over-fetch en context package;
- stale knowledge usado;
- plan ejecutado como autorización;
- inter-agent output tratado como trusted;
- subagent amplía permisos;
- fan-out evita aprobación;
- completed con unknown outcome;
- cancelación interpretada como no efecto;
- reanudación sin revalidar.

## 16. Riesgos de implementación
- Empezar por LLM antes de Core.
- Meter integraciones reales antes de gates.
- Convertir policy en ifs dispersos.
- No evidenciar antes de efectos.
- Permitir tools directas.
- Confundir memory con authority.
- Tratar workflow como permiso global.
- RAG sin retrieval scope.
- No modelar Unknown Outcome.
- No tener tests negativos desde el inicio.

## 17. Cosas prohibidas durante Core v1
- acciones externas reales sin Binding path;
- conectores reales saltándose Capability Gateway;
- conocimiento real saltándose Knowledge Gateway;
- agentes eligiendo organización;
- tools leyendo credenciales directamente;
- prompts como fuente de autoridad;
- memoria como autorización;
- Inter-Agent Output como instrucción de sistema;
- workflow global permission;
- aprobación reutilizable fuera de alcance.

## 18. Primer milestone ejecutable
## Milestone M1 — Governed request skeleton

Debe incluir:

- OrganizationContext;
- IdentityContext;
- PolicyDecision stub;
- EvidenceRecord básico;
- DecisionBinding conceptual;
- test negativo de deny;
- test negativo de missing critical attribute;
- test negativo de binding replay conceptual.

Resultado esperado:

Al terminar M1, Core aún no hace nada útil para un cliente, pero ya puede demostrar que ninguna ejecución relevante debería avanzar sin organización, identidad, policy y evidencia.

## 19. Criterios para pasar de documentación a código
Podemos empezar código cuando:

- el backlog está en main;
- M1 está claro;
- contratos iniciales están identificados;
- tests negativos iniciales están listados;
- stack inicial está decidido en un ADR separado o documento equivalente;
- se acepta que el primer código no tendrá LLM ni integraciones reales.

## 20. Referencias
- `docs/implementation/core-v1-implementation-plan.md`
- RFC-0000 a RFC-0010

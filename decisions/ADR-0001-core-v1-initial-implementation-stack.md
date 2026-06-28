# ADR-0001 — Core v1 Initial Implementation Stack

- **Estado:** Accepted
- **Fecha:** 2026-06-28
- **Decisor:** Juan Luis, con ChatGPT actuando como CTO/arquitecto
- **Contexto:** Kern Core v1
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog

## 1. Contexto

Kern ya tiene aceptados RFC-0000 a RFC-0010 y los documentos de implementación de Core v1.

Ahora hace falta tomar una decisión mínima de stack para pasar de la documentación al código sin abrir una cascada infinita de decisiones arquitectónicas.

Core v1 no empieza por crear un agente inteligente. Empieza por crear una ruta gobernada mínima donde organización, identidad, policy, evidencia y bindings existen antes de cualquier acción relevante.

## 2. Decisión

Kern Core v1 se implementará inicialmente en TypeScript sobre Node.js.

El repositorio evolucionará hacia una estructura modular, con contratos compartidos, módulos Core y tests de cumplimiento desde el inicio.

Python queda permitido solo para workers, adapters o tareas especializadas no autoritativas.

El primer milestone ejecutable, M1 — Governed request skeleton, no incluirá LLMs, integraciones reales, RAG real, colas reales ni base de datos definitiva.

## 3. Motivación

Core v1 necesita contratos claros, tipos, tests, modularidad, APIs internas limpias, mantenibilidad y trazabilidad.

También necesita evitar scripts sueltos, evitar mezclar IA con enforcement y preparar una futura web/admin/API sin rehacer la base.

Core no es la capa inteligente de Kern. Core es la capa que impide que la inteligencia, las tools, los agents, los workflows o las integrations puedan saltarse organización, identidad, policy, bindings, evidencia y límites.

## 4. Alcance de la decisión

Esta decisión aplica a:

- Core Kernel;
- contracts;
- Organization & Identity Context;
- Policy Engine skeleton;
- Evidence Ledger;
- Decision Binding Store;
- Turn Runtime;
- Capability Gateway;
- Knowledge Gateway;
- Agent/Workflow Runtime mínimo;
- Compliance Test Suite.

No decide producto final, UI final, despliegue final ni arquitectura enterprise completa.

## 5. Stack inicial aprobado

- **Lenguaje principal de Core:** TypeScript
- **Runtime inicial:** Node.js
- **Estilo:** monorepo modular
- **Tests iniciales:** tests automatizados desde M1
- **Validación de contratos:** librería de validación tipada por decidir en la implementación inicial
- **Persistencia inicial:** interfaces y stubs, sin base de datos definitiva
- **LLM:** fuera de M1
- **Integraciones reales:** fuera de M1
- **Python:** permitido solo en componentes subordinados no autoritativos

No se fijan librerías concretas como obligatorias. Las herramientas concretas se decidirán en la implementación o en un ADR posterior.

## 6. Qué queda explícitamente fuera

- elegir base de datos definitiva;
- elegir cola definitiva;
- elegir framework HTTP definitivo;
- elegir proveedor IA;
- elegir librería RAG;
- crear panel web;
- crear SDK público;
- integrar Telegram;
- integrar Holded/Gmail/Drive/Odoo reales;
- crear agentes con LLM;
- crear workflows avanzados;
- ejecutar acciones externas reales;
- definir despliegue cloud/on-prem definitivo.

## 7. Regla sobre Python

Python puede usarse para workers, extracción, análisis, conectores experimentales, procesamiento de documentos, pruebas de modelos o tareas de IA especializadas.

Python no será fuente de autoridad para organización, identidad, policy, Decision Binding, Evidence, enforcement, autonomía, permisos ni límites.

Cualquier worker Python futuro deberá actuar como componente subordinado a Core y consumir contratos emitidos o autorizados por Core.

## 8. Regla sobre LLMs

M1 no incluirá LLM.

Ningún LLM puede ser fuente de autoridad, aprobación, policy, identidad, organización, scope, binding, clasificación, taint, autonomía ni evidencia.

Los LLMs se integrarán solo cuando exista una ruta mínima gobernada y testeada que trate sus salidas como propuestas o contenido no confiable según corresponda.

## 9. Regla sobre persistencia

M1 puede usar persistencia en memoria, fichero local o stubs conceptuales, siempre que las interfaces representen correctamente Evidence, Decision Binding, Turn State y Organization Scope.

La base de datos definitiva se decidirá en un ADR posterior.

Ningún stub de persistencia puede relajar las garantías de seguridad del contrato.

## 10. Regla sobre integraciones reales

M1 no incluirá integraciones reales.

Las primeras capabilities y knowledge sources serán mocks o adapters de prueba.

Ninguna integración real podrá entrar antes de existir Capability Gateway o Knowledge Gateway con tests negativos básicos.

## 11. Estructura inicial prevista

apps/
  api/
  worker/

packages/
  contracts/
  core/
  identity/
  policy/
  evidence/
  bindings/
  turns/
  capabilities/
  knowledge/
  agents/
  compliance-tests/

adapters/
  mock/

python/
  workers/
  research/

Esta estructura es una previsión inicial y puede ajustarse durante la implementación, siempre que respete este ADR y los RFC.

## 12. Consecuencias positivas

- Core mantenible;
- contratos claros;
- menor riesgo de scripts dispersos;
- mejor testing;
- mejor camino hacia API/web;
- separación clara entre IA y enforcement;
- posibilidad de workers Python sin que manden sobre Core.

## 13. Consecuencias negativas

- menos velocidad inicial para prototipos IA;
- más disciplina;
- más boilerplate;
- no habrá demo inteligente inmediata;
- habrá que resistir la tentación de meter LLM pronto;
- Python no será el camino principal para Core.

## 14. Alternativas consideradas

### Python-first

Pros:

- rápido para IA;
- fácil para prototipos;
- ecosistema ML.

Contras:

- mayor riesgo de scripts dispersos;
- enforcement menos rígido;
- peor encaje con web/API/contratos compartidos a largo plazo;
- más tentación de mezclar IA y autoridad.

Resultado: rechazado para Core principal.

### TypeScript-first

Pros:

- contratos y tipos;
- buen encaje con APIs;
- mejor mantenibilidad;
- mejor transición a panel/web;
- buen equilibrio entre producto y plataforma.

Contras:

- menos cómodo para ML;
- más estructura inicial.

Resultado: aceptado.

### Mixto desde el día uno

Pros:

- flexibilidad.

Contras:

- más complejidad operativa;
- frontera Core/workers menos clara;
- mayor riesgo de diseño prematuro.

Resultado: diferido.

## 15. Criterios de revisión futura

La decisión puede revisarse si:

- Core requiere capacidades que TypeScript no cubre razonablemente;
- Python workers necesitan convertirse en producto estable;
- aparece una necesidad clara de runtime especializado;
- el modelo de despliegue enterprise exige separación de servicios;
- M1/M2 demuestran cuellos de botella reales;
- un ADR posterior justifica base de datos, cola, framework o runtime específico.

## 16. Referencias

- RFC-0000 a RFC-0010;
- `docs/implementation/core-v1-implementation-plan.md`;
- `docs/implementation/core-v1-build-backlog.md`.

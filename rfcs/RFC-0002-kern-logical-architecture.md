# RFC-0002 — Kern Logical Architecture

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-26
- **Versión:** 0.1
- **Tipo:** Architecture / Foundational
- **Dominio:** Arquitectura lógica de plataforma
- **Depends on:** RFC-0000, RFC-0001
- **Decisión requerida:** Aprobación de los límites, motores y dependencias lógicas de Kern

---

## 1. Resumen ejecutivo

Kern será una plataforma de infraestructura para IA privada empresarial compuesta por motores lógicos con responsabilidades explícitas y contratos estables.

La arquitectura debe permitir que una empresa cambie modelos, runtimes, hardware, integraciones o canales sin reconstruir los elementos que definen su operación: organizaciones, identidades, permisos, políticas, herramientas, workflows, estado de agentes y auditoría.

Kern separa:

- el plano de control, que define identidad, organización, políticas, configuración, capacidades y registro;
- el plano de ejecución, que procesa conversaciones, agentes, workflows, herramientas y acciones;
- las extensiones, que implementan integraciones, proveedores, runtimes y canales mediante contratos;
- la infraestructura subyacente, que proporciona cómputo, almacenamiento, red y persistencia.

Ningún modelo de IA ni extensión debe obtener acceso directo e ilimitado a sistemas empresariales.

Toda acción relevante debe ser mediada por los contratos, políticas, permisos y registros de Kern.

---

## 2. Problema

Una plataforma de IA empresarial suele degradarse cuando sus responsabilidades se mezclan:

- el canal de chat conoce detalles del modelo;
- el agente llama directamente a APIs de clientes;
- una tool obtiene permisos por su cuenta;
- el runtime decide reglas de negocio;
- la memoria del agente queda atada a un proveedor;
- una integración de cliente modifica el Core;
- un cambio de hardware obliga a reescribir la lógica operativa;
- los logs y la auditoría se añaden después de construir las acciones.

Este acoplamiento hace que un producto parezca funcional al principio, pero sea difícil de mantener, proteger o migrar.

Kern necesita una arquitectura donde las capacidades de IA puedan evolucionar sin convertir cada cambio externo en una reescritura del producto.

---

## 3. Objetivos

Esta arquitectura debe:

1. Mantener separado el Core de proveedores, modelos, runtimes, hardware, clientes e integraciones concretas.
2. Permitir extensiones mediante contratos versionados.
3. Aplicar identidad, organización, permisos y políticas antes de acceder a datos o ejecutar acciones.
4. Hacer visibles las capacidades, límites y degradaciones de componentes externos.
5. Mantener la propiedad empresarial sobre datos, memoria, estado y registros operativos.
6. Permitir despliegues desde una instalación local única hasta topologías más distribuidas sin cambiar los contratos lógicos.
7. Permitir auditoría y observabilidad desde el diseño inicial.
8. Mantener una frontera clara entre sugerir una acción y autorizar o ejecutarla.
9. Evitar que reglas de negocio específicas de un cliente entren en el Core.
10. Proporcionar una base para futuros SDKs de providers, runtimes, tools, plugins, workflows y canales.

---

## 4. No objetivos

Este RFC no decide:

- lenguajes de programación;
- estructura de repositorios de código;
- frameworks de backend o frontend;
- protocolos de transporte concretos;
- bases de datos, vector stores, colas o caches;
- formatos concretos de plugins;
- APIs públicas detalladas;
- modelos de IA específicos;
- runtimes de inferencia específicos;
- mecanismos concretos de sandboxing;
- topologías de despliegue concretas;
- diseño de interfaz de usuario;
- modelo comercial o de licencias;
- implementación del sistema RAG;
- algoritmo interno de planificación de agentes.

Estas decisiones requerirán RFCs posteriores.

---

## 5. Modelo arquitectónico

Kern se organiza en cuatro planos lógicos:

```text
┌──────────────────────────────────────────────────────────────┐
│                    Experience Plane                           │
│  Web · Telegram · Email · API · CLI · Otros canales          │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                  Orchestration Plane                         │
│  Agent Engine · Workflow Engine · Context Assembly           │
│  Execution Coordination · Session Lifecycle                  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    Control Plane                              │
│  Identity · Organizations · Policy · Capability · Registry    │
│  Configuration · Audit · Observability · Extension Lifecycle  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    Execution Plane                            │
│  AI Provider · Runtime · Tool · Knowledge · Storage Adapters │
│  External Systems · Client Integrations                       │
└──────────────────────────────────────────────────────────────┘
```

Estos planos son fronteras lógicas. Una implementación inicial puede ejecutarse en un único proceso o servidor, pero no debe mezclar sus responsabilidades.

---

## 6. Reglas de dependencia

Las dependencias deben seguir estas reglas:

1. Los canales no conocen proveedores, modelos, runtimes ni integraciones de cliente.
2. Los agentes no acceden directamente a sistemas externos.
3. Las tools no deciden permisos por sí mismas.
4. Los providers y runtimes no conocen reglas de negocio de clientes.
5. Las extensiones dependen de contratos del Core; el Core no depende de implementaciones de extensiones.
6. Las políticas pueden bloquear, transformar, requerir aprobación o permitir una acción antes de su ejecución.
7. La auditoría no es opcional para acciones relevantes.
8. Los componentes externos deben declararse mediante capacidades y límites explícitos.
9. La persistencia de estado no debe quedar implícitamente ligada a un proveedor de IA.
10. Las decisiones específicas de cliente deben vivir en configuración, plugins o repositorios de entrega, no en el Core.

---

## 7. Motores lógicos de Kern

### 7.1 Identity and Organization Engine

Gestiona:

* organizaciones;
* usuarios;
* identidades de servicio;
* membresías;
* roles;
* límites organizativos;
* pertenencia de recursos.

Este motor define a qué organización pertenece cualquier conversación, agente, tool, workflow, dato, ejecución o registro.

No define todavía un modelo concreto de autenticación ni autorización.

---

### 7.2 Policy Engine

Evalúa si una operación puede realizarse bajo las políticas de una organización.

Puede:

* permitir;
* denegar;
* requerir confirmación humana;
* exigir aprobación;
* limitar alcance;
* aplicar restricciones de datos;
* imponer límites de coste, frecuencia o capacidad;
* registrar decisiones de política.

El Policy Engine no ejecuta directamente acciones empresariales. Decide las condiciones bajo las que otros motores pueden ejecutarlas.

---

### 7.3 Registry and Capability Engine

Mantiene el registro de componentes disponibles y sus contratos.

Registra, como mínimo:

* agentes;
* tools;
* plugins;
* providers;
* runtimes;
* canales;
* workflows;
* knowledge sources;
* modelos;
* capacidades;
* versiones;
* estados de disponibilidad;
* límites declarados.

El sistema debe seleccionar componentes por capacidades requeridas, no solo por nombres comerciales.

Ejemplos de capacidades:

* tool calling;
* salida estructurada;
* entrada de imagen;
* contexto largo;
* streaming;
* embeddings;
* reranking;
* ejecución asíncrona;
* aislamiento;
* aprobación humana.

La definición formal de capabilities se decidirá en un RFC posterior.

---

### 7.4 Agent Engine

Gestiona el ciclo de vida lógico de un agente:

* identidad;
* configuración;
* objetivos;
* estado;
* memoria;
* sesión;
* contexto;
* selección de capacidades;
* planificación;
* ejecución coordinada;
* resultados.

Un agente puede proponer acciones, pero no obtiene autoridad inherente para ejecutarlas.

El Agent Engine debe solicitar ejecución a través de herramientas mediadas por políticas.

---

### 7.5 Workflow Engine

Gestiona procesos explícitos y repetibles que pueden incluir:

* triggers;
* eventos;
* pasos;
* condiciones;
* aprobaciones;
* acciones;
* reintentos;
* compensaciones;
* resultados.

Los workflows son distintos de una conversación o razonamiento puntual de un agente.

Un workflow debe poder ejecutarse con control, estado, observabilidad y políticas explícitas.

---

### 7.6 Tool Engine

Es la única frontera estándar para que agentes y workflows consulten o actúen sobre sistemas externos.

Gestiona:

* registro de tools;
* schemas de entrada y salida;
* validación;
* permisos;
* invocación;
* límites;
* reintentos;
* aprobaciones;
* resultados;
* auditoría;
* aislamiento proporcional al riesgo.

Una tool no puede ampliar sus propios permisos.

Una tool no debe recibir acceso global a secretos, datos o sistemas si no es necesario para la operación autorizada.

---

### 7.7 Knowledge Engine

Gestiona el acceso gobernado a conocimiento empresarial.

Incluye, de forma lógica:

* fuentes de conocimiento;
* ingesta;
* clasificación;
* permisos;
* recuperación;
* referencias;
* versionado;
* retención;
* eliminación;
* evaluación de relevancia.

El Knowledge Engine no prescribe un vector store, embedding model, chunking strategy ni pipeline RAG concreto.

El acceso al conocimiento debe respetar las mismas políticas organizativas que el acceso a una tool.

---

### 7.8 AI Provider Engine

Normaliza la interacción con modelos de IA y servicios de inferencia desde la perspectiva de Kern.

Sus responsabilidades lógicas incluyen:

* descubrimiento de modelos;
* capacidades declaradas;
* solicitud de inferencia;
* structured outputs;
* streaming;
* tool calling;
* límites;
* errores;
* uso;
* coste;
* trazabilidad de versión y configuración.

El AI Provider Engine no promete equivalencia conductual entre modelos.

Debe exponer capacidades y restricciones para que los motores superiores puedan decidir, degradar o bloquear de forma segura.

---

### 7.9 Runtime Engine

Abstrae el entorno que ejecuta modelos o servicios de inferencia.

Puede representar:

* un servidor local;
* un runtime de inferencia;
* un clúster;
* un servicio remoto;
* una infraestructura acelerada;
* una ejecución CPU;
* una ejecución GPU.

El Runtime Engine informa de disponibilidad, capacidad, salud, límites y compatibilidad.

No contiene reglas de negocio ni gestión de permisos empresariales.

---

### 7.10 Channel Engine

Conecta Kern con los canales mediante los que interactúan usuarios o sistemas.

Ejemplos:

* portal web;
* Telegram;
* email;
* API;
* CLI;
* sistemas de mensajería;
* otros canales futuros.

Un canal traduce entradas y salidas a contratos internos de Kern.

No decide políticas, no ejecuta tools directamente y no queda atado a un modelo específico.

---

### 7.11 Audit and Observability Engine

Registra y expone evidencia operativa de Kern.

Debe permitir observar, con minimización y políticas de retención adecuadas:

* identidades;
* organizaciones;
* sesiones;
* versiones de componentes;
* decisiones de política;
* ejecuciones de agentes;
* tool calls;
* workflows;
* errores;
* costes;
* consumo;
* eventos de seguridad;
* degradaciones;
* aprobaciones humanas.

La auditoría no debe implicar guardar indiscriminadamente contenido sensible completo.

---

### 7.12 Extension Lifecycle Engine

Gestiona el ciclo de vida lógico de extensiones.

Incluye:

* descubrimiento;
* instalación;
* versionado;
* habilitación;
* configuración;
* permisos;
* compatibilidad;
* actualización;
* deshabilitación;
* retirada.

Una extensión puede implementar un provider, runtime, tool, plugin, channel, workflow template o integración.

La extensión debe declarar sus capacidades, permisos y compatibilidad antes de activarse.

---

## 8. Flujo de ejecución gobernado

Una interacción típica debe seguir este recorrido lógico:

```text
1. Usuario o sistema entra por un Channel
2. Channel identifica organización, identidad y sesión
3. Agent Engine o Workflow Engine recibe la solicitud
4. Registry and Capability Engine resuelve componentes compatibles
5. Policy Engine evalúa permisos, límites y condiciones
6. AI Provider Engine solicita inferencia mediante un Runtime compatible
7. El agente propone una consulta o acción
8. Tool Engine valida schema, permisos y políticas
9. Policy Engine permite, limita, exige aprobación o deniega
10. Tool ejecuta la operación autorizada
11. Audit and Observability Engine registra la evidencia permitida
12. El resultado vuelve al agente, workflow o canal
```

Ningún paso debe permitir que una salida de modelo se convierta automáticamente en una acción empresarial sin pasar por Tool Engine y Policy Engine.

---

## 9. Fronteras de confianza

Kern debe tratar como no confiables por defecto:

* entradas de usuarios;
* contenido de correo;
* documentos;
* páginas web;
* datos procedentes de integraciones;
* outputs de modelos;
* plugins y tools de terceros;
* proveedores externos;
* canales externos.

Las fronteras de confianza deben aplicar:

* validación de schemas;
* autenticación;
* autorización;
* minimización de datos;
* segregación organizativa;
* límites de ejecución;
* aprobación humana cuando aplique;
* auditoría;
* aislamiento proporcional al riesgo.

La implementación concreta de sandboxing y aislamiento se definirá en RFCs posteriores.

---

## 10. Estado, memoria y soberanía de datos

El estado de agentes, memoria, sesiones, configuraciones y registros operativos pertenece a la organización que usa Kern.

Kern debe permitir que estos elementos puedan persistirse, migrarse, restaurarse o retirarse bajo políticas de la empresa.

Los modelos y proveedores pueden procesar contexto autorizado, pero no deben convertirse en la fuente única de verdad del estado empresarial.

---

## 11. Despliegue y evolución

La arquitectura lógica debe permitir, sin cambiar contratos fundamentales:

* una instalación local en una sola máquina;
* una instalación privada con varios servicios;
* una instalación con runtimes separados;
* una topología híbrida bajo políticas explícitas;
* una evolución futura hacia despliegues distribuidos.

Esto no implica que todas las topologías estén soportadas desde la primera versión.

La implementación inicial debe priorizar simplicidad operativa, siempre que no rompa las fronteras lógicas definidas en este RFC.

---

## 12. Consecuencias

Aceptar esta arquitectura implica:

* cualquier integración empresarial debe entrar mediante Tool Engine, plugin o contrato de extensión;
* cualquier acceso a conocimiento debe pasar por políticas organizativas;
* cualquier modelo o runtime debe declararse mediante provider, runtime y capacidades;
* cualquier acción relevante debe pasar por Policy Engine, Tool Engine y Audit Engine;
* el Core deberá mantener contratos pequeños, versionados y orientados a extensión;
* futuras decisiones tecnológicas no pueden violar las reglas de dependencia de este RFC sin un RFC posterior explícito.

---

## 13. Preguntas abiertas

1. ¿Qué contratos concretos deben existir entre Agent Engine, Tool Engine y Policy Engine?
2. ¿Cómo se modelarán formalmente las capabilities y su negociación?
3. ¿Qué acciones deben requerir aprobación humana por defecto?
4. ¿Cómo se aislarán tools y plugins según nivel de riesgo?
5. ¿Qué modelo de permisos combinará roles, políticas y restricciones de datos?
6. ¿Cómo se representará el estado transferible de un agente?
7. ¿Qué interfaces públicas deben estabilizarse primero?
8. ¿Qué motores forman el Core de la primera implementación y cuáles pueden empezar como extensiones?

---

## 14. Referencias

* RFC-0000 — The Kern RFC Process
* RFC-0001 — Kern Manifesto

---

## 15. Historial de cambios

### 0.1 — 2026-06-26

Borrador inicial de la arquitectura lógica de Kern.

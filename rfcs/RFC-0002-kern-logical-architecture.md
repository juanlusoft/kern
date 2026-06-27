# RFC-0002 — Kern Logical Architecture

- **Estado:** Accepted
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-26
- **Versión:** 0.2.2
- **Tipo:** Architecture / Foundational
- **Dominio:** Arquitectura lógica de plataforma
- **Depends on:** RFC-0000, RFC-0001
- **Decisión requerida:** Aprobación de los límites, motores y dependencias lógicas de Kern

---

## 1. Resumen ejecutivo

Kern será una plataforma de infraestructura para IA privada empresarial compuesta por motores lógicos con responsabilidades explícitas y contratos estables.

La arquitectura debe permitir que una empresa cambie modelos, runtimes, hardware, integraciones o canales sin reconstruir los elementos que definen su operación: organizaciones, identidades, permisos, políticas, herramientas, workflows, estado de agentes y auditoría.

Kern separa:

- el plano de experiencia, que entra por canales;
- el plano de orquestación, que prepara, coordina y resuelve capacidades;
- el plano de ejecución, que interactúa con modelos, herramientas, conocimiento y sistemas externos;
- el Control Plane transversal, que define identidad, tenancy, políticas, capacidades, registro, configuración, auditoría y ciclo de vida de extensiones.

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

Kern se organiza en tres planos de flujo y un Control Plane transversal:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Experience Plane                                      │
│  Web · Telegram · Email · API · CLI · Otros canales                          │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│                       Orchestration Plane                                    │
│  Agent Engine · Workflow Engine · Context Assembly                            │
│  Capability Resolution · Session / Execution Coordination                    │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│                          Execution Plane                                      │
│  Tool Execution · Knowledge Access · AI Providers · Runtimes                 │
│  Storage Adapters · Client Integrations                                       │
└──────────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════════╗
║                      Transversal Control Plane                               ║
║ Identity & Organization · Tenancy · Policy · Registry                       ║
║ Configuration · Audit · Observability · Extension Lifecycle                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

Estos planos son fronteras lógicas. Una implementación inicial puede ejecutarse en un único proceso o servidor, pero no debe mezclar sus responsabilidades.

Reglas explícitas:

- El Control Plane no es un salto obligatorio de red ni una capa vertical de datos.
- Todos los planos consumen contratos del Control Plane.
- El Control Plane no depende de implementaciones de Experience, Orchestration o Execution.
- Una primera implementación puede ser un monolito modular con llamadas en memoria.
- Las fronteras lógicas no implican microservicios.

---

## 6. Reglas de dependencia

Las dependencias deben seguir estas reglas:

1. Los canales aportan credenciales y metadatos; Identity and Organization Engine resuelve identidad, organización y tenancy.
2. Toda operación ejecutable o lectura de conocimiento debe tener contexto organizativo obligatorio.
3. Ninguna salida de modelo, workflow, plugin o channel puede ejecutar una acción externa fuera de Tool Engine + Policy Engine.
4. Toda lectura de Knowledge Engine pasa por Policy Engine y segregación organizativa.
5. Workflow Engine utiliza exactamente el mismo camino de ejecución mediada que Agent Engine.
6. Registry es un catálogo; Capability Resolution vive en Orchestration y selecciona componentes mediante requisitos y resultados de evaluación.
7. Audit y Observability son responsabilidades distintas.
8. Las extensiones solo solicitan permisos; nunca se los conceden a sí mismas.
9. Los componentes externos declaran capabilities, límites y compatibilidad, pero esas declaraciones no sustituyen validación o evaluación.
10. Todo motor debe propagar el organization context y los atributos de procedencia y confianza que apliquen.

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
* pertenencia de recursos;
* tenancy.

Este motor define a qué organización pertenece cualquier conversación, agente, tool, workflow, dato, ejecución o registro.

No define todavía un modelo concreto de autenticación ni autorización.

---

### 7.2 Policy Engine

Evalúa si una operación puede realizarse bajo las políticas de una organización.

A efectos de este RFC, una política puede cubrir autorización, restricciones de datos, límites operativos, presupuestos, frecuencia, condiciones de aprobación y transformaciones permitidas de una solicitud.

Cuando varias políticas aplicables entren en conflicto, una denegación prevalece sobre una transformación o permiso hasta que un RFC posterior defina un modelo formal de composición, prioridad y resolución de conflictos.

Puede:

* permitir;
* denegar;
* requerir confirmación humana;
* exigir aprobación;
* limitar alcance;
* aplicar restricciones de datos;
* imponer límites de coste, frecuencia o capacidad;
* registrar decisiones de política;
* transformar una operación antes de permitirla.

El Policy Engine no ejecuta directamente acciones empresariales. Decide las condiciones bajo las que otros motores pueden ejecutarlas.

---

### 7.3 Registry Engine

Mantiene el catálogo de componentes disponibles y sus contratos.

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
* límites declarados;
* ownership.

El Registry solo cataloga componentes, versiones, contratos, disponibilidad declarada, compatibilidad y ownership.

No debe seleccionar componentes ni tomar decisiones de routing.

---

### 7.4 Capability Resolution

Capability Resolution vive en Orchestration.

Recibe requisitos funcionales, políticas y contexto de ejecución, y usa capacidades declaradas junto con resultados de evaluación y compatibilidad.

Puede:

* elegir componentes;
* degradar capacidades;
* solicitar aprobación;
* bloquear una operación.

No promete equivalencia conductual.

“Aprobación humana”, “aislamiento” y “tenancy” no son capabilities de modelo; son atributos de política o seguridad.

---

### 7.5 Context Assembly and Provenance Engine

Construye el contexto entregado a un agente o a un provider.

Sus responsabilidades incluyen:

* conservar referencias a procedencia, organización, clasificación y nivel de confianza;
* tratar correo, documentos, web, contenido conectado y outputs de terceros como no confiables por defecto;
* no convertir instrucciones contenidas en datos externos en autoridad para ejecutar acciones;
* permitir que Policy Engine aplique controles reforzados, confirmación humana o bloqueo cuando una acción derive de contenido no confiable;
* no prometer eliminar toda prompt injection; establecer trazabilidad y controles de procedencia;
* minimizar y referenciar datos sensibles según políticas de retención y acceso.

---

### 7.6 Agent Engine

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

El Agent Engine comparte un sustrato lógico de ejecución, estado, políticas, aprobaciones y auditoría con el Workflow Engine.

---

### 7.7 Workflow Engine

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

El Workflow Engine comparte un sustrato lógico de ejecución, estado, políticas, aprobaciones y auditoría con el Agent Engine.

Un workflow no puede ejecutar acciones directamente.

Toda acción de workflow se transforma en una solicitud mediada por Tool Engine y Policy Engine.

No hay segundo camino de ejecución.

---

### 7.8 Tool Engine

Es la frontera estándar para que agentes y workflows soliciten acciones o integraciones operativas sobre sistemas externos.

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

El nivel de riesgo y aislamiento no puede ser autoasignado por la tool.

Los permisos declarados por una tool o extensión son solicitudes.

El operador y las políticas determinan la concesión final.

La ejecución física puede ocurrir en un entorno aislado proporcional al riesgo.

Tool Engine distingue validación de schema, autorización, ejecución y auditoría.

Una tool no puede ampliar sus propios permisos.

Una tool no debe recibir acceso global a secretos, datos o sistemas si no es necesario para la operación autorizada.

---

### 7.9 Knowledge Engine

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

Retrieval es una operación gobernada.

Cada consulta debe llevar organization context.

Se aplican políticas de lectura, clasificación, retención y segregación antes de devolver resultados.

Las referencias de conocimiento deben preservar procedencia y clasificación.

El Knowledge Engine puede empezar como módulo opcional o extensión sobre contratos del Core; no implica un RAG completo en Core v1.

El Knowledge Engine no prescribe un vector store, embedding model, chunking strategy ni pipeline RAG concreto.

El acceso al conocimiento debe respetar las mismas políticas organizativas que el acceso a una tool.

---

### 7.10 AI Provider Engine

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

Provider es el contrato lógico para interaccionar con modelos: inferencia, capacidades declaradas, structured outputs, tool calling, streaming, versión, uso y coste.

El AI Provider Engine no promete equivalencia conductual entre modelos.

Debe exponer capacidades y restricciones para que los motores superiores puedan decidir, degradar o bloquear de forma segura.

---

### 7.11 Runtime Engine

Abstrae el entorno que ejecuta modelos o servicios de inferencia.

Puede representar:

* un servidor local;
* un runtime de inferencia;
* un clúster;
* un servicio remoto;
* una infraestructura acelerada;
* una ejecución CPU;
* una ejecución GPU.

Runtime es el sustrato físico o de servicio que ofrece disponibilidad, salud, capacidad y límites de ejecución.

En un proveedor hosted, Runtime puede ser opaco o no estar bajo control directo de Kern.

Runtime no gestiona pesos, cuantización, compilación de kernels ni optimización de GPU de bajo nivel.

Provider y Runtime pueden estar representados por una misma extensión, pero los contratos lógicos siguen separados.

El Runtime Engine informa de disponibilidad, capacidad, salud, límites y compatibilidad.

No contiene reglas de negocio ni gestión de permisos empresariales.

---

### 7.12 Channel Engine

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

### 7.13 Audit Engine

Registra y expone evidencia operativa de Kern.

Debe cubrir evidencia de operaciones, decisiones, integridad, acceso restringido, retención, minimización y trazabilidad.

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

### 7.14 Observability Engine

Registra telemetría operativa de Kern.

Debe cubrir métricas, trazas, salud, rendimiento, errores, consumo y degradaciones.

Puede ser agregada, muestreada o con retención distinta de Audit.

---

### 7.15 Configuration and Extension Lifecycle Engine

Gestiona la configuración gobernada y el ciclo de vida de extensiones de Kern.

Incluye, de forma lógica:

- configuración por plataforma y organización;
- instalación, registro, habilitación y deshabilitación de extensiones;
- solicitudes de permisos y capacidades declaradas;
- evaluación de compatibilidad;
- actualización, retirada y revocación;
- trazabilidad de versión y ownership;
- aplicación de límites organizativos y políticas de activación.

Una extensión puede implementar un provider, runtime, tool, channel, workflow template o integración.

La declaración de permisos, riesgo o capabilities por parte de una extensión es una solicitud de configuración, no una concesión de autoridad.

La activación de una extensión requiere decisión de operador y políticas aplicables.

Este motor no ejecuta la extensión ni sustituye las fronteras de Tool Engine, Knowledge Engine, Policy Engine o Audit Engine.

---

## Tenancy and organization invariants

Toda solicitud, recurso, cache, resultado, sesión, memoria, ejecución y registro tiene organization context explícito o está declarado como recurso de plataforma.

Ningún motor puede devolver datos de otra organización salvo una política explícita de compartición.

Providers, runtimes y modelos compartidos no pueden reutilizar contexto, cache o memoria entre organizaciones sin aislamiento y política explícita.

Knowledge access debe filtrar o particionar por organización antes de la recuperación.

Las extensiones se habilitan y autorizan por organización o como recurso de plataforma con límites explícitos.

No se diseña todavía jerarquía de departamentos o filiales; eso queda para una decisión futura.

---

## 8. Flujo de ejecución gobernado

Una acción relevante es cualquier operación que cambie estado fuera de Kern, mueva datos fuera de un límite organizativo, acceda a datos clasificados, gaste presupuesto o capacidad significativa, cambie configuración, active una integración, o tenga efecto operativo sobre una persona o sistema. Ante duda, la operación se tratará como relevante.

Una interacción típica debe seguir este recorrido lógico:

1. Channel entrega credenciales y entrada.
2. Identity and Organization resuelve identidad, organización y tenancy.
3. Context Assembly clasifica procedencia y confianza.
4. Agent o Workflow recibe la solicitud.
5. Capability Resolution usa Registry, políticas y evaluación.
6. Policy evalúa acceso, límites y condiciones.
7. Provider/Runtime realiza inferencia compatible.
8. Agente o workflow propone lectura o acción.
9. Knowledge Engine o Tool Engine valida organización, schema, permisos y políticas.
10. Policy permite, limita, requiere aprobación, transforma o deniega.
11. La ejecución autorizada ocurre.
12. Audit registra evidencia según retención y minimización.
13. Observability registra telemetría operativa.
14. El resultado vuelve al orquestador y al canal.

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

Los datos externos pueden transportar instrucciones no confiables.

La procedencia y la clasificación deben propagarse al contexto.

Los permisos declarados por extensiones no son autoridad.

La identidad afirmada por un canal no se considera identidad validada.

No existe camino alternativo de workflows, knowledge o plugins para ejecutar acciones fuera de las fronteras gobernadas.

La implementación concreta de sandboxing y aislamiento se definirá en RFCs posteriores.

---

## 10. Estado, memoria y soberanía de datos

El estado de agentes, memoria, sesiones, configuraciones y registros operativos pertenece a la organización que usa Kern.

Kern debe permitir que estos elementos puedan persistirse, migrarse, restaurarse o retirarse bajo políticas de la empresa.

Los modelos y proveedores pueden procesar contexto autorizado, pero no deben convertirse en la fuente única de verdad del estado empresarial.

El estado transferible requiere contratos versionados y migrables.

Los proveedores externos nunca son la fuente única de verdad.

Los cambios de esquema deben tener migración explícita.

La representación concreta de estado se decidirá en un RFC posterior.

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

## Core v1 boundaries

Responsabilidades candidatas a Core v1:

* contratos de identidad, organización y tenancy;
* evaluación de políticas;
* registry y contratos de extensión;
* mediación de tools;
* auditoría;
* context/provenance contracts;
* orquestación base de agente y ejecución mediada.

Módulos que pueden comenzar opcionales o fuera de Core v1:

* workflows avanzados;
* Knowledge Engine / RAG completo;
* channels concretos;
* providers y runtimes concretos;
* UI de administración;
* extensiones de cliente.

Esta delimitación no es una lista de procesos ni microservicios; es una decisión de pertenencia lógica.

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

1. ¿Qué contratos concretos deben existir entre Policy Engine, Tool Engine, Knowledge Engine y Context Assembly?
2. ¿Cómo se modelarán formalmente las capabilities y su negociación?
3. ¿Qué modelo de aprobación humana y representación de decisiones debe usarse?
4. ¿Cómo se aislarán tools y plugins según nivel de riesgo?
5. ¿Qué modelo de permisos combinará roles, políticas y restricciones de datos?
6. ¿Cómo se representará y migrará el estado transferible de un agente?
7. ¿Qué contratos públicos iniciales deben estabilizarse y qué política de compatibilidad y deprecación seguirá Kern?
8. ¿Qué criterios usarán los módulos para salir del monolito modular?
9. ¿Qué modelo de jerarquía organizativa y compartición explícita entre unidades se adoptará más adelante?

---

## 14. Referencias

* RFC-0000 — The Kern RFC Process
* RFC-0001 — Kern Manifesto

---

## 15. Historial de cambios

### 0.1 — 2026-06-26

Borrador inicial de la arquitectura lógica de Kern.

### 0.2 — 2026-06-26

Rediseño parcial tras revisión externa. Convierte el Control Plane en transversal, elimina bypasses de identidad, knowledge y workflows, define Context Assembly con procedencia, separa Registry de Capability Resolution y Audit de Observability, introduce invariantes de tenancy y fija límites de Core v1.

### 0.2.1 — 2026-06-26

Correcciones de consistencia tras la revisión final: numeración completa de motores, definición de configuración y ciclo de vida de extensiones, separación explícita entre acciones operativas y acceso gobernado a conocimiento, y regla provisional de conflicto de políticas.

### 0.2.2 — 2026-06-26

RFC Accepted por el Technical Owner tras revisión independiente de arquitectura e investigación estratégica externa. Esta arquitectura lógica se convierte en la referencia para las fronteras de control, ejecución gobernada, tenancy, extensiones y evolución de Kern.

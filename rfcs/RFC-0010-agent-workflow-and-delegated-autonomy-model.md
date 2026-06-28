# RFC-0010 — Agent, Workflow and Delegated Autonomy Model
- **Estado:** Accepted
- **Versión:** 0.2.1

## 1. Resumen ejecutivo

RFC-0010 define el modelo lógico de Agents, Workflows, Plans, Delegations y autonomía en Kern. Su objetivo es permitir comportamiento coordinado y útil sin introducir autoridad nueva, identidad humana simulada ni rutas de ejecución que eludan los controles de RFC-0002 a RFC-0009.

Un Agent, un Workflow o un Plan pueden proponer acciones, dividir trabajo, reanudar actividad o coordinar subefectos, pero ninguna de esas abstracciones concede por sí misma permiso, binding, aprobación, capacidad de efecto ni acceso a datos fuera de su alcance.

## 2. Problema

Kern necesita representar agentes y workflows de forma que sean útiles para planificación y coordinación sin convertir la intención en autoridad. En ausencia de un modelo lógico claro, un agente podría:

* parecer una identidad humana;
* acumular autoridad por mera persistencia;
* convertir un plan en permiso;
* ocultar la responsabilidad detrás de subagentes o cadenas de delegación;
* reusar aprobaciones, bindings o contexto fuera de su alcance;
* eludir los controles ya definidos por RFC-0003 a RFC-0009.

## 3. Objetivos

* Definir Agent, Workflow, Plan, Delegation y autonomía de manera no tecnológica.
* Mantener una separación estricta entre intención, propuesta, autorización y ejecución.
* Asegurar trazabilidad de organización, identidad, sponsor, supervisor y cadena de delegación.
* Impedir que agentes o workflows amplíen autoridad por sí mismos.
* Integrar el modelo con los controles de ejecución gobernada, policy, bindings, conocimiento y límites de recursos ya definidos.

## 4. No objetivos

* No define un framework de agentes.
* No define un motor de workflows.
* No define un scheduler, cola, runtime, lenguaje ni base de datos.
* No define UX, visualización ni formato de almacenamiento.
* No define una política concreta de producto para cada cliente.
* No sustituye RFC-0002 a RFC-0009 ni añade una ruta alternativa de autoridad.

## 5. Conceptos normativos

### Agent

Entidad lógica que puede observar contexto, proponer pasos, solicitar capacidades y coordinar trabajo bajo controles aplicables.
### Inter-Agent Output

Mensaje, resultado, plan, recomendación, resumen, instrucción propuesta, artefacto, dato estructurado o señal emitida por un Agent, Subagent o Workflow y entregada a otro Agent, Subagent, Workflow, Supervisor o componente consumidor.

Inter-Agent Output conserva procedencia, clasificación, taint, restricciones, correlación y vigencia aplicables cuando existan.

Inter-Agent Output no constituye una instrucción de sistema, una aprobación, un permiso, un Decision Binding, una decisión de policy, una prueba suficiente de contexto vigente ni una fuente autónoma de autoridad.

Un Agent no es una identidad humana, una organización, una aprobación, un permiso, un Decision Binding ni una fuente autónoma de autoridad.
La procedencia, clasificacin, taint, restricciones, correlacin y vigencia aplicables a Inter-Agent Output son establecidos, verificados, compuestos y preservados por Core o por un componente controlado por Core conforme a RFC-0009.

Un Agent, Subagent, Workflow, Supervisor, Tool, Integration o Extension puede aportar metadatos de entrada, pero no es autoridad final para declarar, reducir, eliminar o reinterpretar dichos atributos de seguridad.

Un Agent receptor no puede confiar en autoatestaciones del emisor como sustituto de esa verificacin.

### Agent Definition

Especificación del comportamiento esperado, rol, límites y capacidades potenciales de un Agent. Describe lo que puede intentar hacer, no lo que está autorizado a ejecutar.

### Agent Instance

Instancia concreta y temporal de un Agent Definition. Está vinculada a una organización, una ejecución verificable y un estado concreto.

### Agent Identity

Identidad de servicio limitada asociada a un Agent Instance. No hereda permisos humanos por defecto ni puede suplantar a un usuario.

### Agent Role

Conjunto de responsabilidades y restricciones asignadas a un Agent dentro de una organización y de una ejecución concreta.

### Workflow

Secuencia o grafo lógico de pasos coordinados. Un Workflow no es autoridad por existir ni por haber sido iniciado correctamente.

### Workflow Definition

Descripción lógica de la estructura de un Workflow. Puede expresar orden, bifurcación, condición y reintento, pero no concede permiso.

### Workflow Instance

Ejecución concreta de un Workflow Definition. Debe conservar organización, identidades, correlación, límites y estado aplicables.

### Plan

Propuesta ordenada de intención compuesta por pasos. Un Plan no es una autorización, una aprobación, un contrato de ejecución ni una garantía de que sus pasos puedan realizarse.

### Plan Step

Paso individual dentro de un Plan que puede corresponder a lectura, cálculo, transformación, solicitud de capacidad, coordinación o efecto gobernado.

### Delegation

Transferencia limitada y explícita de una parte acotada de responsabilidad operativa dentro de una ejecución gobernada.

### Delegation Chain

Secuencia trazable de delegaciones, subdelegaciones y restricciones heredadas asociadas a una ejecución concreta.

### Delegated Authority

Autoridad operativa limitada que deriva de una delegación válida y nunca excede el alcance, contexto, límites y vigencia de la delegación original.

### Autonomy Boundary

Conjunto verificable de límites que define qué puede hacer un Agent sin escalar. Puede restringir capacidades, datos, destinos, efectos, coste, frecuencia, duración, reanudación y necesidad de aprobación. También puede incluir permiso de subdelegación, profundidad máxima de Delegation Chain, cantidad máxima de Subagents y presupuesto agregado o cuota máxima de trabajo delegado.

### Autonomy Level

Grado verificable de autonomía permitido dentro de un Autonomy Boundary. Un nivel superior requiere una decisión gobernada, no una instrucción del modelo, un prompt o una memoria.

### Human Principal

Persona responsable de una decisión, aprobación, sponsor o supervisión aplicable.

### Service Principal

Identidad no humana usada para ejecutar trabajo gobernado bajo límites explícitos y verificables.

### Execution Sponsor

Principal responsable de una ejecución concreta, de su alcance y de su correlación.

### Supervisor

Principal o rol responsable de supervisar un Agent o Workflow dentro de límites explícitos.

### Subagent

Agent creado, invocado o coordinado por otro Agent o Workflow para una tarea concreta y limitada.

### Workflow Step

Paso del Workflow que puede corresponder a coordinación, lectura, cálculo, espera, decisión, aprobación o efecto gobernado.

### Approval Boundary

Límite que determina qué puede aprobarse, por quién, para qué alcance, con qué vigencia y bajo qué correlación.

### Escalation

Acción de elevar una solicitud, paso o decisión a un principal o proceso con autoridad suficiente cuando el límite local no alcanza.

### Agent Memory

Contenido retenido para ayudar a un Agent a continuar o contextualizar trabajo. La memoria no es autoridad ni prueba suficiente de contexto vigente.

### Agent State

Estado operativo durable o recuperable de un Agent Instance, distinto de la memoria.

### Agent Termination

Cese formal de un Agent Instance. No elimina evidencia, obligaciones, reconciliación ni trazabilidad pendiente.

Un Agent no es una identidad humana, una organización, una aprobación, un permiso, un Decision Binding ni una fuente autónoma de autoridad.

Un Plan no es una autorización, una aprobación, un contrato de ejecución ni una garantía de que sus pasos puedan realizarse.

Un Workflow no conserva autoridad por existir, por haber sido iniciado correctamente ni por contener pasos previamente autorizados.

## 6. Modelo de agentes y workflows

Un Agent Definition describe comportamiento, rol, límites y capacidades potenciales.

Un Agent Instance es una ejecución concreta y temporal, ligada a una organización y a un Turn, Workflow o ejecución verificable.

Un Workflow Definition describe una secuencia o grafo lógico, pero no concede autoridad.

Un Workflow Instance representa una ejecución concreta y debe conservar organización, identidades, correlación, límites y estado aplicables.

Un Plan puede ser creado por un modelo, humano o sistema, pero se considera intención propuesta hasta que cada paso aplicable sea evaluado.

A Subagent nunca recibe autoridad implícita por ser invocado por otro Agent.

Agentes, workflows y subagents no pueden declarar por sí mismos que una acción está autorizada.

## 7. Identidad, organización y responsabilidad

Toda ejecución de Agent, Workflow o Subagent pertenece a una única organización verificable.

Toda acción debe poder correlacionarse con una identidad ejecutora, identidad delegada cuando exista, `Human Principal` o `Service Principal` responsable y `Execution Sponsor` aplicable.

Un Agent Identity representa una identidad de servicio limitada y no hereda permisos humanos por defecto.

La identidad de un agente no puede ser usada para suplantar a un usuario.

Un Supervisor no obtiene acceso automático a todos los datos o acciones de un agente.

Cambios en organización, identidad, delegación, scopes, policy, consentimiento, clasificación, restricciones o límites invalidan trabajo pendiente relevante.

Un Agent no puede seleccionar arbitrariamente su organización, identidad, rol, supervisor o sponsor.

Un aumento de Autonomy Boundary requiere una decisión gobernada, verificable y correlacionada con la organización, principal responsable, finalidad, límites y periodo aplicables.

La autonomía concedida a un Agent, Workflow o Subagent no puede exceder la autoridad, límites y capacidad de concesión del principal o componente autorizado que la otorga.

Un Supervisor, Sponsor o Agent no puede conceder autonomía, acceso, aprobación, clasificación permitida, destino, capacidad o límite que no posea o no pueda conceder conforme a policy.

Un Agent no puede aprobar sus propios efectos, ni directa ni indirectamente mediante un Subagent, Workflow, Supervisor automatizado o cadena de delegación controlada por el mismo Agent.

Toda aprobación permanece limitada por la autoridad del aprobador y por acción, alcance, payload, contexto, correlación, vigencia y condiciones aplicables.

## 8. Planificación, intención y autonomía

La intención producida por un modelo, el contenido de un Plan y la decisión de un Agent de proponer un paso no constituyen autorización para leer conocimiento, invocar una capacidad, enviar datos a un destino ni producir un efecto externo.

Cada Plan Step debe ser tratado como una solicitud potencial sometida a los controles aplicables de RFC-0003 a RFC-0009.

Un Agent no puede usar una planificación previa para reutilizar una autorización, aprobación, Binding, contexto o resultado de policy fuera de su alcance, vigencia y correlación aplicables.

Autonomy Boundary y Autonomy Level son límites verificables que pueden restringir:

* tipos de capacidades;
* tipos de datos;
* clasificación permitida;
* destinos permitidos;
* efectos permitidos;
* límites de volumen, coste, duración o frecuencia;
* necesidad de aprobación;
* capacidad de crear subagents o workflows;
* capacidad de reanudar trabajo;
* condiciones de escalación.
Cuando varias solicitudes, Plan Steps, Delegations, Subagents, ramas de Workflow, retries, compensaciones, ejecuciones relacionadas o acciones distribuidas en el tiempo contribuyan materialmente a un mismo efecto, finalidad, destino, obligacin, lmite o impacto acumulado, Core o un componente controlado por Core debe evaluarlas como un efecto compuesto conforme a RFC-0003, RFC-0005 y RFC-0007.


La capacidad de crear Subagents o iniciar subdelegaciones es una dimensión explícita de Autonomy Boundary y no puede inferirse de que un Agent pueda ejecutar una tarea principal.

Una Delegation no puede aumentar la profundidad permitida, el número de Subagents, el coste agregado, la concurrencia, el volumen de datos ni el impacto total permitido al Agent o Workflow padre.

Aumentar autonomía requiere una decisión gobernada, no una instrucción del modelo, un prompt, una memoria o un cambio de plan.

## 9. Delegación y subdelegación

Toda Delegation debe ser explícita, verificable, limitada en alcance y correlacionada con la ejecución que la origina.

Una Delegation nunca puede ampliar organización, identidad, scopes, finalidad, clasificación permitida, restricciones, destinos, límites, autonomía, capacidades, aprobaciones ni autoridad de efecto.

Un Subagent recibe únicamente el mínimo contexto, alcance y autonomía necesarios para su tarea concreta.

La Delegation Chain debe conservar el origen, los delegados, los límites heredados, las restricciones compuestas, la correlación y las invalidaciones relevantes.

La delegación circular o no trazable falla cerrado.

Una cadena delegada no puede ocultar al principal responsable.

Una delegación no puede sobrevivir a cambios materiales que invaliden su contexto.

Ningún subagent puede subdelegar salvo que la delegación original lo permita de forma explícita.

Cada efecto relevante de un subagent exige controles propios de RFC-0003, RFC-0005 y RFC-0007.

## 10. Límites de autonomía y aprobación

Una aprobación siempre está ligada a una acción, alcance, payload, contexto y momento concretos.

Aprobar un Plan no aprueba automáticamente todos los Plan Steps.

Aprobar un paso no aprueba versiones futuras, reintentos ampliados ni subdelegaciones.

Un Agent debe escalar cuando un paso exceda su Autonomy Boundary, requiera aprobación, cambie la clasificación, implique destino externo, aumente impacto, exceda límites o presente ambigüedad.

Un Agent no puede dividir artificialmente una acción para evitar una aprobación.

Una secuencia de pasos que en conjunto suponga un efecto relevante debe evaluarse como composición conforme a RFC-0003, RFC-0005 y RFC-0007.

La ausencia, timeout o ambigüedad de aprobación falla cerrado.
Un Agent, Workflow, Subagent, Supervisor, Plan o Delegation no puede fraccionar, distribuir, retrasar, paralelizar ni encadenar una accin para evitar una aprobacin, un lmite de autonoma, una restriccin, un umbral de policy, un presupuesto, una cuota, un control de clasificacin, una obligacin o un Decision Binding aplicable.

La evaluacin de composicin debe preservar organizacin, principal responsable, finalidad, correlacin, Delegation Chain, contexto material, clasificacin, restricciones, destinos, lmites y evidencia aplicables.

Cuando Core no pueda determinar de forma fiable si solicitudes relacionadas forman un efecto compuesto relevante, debe aplicar el tratamiento ms restrictivo permitido por policy o escalar conforme a los controles de aprobacin aplicables.


Un aumento de Autonomy Boundary requiere una decisión gobernada, verificable y correlacionada con la organización, principal responsable, finalidad, límites y periodo aplicables.

La autonomía concedida a un Agent, Workflow o Subagent no puede exceder la autoridad, límites y capacidad de concesión del principal o componente autorizado que la otorga.

Un Supervisor, Sponsor o Agent no puede conceder autonomía, acceso, aprobación, clasificación permitida, destino, capacidad o límite que no posea o no pueda conceder conforme a policy.

Un Agent no puede aprobar sus propios efectos, ni directa ni indirectamente mediante un Subagent, Workflow, Supervisor automatizado o cadena de delegación controlada por el mismo Agent.

Toda aprobación permanece limitada por la autoridad del aprobador y por acción, alcance, payload, contexto, correlación, vigencia y condiciones aplicables.

## 11. Ejecución de workflows y subefectos

Cada Workflow Step se ejecuta dentro de un Turn o ejecución correlacionada.

Un workflow no obtiene un permiso de ejecución global.

Cada lectura, destino externo, capacidad o efecto se gobierna según su operación concreta.

Los subefectos deben conservar correlación con workflow, plan, agente, organización, identidad, delegación y bindings aplicables.

Los retries, entregas duplicadas, subejecuciones y compensaciones no amplían autoridad.

Los efectos compuestos deben cumplir RFC-0007.

Un Workflow Instance no puede marcarse `Completed` mientras haya un subefecto relevante en `Unknown Outcome` o reconciliación pendiente.
La evaluacin de composicin no se limita a pasos consecutivos de un nico Plan, Agent o Workflow.

Cuando varias solicitudes, Plan Steps, Delegations, Subagents, ramas de Workflow, retries, compensaciones, ejecuciones relacionadas o acciones distribuidas en el tiempo contribuyan materialmente a un mismo efecto, finalidad, destino, obligacin, lmite o impacto acumulado, Core o un componente controlado por Core debe evaluarlas como un efecto compuesto conforme a RFC-0003, RFC-0005 y RFC-0007.

## 12. Estado, memoria y reanudación

Agent State es distinto de Agent Memory.

La memoria no es autoridad ni prueba suficiente de contexto vigente.

Planes, estado y memoria heredados deben conservar procedencia, clasificación, taint, restricciones, vigencia y correlación cuando aplique.

Una reanudación exige revalidación de identidad, organización, delegación, policy, autonomía, contexto, conocimiento y restricciones aplicables.

Un workflow pausado, diferido o cancelado no puede continuar por una simple reactivación de memoria.

El estado durable necesario para reanudar o reconciliar debe ser producido o protegido por Core o un componente controlado por Core.

La retención y aislamiento de memoria siguen RFC-0008 y RFC-0009.

## 13. Conocimiento y contexto en agentes

Un Agent es un `Context Consumer` conforme a RFC-0009.

Recibir conocimiento no concede autoridad adicional.

Los datos recuperados, mensajes de usuario, instrucciones del sistema, memoria, salida de herramientas y contenido no confiable deben mantenerse distinguibles.

Contenido recuperado no puede cambiar identidad, policy, scopes, bindings, autonomía ni reglas de Core.

Un Agent solo recibe el conocimiento mínimo permitido.

A Subagent recibe contexto reducido al mínimo necesario y nunca un volcado implícito de toda la memoria o conocimiento del agente padre.

Usar conocimiento para justificar un efecto relevante exige las vinculaciones de RFC-0009 y RFC-0007.

El contexto reducido entregado a un Subagent debe ser ensamblado, autorizado y limitado por Core o por Context Assembly controlado por Core conforme a RFC-0009.

Un Agent padre puede solicitar una tarea para un Subagent, pero no es la autoridad final que decide qué conocimiento, clasificación, restricciones o contexto puede recibir el Subagent.

La salida de un Agent, Subagent o Workflow entregada a otro Agent, Subagent o Workflow debe tratarse como contenido no confiable conforme a RFC-0009.

Un Agent receptor no puede interpretar Inter-Agent Output como instrucción de sistema, identidad, aprobación, policy, scope, Decision Binding, Autonomy Boundary ni autorización de efecto.

Toda afirmación contenida en Inter-Agent Output que pretenda justificar una lectura, destino externo, capacidad, efecto, aprobación, estado de workflow o resultado debe someterse a verificación independiente mediante los controles aplicables de RFC-0003 a RFC-0009.
Un Agent receptor no puede confiar en autoatestaciones del emisor como sustituto de esa verificacin.

Un Agent padre no puede asumir que un resultado producido por un Subagent es correcto, autorizado, completo o libre de contenido adversarial por la sola relación de delegación.

La Delegation Chain conserva la procedencia y el taint de Inter-Agent Output materialmente usado en pasos posteriores, decisiones o efectos.
Un Agent receptor no puede confiar en autoatestaciones del emisor como sustituto de esa verificacin.

## 14. Capacidades, Tools, Integrations y Extensions

Un Agent o Workflow puede solicitar una capacidad, pero no ejecutar por autoridad propia.

Tools, Integrations y Extensions siguen RFC-0006.

Un Agent no puede crear, modificar, habilitar o reconfigurar una Integration, Tool o Extension sin controles y autorización aplicables.

Las capacidades concedidas a un Agent deben estar limitadas por Autonomy Boundary, organización, identidad, policy y contexto.

Un Extension no se convierte en Agent Supervisor ni puede ampliar la autoridad del Agent.

Ningún Agent puede sustituir o eludir Core como frontera de enforcement.

## 15. Fallos, cancelación, Unknown Outcome y reconciliación

Agent, Workflow y Subagent siguen el modelo de Turn de RFC-0008.

La cancelación no prueba que no existiera efecto.

Unknown Outcome de un subefecto relevante mantiene el workflow en estado de reconciliación aplicable.

Ni cancelación, timeout, desconexión, escalación ni terminación del Agent pueden convertir incertidumbre en éxito, fallo o expiración implícitos.

La reconciliación y compensación requieren autorización aplicable.

Agent Termination no elimina evidencia, obligaciones, reconciliación ni trazabilidad pendiente.

Una caída de Agent o Workflow no permite reintento automático que amplíe alcance.


Un Agent, Workflow o Subagent que permanezca sin progreso verificable en espera de aprobación, reanudación, reconciliación o resultado externo debe ser observable por Core o por un componente controlado por Core.

La falta de progreso no crea autoridad, éxito, fallo, cancelación, expiración, replay, compensación ni cierre implícito de una obligación de reconciliación.

Core debe aplicar tratamiento gobernado conforme a policy: conservar estado y evidencia, escalar, limitar trabajo relacionado, solicitar información adicional o iniciar únicamente operaciones autorizadas de reconciliación o compensación.

Cuando un Agent o Workflow entre en un estado terminal, sus Subagents y Delegations dependientes deben recibir una señal de cancelación o terminación cooperativa conforme a RFC-0008.

La terminación en cascada no demuestra que los efectos de Subagents no hayan ocurrido. Todo subefecto que alcance o pueda haber alcanzado Point of No Return conserva evidencia y, cuando corresponda, `Unknown Outcome` o el estado de reconciliación aplicable.

## 16. Aislamiento multi-tenant y límites de recursos

Agent Definitions, Agent Instances, Workflow Definitions, Workflow Instances, planes, estado, memoria, delegaciones, prompts, resultados, trazas y artefactos son organization-scoped.

Ningún agente puede usar memoria, preferencias, planes, conocimiento, cachés o resultados de otra organización.

Límites de coste, concurrencia, duración, subdelegación, profundidad de cadena, volumen de datos y efectos se aplican de forma gobernada.

Agotamiento de recursos falla seguro, preservando evidencia y reconciliación cuando corresponda.

Un Agent no puede generar trabajo infinito o ampliar su propia cuota mediante delegación.

## 17. Observabilidad, evidencia y explicabilidad

Debe existir evidencia suficiente para reconstruir:

* Agent Definition e instancia involucradas;
* Workflow Definition e instancia;
* organización, identidades, sponsor, supervisor y cadena de delegación;
* plan y pasos relevantes;
* autonomía y límites vigentes;
* aprobaciones, denegaciones, escalaciones e invalidaciones;
* conocimiento material usado;
* capacidades solicitadas e invocadas;
* Decision Bindings, reservas, Point of No Return, resultados y reconciliación;
* cancelaciones, reintentos y subefectos;
* cambios de estado y terminación.

Telemetría, prompts, planes, trazas y diagnósticos son destinos de datos gobernados y mantienen el aislamiento de RFC-0006 y RFC-0009.

## 18. Dependencias con RFC-0002 a RFC-0009

RFC-0002: arquitectura lógica, Orchestration Plane y Context Assembly.

RFC-0003: ejecución gobernada y composición.

RFC-0004: organización, identidad, scopes, delegación y revocación.

RFC-0005: policy, obligaciones, límites e invalidación.

RFC-0006: Tools, Integrations, Extensions y Core-mediated enforcement.

RFC-0007: Decision Bindings, reservas, evidencia, Point of No Return y Unknown Outcome.

RFC-0008: Turns, Execution Context, estados, cancelación, reanudación y reconciliación.

RFC-0009: conocimiento, procedencia, restricciones, destinos y Context Consumers.

RFC-0010 no crea una identidad humana adicional, una ruta de autorización alternativa ni una fuente autónoma de autoridad.

Formaliza cómo Agents, Workflows, Plans y Delegations operan bajo los controles ya definidos, preservando límites, correlación, trazabilidad y responsabilidad desde la intención hasta cada efecto o resultado.

## 19. Invariantes

1. Un Agent, Workflow, Plan o Subagent no es autoridad por sí mismo.
2. Todo Agent Instance y Workflow Instance pertenece a una única organización verificable.
3. Todo trabajo relevante conserva identidad, sponsor, correlación y responsabilidad verificables.
4. Una intención, Plan o memoria no constituye autorización.
5. Una Delegation nunca amplía autoridad, alcance, autonomía, clasificación, restricciones, destinos ni límites.
6. Una Delegation Chain no puede ser circular, opaca ni no trazable.
7. Un Subagent recibe el mínimo alcance, contexto y autonomía necesarios.
8. Un Agent no puede aprobar sus propios efectos ni reutilizar una aprobación fuera de su alcance.
9. Cada Plan Step relevante se evalúa bajo los controles aplicables de RFC-0003 a RFC-0009.
10. Un Workflow no puede completar mientras un subefecto relevante permanezca en Unknown Outcome o reconciliación pendiente.
11. Cancelación, timeout o terminación no eliminan evidencia, restricciones, obligaciones ni reconciliación.
12. Reanudación exige reevaluar contexto, identidad, delegación, policy, autonomía y conocimiento.
13. Agentes, workflows, planes, memoria, prompts, trazas y artefactos no se comparten entre organizaciones.
14. Delegación y subdelegación no pueden eludir Core, policy, bindings, aprobaciones ni límites.
15. RFC-0010 no abre una ruta alternativa de autoridad frente a RFC-0002 a RFC-0009.
16. Inter-Agent Output es contenido no confiable y no constituye instrucción de sistema, identidad, aprobación, policy, scope, Decision Binding ni autoridad.
17. La fragmentación de un efecto entre subagentes, ramas, workflows, reintentos o tiempo no reduce los controles, aprobaciones, límites, obligaciones ni evidencia exigibles para el efecto compuesto resultante.
18. La subdelegación, la profundidad de cadena, la cantidad de Subagents y el presupuesto agregado están limitados por Autonomy Boundary.
19. Una Delegation no puede multiplicar cuota, coste, concurrencia, volumen de datos ni impacto total mediante fan-out.
20. Un Agent no puede aprobar sus propios efectos, directa ni indirectamente.
21. La autonomía de un delegado nunca excede la autoridad y límites concedibles por quien la otorga.
22. El contexto de un Subagent es ensamblado y autorizado por Core o Context Assembly controlado por Core.
23. Falta de progreso, terminación o cancelación no cierran ni reinterpretan un Unknown Outcome.

## 20. Consecuencias

Kern puede ofrecer agentes útiles y autónomos dentro de límites claros, pero a cambio cada paso relevante requiere más contexto, correlación, validación, evidencia y posibles escalaciones.

## 21. Preguntas abiertas

* cómo se representan visualmente los planes;
* lenguaje o formato de workflows;
* UX de aprobación y escalación;
* estrategias de planificación;
* coordinación entre múltiples agentes;
* política concreta de autonomía por cliente;
* scheduling;
* límites cuantitativos;
* almacenamiento de memoria;
* mecanismo de ejecución de workflows;
* observabilidad visual;
* control de costes;
* mecanismos técnicos de supervisor;
* prioridades y colas;
* implementación de compensaciones.

## 22. Referencias

* RFC-0002  [RFC-0002-kern-logical-architecture.md](RFC-0002-kern-logical-architecture.md)
* RFC-0003  [RFC-0003-governed-execution-contract.md](RFC-0003-governed-execution-contract.md)
* RFC-0004  [RFC-0004-identity-tenancy-authorization.md](RFC-0004-identity-tenancy-authorization.md)
* RFC-0005  [RFC-0005-policy-evaluation-decision-model.md](RFC-0005-policy-evaluation-decision-model.md)
* RFC-0006  [RFC-0006-capability-tool-extension-contract.md](RFC-0006-capability-tool-extension-contract.md)
* RFC-0007  [RFC-0007-decision-binding-enforcement-evidence.md](RFC-0007-decision-binding-enforcement-evidence.md)
* RFC-0008  [RFC-0008-core-runtime-turn-lifecycle-and-state-model.md](RFC-0008-core-runtime-turn-lifecycle-and-state-model.md)
* RFC-0009  [RFC-0009-governed-knowledge-access-retrieval-and-context-provenance.md](RFC-0009-governed-knowledge-access-retrieval-and-context-provenance.md)

## 23. Historial de cambios

### 0.1 — 2026-06-28

Borrador inicial. Define el modelo de Agents, Workflows, Plans, Delegations y límites de autonomía de Kern, garantizando que la autonomía no cree autoridad nueva ni eluda identidad, policy, conocimiento, bindings, aprobaciones, evidencia o aislamiento.

### 0.2 — 2026-06-28

Endurecimiento del modelo tras revisión independiente. Define explícitamente la frontera de confianza entre agentes, subagentes y workflows; trata la salida inter-agente como contenido no confiable; incorpora subdelegación como límite de autonomía; y refuerza límites de aprobación, concesión de autonomía y escalado gobernado de trabajo pendiente.

### 0.2.1 — 2026-06-28

Correccin final previa al establecimiento del borrador. Extiende la evaluacin de efectos compuestos a subagentes, ramas, workflows relacionados, reintentos y distribucin temporal para impedir la evasin de aprobaciones o lmites por fraccionamiento. Corrige artefactos documentales y refuerza que los atributos de seguridad de Inter-Agent Output son establecidos o verificados por Core.

### Aceptado — 2026-06-28

RFC-0010 se acepta tras revisión independiente, endurecimiento de la frontera de confianza inter-agente y verificación final. Establece el modelo fundacional de Agents, Workflows, Plans, Delegations y autonomía delegada de Kern, garantizando que la autonomía coordinada no cree autoridad nueva, no eluda Core, no amplíe permisos por delegación y no reduzca controles mediante fragmentación de efectos.

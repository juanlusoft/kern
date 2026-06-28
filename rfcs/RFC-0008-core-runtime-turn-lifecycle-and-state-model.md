# RFC-0008 — Core Runtime, Turn Lifecycle and State Model

- **Estado:** Accepted
- **Versión:** 0.2.1
- **Fecha:** 2026-06-27

## 1. Resumen ejecutivo

RFC-0008 define el contrato lógico del Runtime de Kern: cómo una solicitud procedente de un canal se convierte en un Turn gobernado, cómo avanza entre estados, cómo conserva contexto verificable, cómo invoca capacidades a través del Core y cómo termina, falla, se cancela, queda pendiente de aprobación o pasa a ejecución asíncrona.

Este RFC no define la interfaz visual, el protocolo de chat, una tecnología de colas ni la implementación de agentes. Define las propiedades que toda implementación futura debe respetar.

## 2. Problema

Kern necesita un motor de ejecución coherente con la serie de RFCs anteriores. El sistema recibe solicitudes desde canales o experiencias, resuelve identidad y contexto, decide si un Turn puede avanzar, invoca capacidades gobernadas y conserva suficiente evidencia para explicar qué ocurrió.

Sin un contrato de Runtime, una implementación podría confundir conversación con autorización, memoria con autoridad, desconexión con cancelación o asíncrono con permiso implícito. RFC-0008 evita esas ambigüedades.

## 3. Objetivos

- Definir el ciclo de vida de un Turn.
- Separar contexto de ejecución, estado runtime, memoria y persistencia.
- Mantener la ejecución fail-closed ante identidad, organización, permisos o rutas críticas no verificables.
- Asegurar que cualquier acción relevante continúe gobernada por RFC-0003 a RFC-0007.
- Definir estados explícitos, transiciones válidas y resultados terminales.

## 4. No objetivos

- No define la interfaz visual.
- No define el protocolo de chat.
- No define una tecnología concreta de colas, brokers o streams.
- No define la implementación de agentes.
- No reemplaza los contratos de RFC-0002 a RFC-0007.

## 5. Conceptos normativos

### Turn

Unidad individual de ejecución gobernada. Recibe una solicitud identificable, opera bajo un contexto de ejecución verificable y termina en un estado explícito.

### Turn Request

Solicitud concreta que inicia o reanuda un Turn y que contiene o referencia el origen, intención, canal y cualquier metadato necesario para resolver contexto.

### Execution Context

Conjunto verificable de organización, identidad ejecutora, identidad delegada cuando exista, canal o experiencia de origen, ruta solicitada, clasificación, procedencia, límites y contratos aplicables.

### Turn State

Estado lógico y observable en el que se encuentra un Turn en un instante dado.

### Synchronous Turn

Turn que puede producir una respuesta dentro de la interacción actual, aunque sigue sujeto a controles, aprobaciones y contratos gobernados.

### Asynchronous Turn

Turn cuyo trabajo continúa después de la interacción inmediata y que conserva un contexto verificable para revalidación antes de cualquier efecto posterior.

### Deferred Turn

Turn cuyo avance queda pospuesto hasta que exista una condición externa, una aprobación o un resultado gobernado que permita continuar.

### Terminal State

Estado desde el que el Turn no puede continuar sin crear una nueva solicitud o un nuevo Turn explícito.

### Cancellation

Acto gobernado que detiene o intenta detener un Turn o parte de su trabajo, sin implicar necesariamente que no haya ocurrido un efecto externo.

### Channel Disconnect

Pérdida de conectividad entre el usuario o sistema origen y el canal que transportaba la Turn Request.

### Execution Correlation

Identificador y trazabilidad que ligan la solicitud, el Turn, sus transiciones, sus capacidades invocadas y cualquier efecto o resultado observado.

### Execution Snapshot

Representación verificable del contexto y estado relevantes de una ejecución concreta, suficiente para explicar y auditar el resultado del Turn.

### Context Assembly

Proceso gobernado que reúne, valida, clasifica y propaga el contexto necesario para ejecutar un Turn sin confundir procedencia, identidad, permisos ni autoridad.

### Runtime State

Estado operativo interno del Runtime para un Turn concreto, distinto de la memoria del modelo o del estado de negocio externo.

### Durable State

Estado que debe sobrevivir a caídas y ser recuperable para reanudar, auditar, reconciliar o terminar un Turn de manera gobernada.

### Ephemeral State

Estado temporal útil durante una ejecución inmediata pero no suficiente por sí solo para reanudar o autorizar una acción futura.

### Waiting for Approval

Estado en el que un Turn no puede continuar hasta que exista una aprobación válida conforme al contrato aplicable.

### Waiting for External Outcome

Estado en el que el Turn espera un resultado externo gobernado por RFC-0007 o por otro contrato aplicable.

`Waiting for External Outcome` representa la espera normal de una respuesta o resultado externo antes de que exista incertidumbre material.

### Waiting for Reconciliation

Estado de un Turn cuyo efecto relevante alcanzó o pudo alcanzar el Point of No Return y permanece en `Unknown Outcome` conforme a RFC-0007.

Este estado preserva explícitamente que el resultado externo no está confirmado. No constituye éxito, fallo, cancelación ni expiración del efecto.

Solo puede abandonarse mediante evidencia suficiente de resultado observada conforme a RFC-0007, una compensación autorizada y confirmada, o una resolución gobernada que conserve explícitamente la incertidumbre histórica.

`Waiting for Reconciliation` representa una incertidumbre ya declarada por RFC-0007, incluida la imposibilidad de probar si el efecto ocurrió.

Un Turn no es una conversación completa, una sesión, una identidad, una aprobación ni un Decision Binding.

Un Turn es una unidad individual de ejecución gobernada: recibe una solicitud identificable, opera bajo un contexto de ejecución verificable y termina en un estado explícito.

## 6. Modelo de ejecución de un Turn

Un Turn:

- tiene identificador único y correlación;
- pertenece obligatoriamente a una organización verificable;
- tiene identidad ejecutora y, cuando corresponda, identidad delegada;
- queda asociado a un agente, workflow o experiencia concreta;
- conserva el contexto mínimo necesario para explicar su resultado;
- no obtiene autoridad propia por existir;
- no puede ejecutar efectos relevantes sin pasar por RFC-0003, RFC-0005, RFC-0006 y RFC-0007;
- no puede heredar silenciosamente permisos, organización o estado de otro Turn;
- debe poder distinguir entre resultado generado, acción solicitada, acción autorizada, acción ejecutada y resultado observado.

Un Turn no es una frontera de autorización. La autorización de cada acceso, lectura gobernada, capacidad o efecto relevante debe evaluarse según el contrato aplicable y no puede deducirse únicamente de que el Turn fue iniciado correctamente.

## 7. Contexto de ejecución y resolución de identidad

Antes de ejecutar lógica de agente, workflow o herramienta, el Runtime debe resolver y verificar:

- organización;
- identidad ejecutora;
- identidad delegada, cuando exista;
- canal o experiencia de origen;
- agente, workflow o ruta de ejecución solicitada;
- clasificación y procedencia de la entrada;
- límites de recursos y política aplicable;
- correlación e idempotencia aplicable.

Debe fallar cerrado cuando falte una organización, identidad, ruta permitida o atributo crítico.

Un canal puede transportar credenciales y metadatos, pero no puede declarar por sí solo autoridad, organización definitiva, scopes o permisos.

La ausencia, ambigüedad, conflicto, inconsistencia o imposibilidad de verificar un atributo crítico de Execution Context debe impedir la admisión del Turn o producir deny para cualquier efecto pendiente.

Un Runtime no puede elegir arbitrariamente entre valores conflictivos de organización, identidad, delegación, ruta, clasificación, procedencia, restricciones, scopes, límites o correlación.

La resolución de conflicto requiere contexto verificable adicional y la reevaluación aplicable. Mientras persista la ambigüedad, el Turn no obtiene autoridad adicional ni puede producir efectos relevantes.

## 8. Estados y transiciones del Turn

Estados mínimos:

Received, Context Resolving, Ready, Running, Waiting for Approval, Waiting for External Outcome, Waiting for Reconciliation, Deferred, Completed, Denied, Cancelled, Failed, Expired.

Estados terminales:

- Completed
- Denied
- Cancelled
- Failed
- Expired

Estados no terminales:

- Received
- Context Resolving
- Ready
- Running
- Waiting for Approval
- Waiting for External Outcome
- Deferred

Transiciones válidas:

| Estado | Significado | ¿Puede ejecutar efectos? | Transiciones permitidas |
| --- | --- | --- | --- |
| Received | Llegó una Turn Request verificable. | No | Context Resolving, Denied, Expired |
| Context Resolving | Se resuelven identidad, organización y ruta. | No | Ready, Waiting for Approval, Denied, Expired |
| Ready | Puede comenzar ejecución gobernada. | Sí, si los contratos aplican | Running, Waiting for Approval, Deferred, Denied, Expired, Cancelled |
| Running | El Turn está procesando trabajo gobernado. | Sí, sujeto a controles | Waiting for Approval, Waiting for External Outcome, Waiting for Reconciliation, Completed, Failed, Cancelled, Denied, Expired |
| Waiting for Approval | Espera aprobación válida. | No | Ready, Running, Denied, Cancelled, Expired |
| Waiting for External Outcome | Espera resultado externo explícito. | No | Running, Waiting for Reconciliation, Cancelled |
| Waiting for Reconciliation | Resultado externo incierto o pendiente de reconciliación conforme a RFC-0007. | No, salvo una operación de reconciliación o compensación con autorización aplicable | Completed, Failed, Deferred o Cancelled únicamente cuando exista evidencia suficiente, compensación autorizada o una resolución gobernada que conserve la incertidumbre histórica |
| Deferred | Queda pospuesto por condición externa. | No | Ready, Waiting for Approval, Running, Cancelled, Expired |
| Completed | Terminó satisfactoriamente. | No | Ninguna |
| Denied | No recibió autorización suficiente. | No | Ninguna |
| Cancelled | Fue detenido gobernadamente. | No | Ninguna |
| Failed | Terminó con fallo gobernado. | No | Ninguna |
| Expired | Caducó sin continuar. | No | Ninguna |

Aclaraciones:

- no se puede salir silenciosamente de un estado terminal;
- `Denied` no equivale a `Failed`;
- `Cancelled` no demuestra que no haya ocurrido un efecto externo;
- `Waiting for External Outcome` preserva incertidumbre explícita;
- `Waiting for Reconciliation` preserva explícitamente un resultado incierto y no concede autoridad adicional;
- una aprobación no reactiva un Turn sin revalidación aplicable;
- ningún estado habilita una ruta alternativa para saltarse policy, bindings o verificaciones.

`Completed`, `Denied`, `Cancelled`, `Failed` y `Expired` son terminales solo cuando no existe una obligación pendiente de reconciliación, evidencia de resultado o compensación gobernada asociada a un efecto relevante.

Un Turn con `Unknown Outcome` no alcanza un terminal semántico pleno hasta que la incertidumbre se preserve y se trate conforme a RFC-0007.

Un Turn no puede transicionar desde `Waiting for External Outcome` a `Completed`, `Failed` o `Expired` sin Effect Outcome Evidence suficiente conforme a RFC-0007.

Cuando RFC-0007 produzca o preserve `Unknown Outcome`, el Turn debe transicionar a `Waiting for Reconciliation` y no puede declarar `Completed`, `Failed` ni `Expired` por la sola ausencia de respuesta, timeout, desconexión o vencimiento de una espera.

`Expired` solo puede cerrar la admisión, ejecución o espera de un Turn cuando no exista un efecto relevante incierto pendiente de reconciliación. No puede descartar, ocultar ni reemplazar un `Unknown Outcome`.

`Cancelled` no elimina la obligación de conservar `Waiting for Reconciliation` o evidencia equivalente cuando un efecto relevante haya alcanzado o pueda haber alcanzado el Point of No Return.

`Waiting for Reconciliation` no puede convertirse en éxito o fallo por política sin evidencia. Una decisión humana puede definir tratamiento operativo, pero no puede borrar o reinterpretar el hecho histórico de incertidumbre.

Los Turns en `Waiting for Approval`, `Waiting for External Outcome` o `Waiting for Reconciliation` deben ser observables por Core o por un componente controlado por Core para detectar ausencia prolongada de progreso verificable.

La detección de falta de progreso no autoriza a declarar éxito, fallo, expiración, cancelación, consumo, replay, compensación ni liberación de una obligación de reconciliación.

Core debe aplicar un tratamiento gobernado conforme a policy: conservar el estado, solicitar información adicional, escalar a resolución humana, limitar nuevas admisiones relacionadas o iniciar únicamente operaciones de reconciliación o compensación que dispongan de autorización aplicable.

Un `Waiting for Reconciliation` no puede alcanzar `Completed`, `Failed`, `Cancelled` ni `Expired` por el mero transcurso del tiempo o por agotamiento de recursos. Debe preservar explícitamente `Unknown Outcome` y la evidencia disponible hasta que exista evidencia suficiente o una resolución gobernada que conserve la incertidumbre histórica.

## 9. Ejecución síncrona, asíncrona y diferida

Un Turn síncrono puede devolver una respuesta dentro de la interacción actual, pero sigue sujeto a controles.

Un Turn asíncrono conserva contexto y debe revalidarse antes de efectos posteriores.

Un Turn diferido no puede conservar autoridad indefinidamente por haber sido creado antes.

Un trabajo asíncrono debe usar contexto mínimo, durable y verificable.

Reanudación, callback o worker posterior no puede autoafirmar identidad, organización, permisos o validez.

Cualquier efecto tardío requiere revalidación conforme a RFC-0007.

Todo efecto, síncrono o asíncrono, usa los mismos controles de Decision Binding, Binding Reservation, Point of No Return y Enforcement Evidence definidos por RFC-0007. No existe una vía rápida interactiva que reduzca esos controles.

Cuando un efecto alcance `Unknown Outcome`, el Runtime debe conservar la correlación con el Binding, la reserva y la evidencia disponible, y mover el Turn a `Waiting for Reconciliation`.

Una aprobación, callback, reanudación, timeout, cancelación o desconexión de canal no puede convertir `Unknown Outcome` en éxito, fallo, expiración o reintento implícito.

## 10. Cancelación, timeouts y desconexión de canal

Cancelar una interacción no equivale necesariamente a cancelar un efecto ya iniciado.

La desconexión de Telegram, web, SSE o cualquier otro canal no debe crear una vía para continuar sin control.

El Runtime debe intentar detener trabajo no irreversible cuando sea seguro.

Si el Point of No Return fue alcanzado o el resultado es incierto, debe conservar estado explícito y evidencia.

Un Turn cancelado no puede reanudarse automáticamente con más alcance.

La cancelación debe quedar correlacionada y auditable.

Una cancelación, timeout o desconexión no puede convertir `Unknown Outcome` en éxito, fallo, expiración o reintento implícito.

Si el efecto pudo haber alcanzado el Point of No Return, el Turn debe preservar `Waiting for Reconciliation` o evidencia equivalente, no un terminal silencioso.

## 11. Contexto, memoria y persistencia de estado

Ephemeral State: información temporal necesaria durante una ejecución.

Durable State: información recuperable tras caída y necesaria para reanudar, auditar o reconciliar.

Execution Snapshot: contexto verificable de una ejecución concreta.

La memoria conversacional o de agente nunca debe confundirse con autoridad ni autorización.

Se exige que:

- estado, memoria, cachés, resultados, prompts, trazas y artefactos estén aislados por organización;
- el contexto heredado de otro Turn conserve procedencia y clasificación;
- estado no verificable o no atribuible se trate como no confiable o requiera reevaluación;
- no se reconstituya un Turn con datos que permitan ampliar permisos o efecto respecto al contexto original.

El contexto heredado entre Turns o reanudaciones conserva procedencia, clasificación, taint, obligaciones, restricciones y correlación con binding, reserva y evidencia cuando exista.

## 12. Invocación de capacidades y efectos gobernados

El Runtime puede planificar y solicitar capacidades.

Tools, Integrations y Extensions no son autoridad final.

Todo acceso a conocimiento gobernado y todo efecto relevante usa los contratos ya definidos.

Un Turn puede esperar aprobación, Decision Binding o resultado externo.

El Runtime no puede convertir una intención del modelo en un efecto externo sin mediación de Core.

Cualquier subefecto compuesto mantiene correlación y controles propios.

Las operaciones de reconciliación o compensación solo pueden ejecutarse con la autorización aplicable. El Turn no gana autoridad adicional por estar en `Waiting for Reconciliation`.

## 13. Concurrencia, reintentos e idempotencia del Turn

- Turn duplicado no implica permiso para duplicar efectos;
- reintento de Turn no puede ampliar identidad, organización, capability, Integration, payload, destino, obligaciones ni límites;
- el Runtime debe distinguir reintento de entrega de canal, reintento de ejecución y reintento de efecto;
- múltiples Turns concurrentes no pueden compartir estado mutable entre organizaciones;
- idempotencia de canal no equivale a idempotencia de efectos externos;
- cuando exista incertidumbre de resultado, se aplica RFC-0007 y no se repite automáticamente.

## 14. Observabilidad, auditoría y correlación

Exige:

- correlación de Turn, solicitudes, capacidades, bindings y efectos;
- telemetría gobernada conforme a RFC-0006;
- evidencia de estado y transiciones relevante;
- no exponer contenido o metadatos de una organización a otra;
- límites de recursos por organización, identidad, agente y Turn;
- degradación segura ante agotamiento de recursos, timeout o pérdida de estado crítico.

Ante agotamiento de recursos, pérdida de estado crítico o interrupción del Runtime, Kern debe denegar nuevas admisiones o efectos pendientes de forma segura.

Para efectos que hayan alcanzado o puedan haber alcanzado el Point of No Return, debe preservar estado durable, evidencia y `Unknown Outcome` o `Waiting for Reconciliation`, en lugar de declarar éxito, fallo o expiración implícitos.

## 15. Aislamiento multi-tenant y límites de recursos

El Runtime debe aislar:

- ejecución;
- memoria;
- cachés;
- resultados;
- snapshots;
- trazas;
- colas internas;
- artefactos temporales.

Un Turn de una organización no puede observar, reusar ni inferir estado de otra organización sin un contrato explícito y gobernado.

Los límites de recursos por organización, identidad, agente y Turn deben ser observables, aplicables y fail-closed.

Para efectos que hayan alcanzado o puedan haber alcanzado el Point of No Return, debe preservar estado durable, evidencia y `Unknown Outcome` o `Waiting for Reconciliation`, en lugar de declarar éxito, fallo o expiración implícitos.

## 16. Dependencias con RFC-0002 a RFC-0007

- RFC-0002: planos lógicos y Context Assembly;
- RFC-0003: ejecución gobernada;
- RFC-0004: organización, identidad, delegación y revocación;
- RFC-0005: Policy Engine, obligaciones y snapshots;
- RFC-0006: capabilities, Tools, Integrations, Extensions y mediación;
- RFC-0007: Decision Bindings, reserva, Point of No Return, evidencia y resultados inciertos.

RFC-0008 no introduce una nueva autoridad ni una ruta alternativa de ejecución.

Formaliza cómo el Runtime de Kern coordina una unidad de trabajo sin debilitar los controles definidos por RFC-0003 a RFC-0007.

## 17. Invariantes

1. Todo Turn pertenece a una organización verificable.
2. Todo Turn tiene identidad ejecutora verificable.
3. Un Turn no es autorización.
4. Un canal no es autoridad final.
5. Un Turn no hereda permisos silenciosamente de otro Turn.
6. Cada transición relevante queda correlacionada y es auditable.
7. Un Turn no puede ejecutar efectos relevantes sin los controles de RFC-0003 a RFC-0007.
8. Un Turn asíncrono debe revalidarse antes de efectos posteriores.
9. Cancelación o desconexión no borra incertidumbre sobre efectos externos.
10. `Denied`, `Failed`, `Cancelled`, `Expired` y `Completed` son estados semánticamente distintos.
11. Estado o memoria de una organización no se comparte con otra.
12. Un reintento no amplía alcance ni autoridad.
13. Ninguna transición permite omitir Policy Engine, Decision Binding o Core-controlled enforcement cuando aplique.
14. La memoria de agente no constituye autoridad ni prueba de autorización.
15. Falta de contexto crítico, estado durable o capacidad de verificación falla cerrada para el efecto pendiente.
16. Cada estado del Turn tiene un único nombre canónico.
17. Un Turn no puede alcanzar `Completed`, `Failed` ni `Expired` mientras un efecto relevante permanezca en `Unknown Outcome`.
18. `Waiting for Reconciliation` preserva explícitamente la incertidumbre y no concede autoridad adicional.
19. Timeout, cancelación, desconexión o expiración no eliminan la obligación de reconciliación de un efecto incierto.
20. Todo efecto síncrono y asíncrono usa los mismos controles de RFC-0007.
21. Una reanudación exige revalidación de contexto y autoridad aplicable.
22. La procedencia, clasificación, taint, obligaciones y restricciones se conservan en contexto heredado.
23. Un Execution Context ambiguo, conflictivo, inconsistente o no verificable falla cerrado para admisión, reanudación o efecto pendiente.

## 18. Consecuencias

- Permite que las ejecuciones de Kern sean auditables y previsibles.
- Obliga a distinguir claramente entre conversación, turno, sesión y autorización.
- Hace posible una implementación futura sin acoplar el diseño al canal o la interfaz.
- Reduce el riesgo de que memoria, desconexión o reintento generen autoridad implícita.
- Kern prioriza seguridad, trazabilidad y aislamiento de recursos frente a disponibilidad automática cuando una espera no puede resolverse con evidencia suficiente.

## 19. Preguntas abiertas

- representación concreta del estado del Turn;
- mecanismo de persistencia y recuperación;
- transporte de eventos;
- modelo exacto de streaming;
- implementación de cancelación;
- límites cuantitativos concretos;
- planificador de trabajos asíncronos;
- formato de snapshots;
- retención de contexto y trazas;
- UX de estados pendientes, denegados o inciertos.

## 20. Referencias

- RFC-0002 — Kern Logical Architecture
- RFC-0003 — Governed Execution Contract
- RFC-0004 — Identity, Tenancy and Authorization Model
- RFC-0005 — Policy Evaluation and Decision Model
- RFC-0006 — Capability, Tool and Extension Contract
- RFC-0007 — Decision Binding, Enforcement Evidence and Runtime Verification

## 21. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial. Define el contrato lógico del Runtime de Kern, el ciclo de vida de Turns, contexto verificable, estados explícitos, ejecución asíncrona, cancelación, persistencia y coordinación con los controles de ejecución gobernada.

### 0.2 — 2026-06-27

Endurecimiento del modelo de estados tras revisión independiente. Unifica nombres canónicos de estados, integra resultados externos inciertos y reconciliación pendiente, y prohíbe declarar un estado terminal de Turn cuando un efecto relevante continúa sin evidencia de resultado suficiente conforme a RFC-0007.

### 0.2.1 — 2026-06-27

Endurecimiento previo al establecimiento del borrador. Exige fallo cerrado ante contexto ambiguo o conflictivo y define liveness, detección y escalado gobernado para Turns que permanecen esperando aprobación, resultado externo o reconciliación.

### Aceptado — 2026-06-27

RFC-0008 se acepta tras revisión independiente y verificación final. Establece el contrato fundacional del Core Runtime de Kern: Turns con contexto verificable, estados explícitos, revalidación de ejecuciones diferidas, aislamiento multi-tenant y tratamiento de resultados externos inciertos sin rutas alternativas de autoridad.

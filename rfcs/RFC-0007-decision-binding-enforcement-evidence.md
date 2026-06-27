# RFC-0007 — Decision Binding, Enforcement Evidence and Runtime Verification

- **Estado:** Draft
- **Versión:** 0.2.1
- **Fecha:** 2026-06-27

## 1. Resumen ejecutivo

Este RFC define el contrato lógico que Kern necesita para demostrar, en tiempo de efecto, que una operación gobernada corresponde realmente a un Decision Binding íntegro, autenticable, reservado, consumible y verificable por Core.

## 2. Problema

RFC-0003 define ejecución gobernada, Decision Binding, aprobación humana, transformación y auditoría.
RFC-0004 define identidad, tenancy, scopes, delegación y revocación.
RFC-0005 define evaluación de policy, composición y decisiones provisionales.
RFC-0006 define capabilities, tools, extensiones, implementación y enforcement.

Ese modelo todavía necesita un contrato mecánico para:

- ligar el Binding con una operación final exacta;
- reservar el derecho exclusivo a intentar el efecto;
- registrar evidencia durable antes y después del punto de no retorno;
- distinguir éxito, fallo, compensación e incertidumbre;
- impedir replay o amplificación por reintentos;
- revalidar operaciones asíncronas con estado autoritativo fresco;
- fallar cerrado cuando no pueda probarse la autoridad del estado consultado.

## 3. Objetivos

- Definir qué debe probarse antes de ejecutar.
- Separar decisión, reserva, evidencia de enforcement y resultado operativo.
- Mantener el modelo fail-closed ante Binding ausente, obsoleto, ambiguo o no autenticable.
- Evitar que una recomendación, evaluación provisional o aprobación humana aislada produzca efecto.

## 4. No objetivos

- No redefine el motor de policy.
- No redefine el ciclo de ejecución gobernada.
- No introduce un protocolo criptográfico concreto.
- No decide almacenamiento, formato de red ni transporte.
- No elige tecnologías concretas de emisión, reserva, consumo o reconciliación.

## 5. Conceptos normativos

### Decision Binding

Autorización ejecutable y verificable emitida para una solicitud final concreta.
Un Decision Binding no es una recomendación, una respuesta de policy, una aprobación humana ni una credencial amplia. Es una autorización ejecutable y verificable, emitida para una solicitud final concreta y consumible únicamente bajo las restricciones que contiene.

### Binding Integrity and Authenticity

Un Decision Binding debe incluir una prueba verificable de integridad y autenticidad emitida bajo control de Core.

La prueba debe permitir a un Binding Verifier controlado por Core detectar cualquier alteración, sustitución, fabricación o reutilización no autorizada del Binding o de los atributos que liga.

Una afirmación declarativa, un campo auto-reportado, un log de Extension o una respuesta no autenticada de Policy Engine no constituyen prueba suficiente de integridad y autenticidad.

### Binding Issuer

Entidad lógica que emite el Decision Binding final.

### Binding Verifier

Componente que valida el Binding en tiempo de efecto antes de permitir cualquier acción externa.

### Binding Reservation

La Binding Reservation es el único gate lógico que puede conceder el derecho exclusivo a intentar un efecto relevante.

La creación de una Binding Reservation debe comprobar y fijar de forma atómica, frente a otros verificadores y workers concurrentes, que:

- el Binding conserva integridad y autenticidad verificables;
- no está expirado, revocado, invalidado ni previamente consumido;
- la organización, identidad, delegación, policy, Implementation, Integration, artefacto, destinos, obligaciones y límites continúan siendo válidos para la operación;
- el estado autoritativo requerido satisface la frescura exigida por el riesgo;
- no existe otra reserva activa o consumo incompatible para el mismo efecto o subefecto.

Una comprobación de verificación previa que no quede reafirmada dentro de la creación de la reserva no es suficiente para autorizar el Point of No Return.

La reserva no equivale a éxito, consumo final ni confirmación de efecto externo.

Su objetivo es impedir que una revocación intermedia, un segundo worker, una ejecución concurrente o un replay obtengan autoridad para producir el mismo efecto.

### Point of No Return

Instante a partir del cual un efecto externo puede haberse producido y ya no puede garantizarse que no ocurrió.

La ubicación lógica del Point of No Return debe declararse para cada tipo de efecto relevante.

### Effect Intent Evidence

Evidencia durable, emitida por Core o un componente controlado por Core, que registra que un Binding válido fue verificado y reservado para un efecto concreto antes de alcanzar su Point of No Return.

Para este RFC, durable significa que la evidencia se ha comprometido en un estado recuperable por Core tras caída de proceso, host, worker o reinicio del componente que la emitió.

La persistencia únicamente en memoria, en buffers no confirmados o en logs auto-reportados por una Tool, Integration o Extension no satisface este requisito.

### Effect Outcome Evidence

Registra el resultado observado del efecto: completado, rechazado, fallido antes de efecto, parcialmente completado, compensado, no compensable o de resultado incierto.

Debe incluir la evidencia externa disponible, identificadores de correlación externos cuando existan y la relación con el Binding reservado.

### Unknown Outcome

Estado obligatorio cuando Kern no puede demostrar de forma suficiente si el sistema externo produjo o no el efecto tras alcanzar el Point of No Return.

Un Unknown Outcome no autoriza replay automático, nuevo intento implícito ni consumo silencioso como éxito.

### Binding Reconciliation

Proceso gobernado que intenta resolver un Unknown Outcome mediante evidencia autoritativa del sistema externo, trazabilidad disponible, estado de idempotencia, comprobaciones de efecto o procedimientos de compensación aceptados.

La reconciliación no puede ampliar el alcance del Binding original ni emitir efectos adicionales sin autorización nueva.

Binding Reconciliation debe ser idempotente, resumible y resistente a caída.

Una caída, interrupción o reinicio durante la reconciliación no puede transformar un Unknown Outcome en éxito, fallo o autorización de replay de forma implícita.

Tras una interrupción, el estado debe permanecer estable como Unknown Outcome hasta que Core o un componente controlado por Core obtenga evidencia suficiente para registrar un resultado observado, una compensación válida o una resolución humana gobernada.

La reconciliación no puede emitir efectos externos adicionales, repetir el efecto original ni iniciar compensación sin la autorización aplicable.

### Effect-Time Verification

Verificación realizada justo antes del efecto externo.

### Replay

Intento de reutilizar un Binding ya consumido o aplicado a un contexto distinto.

Cuando un tipo de efecto, sistema externo o Integration no permita declarar, acotar o verificar razonablemente su Point of No Return, Kern no puede tratar la operación como plenamente gobernable.

Debe clasificarse conforme al modelo de Integration opaca de RFC-0006 y quedar denegada por defecto para efectos relevantes, salvo excepción explícita de policy con controles reforzados, vigencia limitada, auditoría reforzada y reconocimiento del riesgo residual.

### Authoritative State

Estado maestro verificable para organización, identidad, revocación, delegación y consumo.

## 6. Modelo lógico de Decision Binding

Un Binding debe quedar ligado de forma explícita, exacta y verificable a:

- identificador único;
- organización;
- identidad ejecutora;
- identidad delegada;
- delegación y sus restricciones;
- capability;
- implementation exacta;
- versión;
- identidad inmutable de artefacto;
- integration exacta;
- configuración organization-scoped de integración;
- solicitud final;
- representación canónica verificable del payload final;
- recurso objetivo;
- tipo de efecto;
- destinos permitidos;
- clasificación, procedencia y taint relevantes;
- scopes;
- snapshot, versión o identidad verificable de policy;
- obligaciones;
- aprobación aplicable;
- límites cuantitativos;
- correlación;
- idempotency key o material de idempotencia aplicable;
- hora de emisión;
- expiración;
- condiciones de revocación e invalidación;
- estado de reserva y consumo.

El payload final debe coincidir exactamente con una representación canónica verificable ligada al Binding, incluyendo los elementos de solicitud que puedan alterar recurso, efecto, destino, cantidad, límite o semántica operativa.

Una variación no ligada explícitamente al Binding requiere una nueva evaluación de Policy Engine y un nuevo Binding final.

Un Decision Binding no puede autorizar una Implementation genérica, una versión flotante, un artefacto mutable, una organización implícita, una identidad no verificable, una Integration no ligada, un destino no ligado, obligaciones no verificadas ni un payload distinto del evaluado.

## 7. Emisión y contenido mínimo

Solo Core o un componente controlado por Core puede emitir un Decision Binding.

La emisión ocurre después de la evaluación final de policy y, cuando aplique, después de una aprobación humana válida.

Las transformaciones permitidas deben haber sido reevaluadas antes de emitir el Binding final.

Solo Core o un componente controlado por Core puede actuar como Binding Verifier final, validar la integridad y autenticidad de un Binding, comprobar su estado, reservarlo, consumirlo, decidir deny o registrar Enforcement Evidence.

Una Tool, Integration, Extension, adapter o Extension Publisher puede solicitar una operación o aportar datos de ejecución, pero nunca puede verificar por sí misma un Binding como autoridad final ni decidir que sigue vigente.

Si falta un atributo crítico, el sistema falla cerrado.

## 8. Verificación y consumo en tiempo de efecto

Antes de cualquier efecto externo, irreversible, compuesto, asíncrono o relevante, Core o un componente controlado por Core debe comprobar:

1. integridad y autenticidad del Binding;
2. vigencia y expiración;
3. revocación e invalidación;
4. reserva, consumo y no replay;
5. organización;
6. identidad ejecutora y delegada;
7. scopes y delegación;
8. capability;
9. implementation;
10. versión;
11. artefacto realmente ejecutado;
12. integration y configuración organization-scoped;
13. solicitud y payload final canónico;
14. recurso objetivo;
15. tipo de efecto;
16. destinos observados y permitidos;
17. clasificación, procedencia y taint;
18. policy aplicable;
19. obligaciones;
20. aprobación aplicable;
21. límites cuantitativos;
22. correlación e idempotencia aplicables;
23. precondiciones de aislamiento, mediación y attestation heredadas de RFC-0006.

La verificación debe usar estado autoritativo fresco cuando la revocación, la versión de policy, el lifecycle, la identidad de artefacto, la Integration, las credenciales, las obligaciones o las precondiciones de ejecución puedan haber cambiado.

Timeout, partición, inconsistencia, ausencia de respuesta, imposibilidad de determinar frescura o pérdida de capacidad de verificación constituyen incertidumbre de autoridad y deben resultar en deny para el efecto pendiente.

El intento de efecto externo posterior a una Binding Reservation debe realizarse exclusivamente por Core o por un efector o mediador que cumpla la definición de componente controlado por Core de RFC-0006.

Una Tool, Integration, Extension, adapter o Extension Publisher no puede ejecutar el efecto por fuera de la secuencia de reserva, evidencia y verificación gobernadas.

## 9. Revocación, expiración e invalidación

Un Binding se invalida ante:

- expiración;
- revocación o suspensión de organización;
- revocación o suspensión de identidad;
- cambio de scope;
- cambio de delegación;
- retiro de consentimiento;
- cambio de approval;
- cambio de policy;
- cambio de obligation;
- cambio de integration;
- cambio de configuración organization-scoped;
- cambio de credencial;
- cambio de extension;
- cambio de implementation;
- cambio de versión;
- cambio de artefacto;
- cambio de lifecycle;
- cambio de destino;
- cambio de clasificación o taint relevantes;
- cambio de límites;
- cambio de precondiciones de aislamiento;
- cambio de mediación de efectos;
- cambio de verificación de artefacto;
- pérdida de capacidad de consulta de estado autoritativo.

Un Binding emitido para una operación asíncrona no conserva autoridad por el mero hecho de haber sido emitido antes.

Antes del disparo efectivo de una operación asíncrona, Core o un componente controlado por Core debe repetir la verificación de tiempo de efecto, obtener estado autoritativo fresco y crear o revalidar la reserva aplicable.

## 10. Replay, idempotencia y concurrencia

El flujo lógico obligatorio es:

1. realizar una evaluación preliminar del Binding;
2. crear la Binding Reservation como gate atómico de revalidación, exclusividad y transición;
3. producir Effect Intent Evidence durable;
4. alcanzar el Point of No Return solo después de los pasos anteriores;
5. intentar el efecto externo con la misma identidad de operación y la misma idempotencia ligada al Binding;
6. registrar Effect Outcome Evidence durable;
7. consumir, completar, compensar, invalidar o marcar Unknown Outcome según el resultado observado;
8. reconciliar cualquier Unknown Outcome sin replay implícito.

La verificación, reserva y transición hacia el Point of No Return deben impedir que una revocación, un segundo worker o un reintento concurrente produzcan un segundo efecto autorizado por el mismo Binding.

No se exige una transacción distribuida perfecta entre Kern y un sistema externo. En su ausencia, Kern debe registrar intención durable antes del efecto, mantener identidad de operación estable, usar idempotencia externa cuando exista y tratar como Unknown Outcome cualquier caso en que no pueda probarse el resultado.

Un Binding consumido sin evidencia de efecto no se presenta como éxito.
Un efecto posiblemente producido sin evidencia final no se reintenta automáticamente.
Un Binding reservado no puede liberarse para reintento salvo que Core pueda demostrar que el Point of No Return no fue alcanzado o que el reintento usa una primitiva externa de idempotencia verificable.

Idempotencia no equivale a autorización de replay.

Un reintento autorizado debe conservar el mismo Binding, la misma organización, identidades, delegación, capability, implementation, Integration, payload canónico, recurso, tipo de efecto, destinos, obligaciones y límites cuantitativos.

Un reintento no puede aumentar cantidad, frecuencia, límites, alcance, destinos, scopes, delegación ni efectos.

Cuando un efecto no idempotente no disponga de una forma verificable de evitar duplicación o reconciliar un resultado incierto, Kern debe denegar el reintento automático y requerir resolución gobernada.

Los efectos compuestos requieren Binding individual por subefecto o una composición verificable que mantenga controles de consumo, destino, obligación y límite por subefecto.

Una reserva cuyo titular interrumpe la ejecución antes de alcanzar el Point of No Return solo puede liberarse o cederse cuando Core pueda demostrar que el Point of No Return no fue alcanzado.

Una interrupción después del Point of No Return, o una imposibilidad de probar que no fue alcanzado, debe producir o preservar Unknown Outcome y activar Binding Reconciliation.

## 11. Evidencia de enforcement y auditoría

Enforcement Evidence debe ser emitida por Core o por un componente controlado por Core y debe ser íntegra, autenticable, durable y vinculable al Binding, la reserva y el efecto observado.

Los logs, métricas, trazas o auto-reportes de una Tool, Integration o Extension no sustituyen Enforcement Evidence.

La evidencia mínima antes del Point of No Return incluye:

- binding id;
- identidad del Binding Verifier;
- integridad y autenticidad verificadas;
- policy y versión;
- organización e identidades;
- delegación;
- capability;
- implementation, versión y artefacto observado;
- integration y configuración;
- payload canónico o huella verificable;
- recurso, tipo de efecto y destino;
- obligaciones, aprobación y límites comprobados;
- reserva creada;
- timestamp;
- correlación;
- motivo de deny si aplica.

La evidencia mínima después del efecto incluye:

- resultado observado;
- confirmación, rechazo, timeout o incertidumbre;
- identificador externo o correlación externa cuando exista;
- consumo final;
- estado parcial;
- compensación iniciada, completada o imposible;
- Unknown Outcome, cuando corresponda;
- resultado de reconciliación posterior;
- timestamp y trazabilidad.

La ausencia de Effect Outcome Evidence después del Point of No Return no autoriza considerar el efecto como inexistente ni repetirlo automáticamente.

## 12. Dependencias con RFC-0003 a RFC-0006

RFC-0007 solo cumple su función cuando la integridad y autenticidad del Binding, el Binding Verifier controlado por Core, la reserva atómica, la evidencia durable y la verificación en tiempo de efecto están disponibles para la ruta concreta.

Mientras esas propiedades no puedan demostrarse, las garantías de ejecución gobernada dependientes de Decision Binding en RFC-0003 a RFC-0006 no pueden considerarse plenamente conformes para efectos relevantes.

Este RFC no habilita una ruta de ejecución adicional. Formaliza la condición mecánica necesaria para que las garantías de RFC-0003 a RFC-0006 sean verificables en tiempo de efecto.

## 13. Invariantes

- No existe efecto relevante sin Binding final íntegro, autenticado y válido.
- Solo Core o componente controlado por Core emite o verifica Binding como autoridad final.
- Un Binding liga organization, identidades, delegación, solicitud, payload, capability, implementation, artefacto, Integration, destino, obligaciones y límites.
- Una reserva durable y exclusiva precede al Point of No Return.
- Idempotencia no autoriza replay.
- Un reintento nunca amplía ningún atributo autorizado.
- Un resultado incierto no autoriza replay automático.
- La evidencia de Core prevalece sobre auto-reportes de Extension.
- Todo efecto relevante tiene Effect Intent Evidence y Effect Outcome Evidence, o estado Unknown Outcome explícito.
- Timeout, partición, inconsistencia o incapacidad de consultar estado autoritativo fallan cerrados.
- La verificación asíncrona se repite antes del efecto.
- Un Binding invalidado no puede recuperarse sin nueva evaluación y nueva autorización ejecutable.
- No existe ruta alternativa de verificación o consumo mediante código de Extension.
- La Binding Reservation es el gate atómico de revalidación, exclusividad y transición hacia el Point of No Return.
- Effect Intent Evidence debe ser durable y recuperable por Core antes del Point of No Return.
- Una caída antes del Point of No Return no permite ceder o repetir una reserva sin demostrar que el efecto no pudo haberse producido.
- Una caída después del Point of No Return preserva Unknown Outcome hasta reconciliación gobernada.
- Binding Reconciliation es idempotente, resumible y no habilita efectos, replay ni compensación sin autorización aplicable.
- Un Point of No Return no declarable o no verificable impide tratar el efecto como plenamente gobernable.
- El intento de efecto externo ocurre únicamente mediante Core o un mediador controlado por Core.

## 14. Consecuencias

- Reduce ambigüedad operativa en ejecución distribuida.
- Permite auditoría posterior y verificación activa.
- Hace explícito el punto en el que una autorización deja de ser teórica y se convierte en efecto.
- Exige que las rutas críticas de Kern puedan demostrar autoridad y resultado, no solo intención.

## 15. Preguntas abiertas

Mantén abiertas solo decisiones de implementación, como:

- formato del Binding;
- mecanismo concreto de integridad/autenticidad;
- almacén concreto de reservas, consumo y revocación;
- protocolo concreto de verificación;
- algoritmo de canonicalización;
- modelo de disponibilidad, consistencia y recuperación;
- retención de evidencia;
- mecanismo técnico de reconciliación;
- composición concreta de bindings;
- representación de payloads sensibles.

No mantengas abierta la necesidad de integridad, verificación Core, reserva previa al punto de no retorno, evidencia durable o fail-closed: esas propiedades quedan normativamente exigidas.

## 16. Referencias

- RFC-0003 — Governed Execution Contract
- RFC-0004 — Identity, Tenancy and Authorization Model
- RFC-0005 — Policy Evaluation and Decision Model
- RFC-0006 — Capability, Tool and Extension Contract

## 17. Historial de cambios

### 0.2.1 — 2026-06-27

Endurecimiento tras revisión independiente de seguridad. Define la reserva como gate atómico de autoridad y exclusividad, exige evidencia de intención recuperable antes del Point of No Return, establece reconciliación idempotente y resistente a caídas, y aclara el tratamiento de efectos con Point of No Return no declarable o no verificable.

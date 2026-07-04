# RFC-0003 — Governed Execution Contract

- **Estado:** Accepted
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.2.2
- **Tipo:** Architecture / Security / Foundational
- **Dominio:** Ejecución gobernada y contratos de control
- **Depends on:** RFC-0000, RFC-0001, RFC-0002
- **Decisión requerida:** Aprobación del contrato lógico mínimo para lecturas gobernadas y acciones operativas en Kern

---

## 1. Resumen ejecutivo

Kern necesita un contrato común que impida que una salida de modelo, workflow, canal, plugin o contenido externo se convierta directamente en acceso a datos o acción empresarial.

Este RFC define el contrato lógico mínimo para solicitar, evaluar, autorizar, ejecutar y auditar:

- acciones operativas sobre sistemas externos;
- lecturas gobernadas de conocimiento empresarial;
- aprobaciones humanas;
- restricciones de datos, alcance, coste y frecuencia;
- operaciones derivadas de contenido no confiable.

El objetivo no es decidir la implementación técnica de Policy Engine, Tool Engine o Knowledge Engine.

El objetivo es asegurar que todos comparten una misma frontera gobernada.

El contrato no solo describe el camino correcto. Debe exigir que una decisión de política verificable quede ligada a la solicitud final, a las identidades aplicables, a la organización, al alcance y al efecto autorizado antes de que una tool pueda ejecutar una operación. El mecanismo técnico concreto de ese binding se decidirá después, pero el requisito lógico es normativo.

---

## 2. Problema

Sin un contrato explícito, cada integración puede inventar su propio camino:

- un agente llama directamente a una API;
- un workflow ejecuta una acción sin pasar por política;
- una lectura de conocimiento evita controles de organización;
- un plugin interpreta una instrucción externa como autorización;
- una aprobación humana no queda asociada a la operación concreta;
- una acción queda auditada sin saber quién la solicitó, qué la originó o qué política la permitió.

Esto rompe la promesa central de Kern: permitir inteligencia empresarial útil sin perder control operativo.

---

## 3. Objetivos

Este contrato debe:

1. Exigir identidad, organización y tenancy antes de cualquier lectura o acción.
2. Distinguir entre una solicitud, una decisión de política, una aprobación y una ejecución.
3. Tratar la procedencia y confianza del contenido como contexto de seguridad.
4. Permitir que Policy Engine permita, deniegue, limite, transforme o requiera aprobación.
5. Aplicar controles tanto a lecturas de conocimiento como a acciones operativas.
6. Asegurar que workflows, agentes, plugins y canales usan la misma frontera gobernada.
7. Permitir auditoría suficiente sin guardar indiscriminadamente contenido sensible.
8. Mantener contratos tecnológicos neutrales y extensibles.

---

## 4. No objetivos

Este RFC no decide:

- modelo formal de roles, permisos o atributos;
- sintaxis de políticas;
- sistema de autenticación;
- protocolo de transporte;
- formato exacto de schemas;
- mecanismo técnico de aprobación humana;
- implementación de sandboxing;
- almacenamiento de auditoría;
- UI de administración;
- taxonomía completa de riesgo;
- niveles concretos de clasificación de datos;
- modelo de facturación o presupuestos.

Estas decisiones requerirán RFCs posteriores.

---

## 5. Conceptos normativos

### 5.1 Identidad ejecutora e identidad delegada

Toda solicitud gobernada debe identificar la identidad ejecutora y, cuando exista, la identidad delegada.

La identidad ejecutora representa al agente, workflow, servicio o componente que solicita o realiza una operación dentro de Kern.

La identidad delegada representa a la persona u organización en cuyo nombre se inicia una operación.

Policy Engine debe evaluar ambas identidades, su relación y el alcance solicitado aplicando privilegio mínimo.

Las operaciones programadas o iniciadas sin una persona concreta deben usar una identidad de servicio explícita, autorizada y auditable. No deben inventar una identidad delegada humana.

### 5.2 Decision Binding

Un Decision Binding es una evidencia verificable, emitida por el plano de control, que vincula una decisión de política con una solicitud concreta y final.

Debe incluir o referenciar, como mínimo:

- identificador de solicitud;
- organización;
- identidad ejecutora;
- identidad delegada, cuando exista;
- tipo de operación;
- alcance autorizado;
- huella del payload final;
- referencias de procedencia, clasificación y confianza aplicables;
- decisión de policy y versión de policy;
- aprobación humana asociada, cuando exista;
- expiración;
- identificador de correlación;
- restricciones, límites o transformaciones aplicadas.

Tool Engine y Knowledge Engine deben rechazar una operación cuando el Decision Binding falte, no sea válido, esté caducado, se haya emitido para otra solicitud, no coincida con el payload final o no pueda verificarse.

Este RFC no decide el formato criptográfico, token, firma o mecanismo técnico concreto de verificación.

Cuando una operación requiera aprobación humana, Kern puede producir una evaluación de policy provisional antes de la aprobación. Esa evaluación debe estar ligada a la solicitud final, su payload final, alcance, organización, identidades, restricciones y riesgos relevantes.

La aprobación humana se vincula a esa evaluación provisional y a la solicitud final. Solo después de una aprobación válida puede emitirse el Decision Binding final para ejecución.

El Decision Binding final debe referenciar la evaluación provisional y la aprobación consumible correspondientes. Tool Engine no puede ejecutar basándose únicamente en una evaluación provisional o en una aprobación sin Decision Binding final.

### 5.3 Idempotencia y correlación

Toda Action Request debe incluir una clave de idempotencia o un mecanismo equivalente cuando la operación pueda reintentarse, producir efectos irreversibles o generar duplicados.

La clave debe estar ligada a la organización, operación y alcance autorizado.

Toda operación debe conservar un identificador de correlación interno y, cuando exista, una referencia de correlación con el sistema externo.

### 5.4 Solicitud gobernada

Una solicitud gobernada es una petición para leer conocimiento empresarial o ejecutar una acción operativa.

Toda solicitud gobernada debe incluir, como mínimo:

- identificador único;
- organización;
- identidad ejecutora;
- identidad delegada, cuando exista;
- tipo de operación;
- recurso o capacidad solicitada;
- alcance solicitado;
- origen inmediato y cadena de procedencia disponible;
- referencias brutas de origen aportadas por el solicitante;
- clasificación, confianza y taint asignados por una frontera controlada por Kern;
- correlación con sesión, workflow o ejecución de agente;
- límites aplicables;
- Decision Binding cuando la solicitud pase a ejecución;
- referencias de auditoría.

El solicitante puede aportar referencias brutas de origen, pero no puede asignar por sí mismo confianza, clasificación, taint ni autoridad.

La procedencia debe poder conservar una cadena transitiva de fuentes relevantes. Un salto intermedio no puede eliminar por sí solo los atributos de procedencia o taint de una fuente anterior.

### 5.5 Action Request

Una Action Request solicita un cambio, comunicación, activación, transferencia, configuración o efecto operativo sobre un sistema externo o una persona.

Una Action Request siempre es una operación relevante.

Una acción compuesta o integración con múltiples efectos debe descomponerse en Action Requests gobernadas o en un lote explícitamente limitado, identificable y auditable.

Una aprobación no puede cubrir efectos futuros indeterminados.

Cuando una Action Request derive de Knowledge Request, debe conservar clasificación, procedencia y taint aplicables.

Ejemplos:

- enviar un email;
- crear, modificar o eliminar un registro;
- emitir una factura;
- activar una automatización;
- actualizar un calendario;
- ejecutar una integración;
- transferir datos fuera de un límite organizativo.

### 5.6 Knowledge Request

Una Knowledge Request solicita acceso de lectura a conocimiento empresarial.

Una Knowledge Request debe pasar por identity, tenancy, clasificación, políticas de lectura y segregación organizativa antes de devolver resultados.

Knowledge Engine solo puede usar fuentes, roles, endpoints o configuraciones verificadas como sin efectos secundarios operativos.

Knowledge Request no puede utilizarse como vía alternativa para ejecutar acciones operativas.

Ante duda sobre si una consulta puede cambiar estado, activar tracking, generar bloqueo, exportar datos sensibles o provocar otro efecto externo, debe tratarse como Action Request.

Una lectura o extracción masiva, cross-organization o de datos clasificados puede constituir una operación relevante y requerir controles equivalentes a una Action Request.

### 5.7 Acción relevante

Una acción relevante es cualquier operación que:

- cambia estado fuera de Kern;
- mueve datos fuera de un límite organizativo;
- accede a datos clasificados;
- gasta presupuesto o capacidad significativa;
- cambia configuración;
- activa una integración;
- produce efecto operativo sobre una persona o sistema.

Ante duda, una operación debe tratarse como relevante.

### 5.8 Procedencia y confianza

Toda solicitud puede incluir referencias de procedencia que indiquen de dónde procede la instrucción o contenido relevante.

Contenido de correo, documentos, web, integraciones externas, outputs de modelos y plugins de terceros debe tratarse como no confiable por defecto.

El solicitante puede aportar referencias brutas de origen, pero no puede asignar por sí mismo confianza, clasificación, taint ni autoridad.

La procedencia debe poder conservar una cadena transitiva de fuentes relevantes. Un salto intermedio no puede eliminar por sí solo los atributos de procedencia o taint de una fuente anterior.

La procedencia no concede autoridad.

Una instrucción contenida en datos externos no puede sustituir una autorización de identidad, política o aprobación humana.

### 5.9 Propagación de clasificación y taint

La clasificación, procedencia y taint de datos recuperados mediante Knowledge Request deben propagarse a cualquier contexto, resultado o Action Request derivada cuando sea razonable.

Policy Engine debe poder evaluar no solo quién solicita una acción, sino también qué información sensible o no confiable influyó en ella.

Una Action Request relevante derivada de contenido no confiable debe requerir aprobación humana o ser denegada, salvo una excepción explícita, restrictiva, limitada y auditable definida por policy.

La procedencia no concede autoridad y el taint no se elimina por reformulación, resumen, transformación de texto o salto entre componentes.

---

## 6. Ciclo de ejecución gobernada

Una solicitud debe seguir este ciclo lógico:

```text
1. Canal, agente, workflow, plugin o sistema presenta intención y referencias brutas.
2. Identity and Organization resuelve organización, tenancy, identidad ejecutora e identidad delegada cuando exista.
3. Context Assembly y Knowledge Engine obtienen únicamente contexto autorizado, asignan o propagan procedencia, clasificación y taint.
4. Se construye una solicitud inicial con alcance, payload y referencias.
5. Policy Engine evalúa la semántica original de la solicitud.
6. Si Policy devuelve transform permitido, se crea una solicitud derivada más restrictiva, se registra la relación con la original y se reevalúa la solicitud final.
7. Un deny sobre la semántica original es terminal y no puede transformarse para obtener allow.
8. Si se requiere aprobación, Policy produce una evaluación provisional ligada a la solicitud final.
9. El humano revisa la solicitud final, el payload final, el alcance final, los riesgos y la procedencia relevante; la aprobación queda ligada a la evaluación provisional y se consume en el primer intento de ejecución.
10. Policy emite un Decision Binding final, verificable y ejecutable, ligado a la solicitud final, la evaluación provisional y la aprobación válida cuando aplique.
11. Audit registra de forma durable la intención antes de un efecto irreversible.
12. Tool Engine o Knowledge Engine verifica el Decision Binding, el payload final, la idempotencia, la organización y las restricciones antes de ejecutar.
13. La ejecución autorizada ocurre.
14. Audit registra resultado, error, correlación externa y evidencia permitida.
15. Observability registra telemetría sin convertirse en un canal lateral de datos sensibles.
16. El resultado vuelve al solicitante.
```

No existe un camino alternativo para ejecutar acciones o leer conocimiento fuera de este ciclo.

Los controles dinámicos relevantes deben poder reevaluarse en el punto de uso antes de ejecutar, para evitar cambios de contexto entre autorización y efecto.

Un defer nunca permite ejecución. Debe asignarse a una autoridad resolutora, tener plazo de resolución y terminar en deny efectivo si expira, falla o no se resuelve.

---

## 7. Decisiones de política

Policy Engine puede devolver una de estas decisiones lógicas:

* `allow`: permite la operación dentro del alcance solicitado;
* `deny`: bloquea la operación;
* `limit`: permite una operación con alcance, frecuencia, coste, datos o capacidad reducidos;
* `transform`: produce una solicitud derivada, explícita y auditable, que debe ser semánticamente más restrictiva y reevaluarse antes de cualquier ejecución;
* `require_approval`: bloquea temporalmente la ejecución hasta recibir aprobación válida;
* `defer`: no puede decidir con la información disponible y requiere resolución adicional.

`deny` es terminal para la solicitud original y no puede convertirse en `allow`, `limit` o `transform` mediante una reevaluación posterior.

`transform` solo puede reducir alcance, redactar datos, imponer límites o sustituir una operación por otra semánticamente más restrictiva.

`transform` no puede ampliar alcance, cambiar destinatario, modificar identidad delegada, elevar privilegios, aumentar presupuesto, cambiar un recurso objetivo ni convertir una operación en otra con mayor efecto operativo.

Toda transformación debe generar una solicitud derivada con referencias a la solicitud original, huellas pre-transformación y post-transformación, y auditoría de la modificación.

La solicitud derivada debe reevaluarse antes de ejecución. Una transformación no puede utilizarse para escapar de un deny terminal sobre la semántica original.

`limit` debe expresar restricciones aplicables y medibles. Tool Engine debe rechazar ejecutar una operación si no puede aplicar, verificar o medir los límites impuestos.

`defer` nunca es ejecutable. Debe identificar una autoridad resolutora y un plazo. Si no se resuelve dentro del plazo, la solicitud termina como deny efectivo y se audita.

---

## 8. Aprobación humana

Una aprobación humana debe asociarse a una solicitud concreta y no puede reutilizarse fuera de su organización, alcance, operación y periodo de validez.

La aprobación se realiza únicamente sobre la solicitud final posterior a cualquier transformación permitida.

Debe vincularse de forma verificable a:

- huella del payload final;
- alcance final;
- organización;
- identidad ejecutora;
- identidad delegada, cuando exista;
- evaluación provisional de policy asociada;
- política y versión aplicable;
- expiración;
- identificador de solicitud y correlación.

La aprobación no requiere que exista previamente un Decision Binding final. Debe quedar ligada a la solicitud final y a la evaluación provisional de policy correspondiente.

El Decision Binding final se emite después de una aprobación válida y debe referenciar tanto la evaluación provisional como la aprobación consumible.

Una aprobación es de un solo uso. Debe consumirse atómicamente en el primer intento de ejecución, incluso cuando la ejecución falle.

Si cambia el payload, el alcance, la organización, la identidad, la policy aplicable o el Decision Binding, la aprobación queda invalidada.

Una aprobación debe registrar, como mínimo:

* identidad de quien aprueba;
* organización;
* solicitud aprobada;
* alcance aprobado;
* momento de aprobación;
* caducidad, cuando aplique;
* decisión de política asociada;
* evidencia de auditoría.

Una aprobación no puede ampliar permisos que la identidad aprobadora no posea.

---

## 9. Requisitos para Tool Engine

Tool Engine debe:

* aceptar únicamente Action Requests válidas;
* validar schema, organización, identidad, permisos y condiciones;
* ejecutar solo después de una decisión de política válida;
* respetar límites, transformaciones y aprobaciones;
* usar secretos y accesos mínimos necesarios;
* impedir que una tool amplíe sus propios permisos;
* registrar evidencia de ejecución;
* devolver resultados, errores y referencias de auditoría;
* distinguir solicitud, autorización, ejecución y resultado.

Tool Engine debe verificar el Decision Binding antes de cada efecto externo.

Debe impedir que el poder efectivo de una credencial externa exceda el alcance autorizado por la solicitud. Cuando el sistema externo lo permita, debe preservar atribución on-behalf-of o una correlación equivalente entre la identidad interna de Kern y la operación externa.

Cuando no sea posible limitar técnicamente una credencial al alcance autorizado, la integración debe tratarse como de mayor riesgo y requerir controles adicionales definidos por policy.

Tool Engine debe rechazar solicitudes mutadas, bindings caducados, approvals reutilizadas, límites no aplicables o claves de idempotencia incompatibles.

Tool Engine no decide por sí mismo el modelo de autorización global.

## 10. Requisitos para Knowledge Engine

Knowledge Engine debe:

* aceptar únicamente Knowledge Requests válidas;
* validar organización, identidad, clasificación y restricciones de lectura;
* filtrar o particionar resultados por organización antes de recuperarlos;
* conservar referencias de procedencia y clasificación;
* respetar retención, eliminación y minimización;
* devolver referencias y resultados sujetos a política;
* impedir que recuperación de conocimiento se convierta en autorización de una acción.

Knowledge Engine debe verificar el Decision Binding cuando una lectura sea relevante, clasificada, masiva, cross-organization o esté sometida a límites explícitos.

Debe impedir que resultados con clasificación o taint aplicable pierdan esos atributos cuando se entreguen a Context Assembly, Agent Engine o una Action Request derivada.

Knowledge Engine no puede devolver contenido de otra organización salvo política explícita de compartición.

## 11. Requisitos para Context Assembly

Context Assembly debe:

* construir contexto usando únicamente datos autorizados;
* conservar referencias de procedencia, confianza y clasificación;
* evitar convertir contenido no confiable en autoridad;
* permitir que Policy Engine aumente controles cuando una solicitud derive de contenido no confiable;
* minimizar contenido sensible según políticas de acceso y retención;
* mantener referencias entre el contexto utilizado y las solicitudes derivadas cuando sea razonable.

Context Assembly debe distinguir datos, instrucciones confiables y contenido no confiable.

No puede promover contenido no confiable a instrucción autorizada por resumirlo, traducirlo, reformularlo o mezclarlo con contenido confiable.

Debe permitir limitar el blast radius de una misma fuente no confiable, incluyendo volumen de acciones derivadas, alcance y frecuencia.

Este RFC no afirma que la procedencia elimine por completo prompt injection.

---

## 12. Auditoría y observabilidad

Antes de un efecto irreversible, Audit debe registrar una intención durable que incluya al menos organización, identidades, solicitud, alcance, Decision Binding, huella de payload, idempotency key y referencias de procedencia aplicables.

Después de la ejecución, Audit debe registrar resultado, error, intentos denegados, deferred, expirados y fallidos, junto con correlación externa cuando exista.

La evidencia debe poder preservar huellas, fingerprints o referencias de datos sensibles sin requerir almacenar indiscriminadamente su contenido completo.

La auditoría debe ser resistente a manipulación según un mecanismo técnico que se definirá en un RFC posterior.

Toda solicitud relevante debe producir evidencia de auditoría suficiente para responder:

* quién solicitó la operación;
* para qué organización;
* qué tipo de operación se intentó;
* qué recurso, tool o knowledge source intervino;
* qué política decidió;
* si hubo aprobación humana;
* qué resultado o error ocurrió;
* qué referencias de procedencia y clasificación aplicaron;
* qué versión de componentes participó.

La auditoría debe respetar minimización, retención y control de acceso.

Observability no puede almacenar payloads sensibles completos ni convertirse en una vía de acceso a datos con controles inferiores a Audit.

Debe priorizar métricas, agregados, identificadores, referencias, trazas minimizadas y datos operativos sujetos a controles de acceso adecuados.

Observability puede registrar métricas, trazas, rendimiento, degradaciones y consumo con retención y granularidad distintas de Audit.

---

## 13. Invariantes

1. Ninguna salida de modelo es autoridad por sí misma.
2. Ningún solicitante puede autoasignarse confianza, clasificación, taint, permisos o condición de recurso de plataforma.
3. Toda ejecución relevante requiere Decision Binding válido, verificable, no caducado y ligado al payload final.
4. Un deny terminal nunca puede transformarse para obtener permiso.
5. Un defer no resuelto nunca puede ejecutar.
6. Toda aprobación es de un solo uso y queda ligada a solicitud final, alcance final y payload final.
7. Toda acción relevante derivada de contenido no confiable requiere aprobación humana o denegación, salvo excepción explícita y limitada de policy.
8. La clasificación, procedencia y taint no se pierden al pasar de Knowledge a Context Assembly o Action Request.
9. Todo recurso es organization-scoped por defecto.
10. Un recurso de plataforma solo puede declararse mediante autoridad explícita del Control Plane y debe quedar auditado.
11. Una acción compuesta no puede ocultar efectos múltiples no gobernados.
12. Una solicitud relevante irreversible debe registrar intención durable antes de ejecución.
13. Observability no puede convertirse en canal lateral de payloads sensibles.

## 14. Consecuencias

Aceptar este RFC implica que futuros contratos de tools, knowledge sources, workflows, agents, channels, plugins y extensiones deben implementar o adaptarse a esta frontera gobernada.

Ninguna integración puede introducir una vía de acción o lectura que evite el contrato de ejecución gobernada.

Cualquier excepción requiere RFC explícito.

---

## 15. Preguntas abiertas

1. ¿Qué formato técnico usará Decision Binding y cómo se verificará entre módulos?
2. ¿Qué taxonomía versionada de confianza, clasificación y taint debe existir?
3. ¿Qué excepciones explícitas pueden permitir acciones relevantes derivadas de contenido no confiable?
4. ¿Qué modelo de delegación y atribución on-behalf-of puede soportar cada integración externa?
5. ¿Cómo se limitará técnicamente el alcance efectivo de credenciales externas?
6. ¿Qué políticas de expiración, revocación y reintento aplicarán a Decision Bindings y aprobaciones?
7. ¿Cómo se representarán operaciones parcialmente reversibles, compensables o por lote?
8. ¿Qué mecanismos técnicos garantizan audit tamper-evident y retención compatible con privacidad?
9. ¿Qué umbrales convierten una lectura, exportación o extracción en operación relevante?
10. ¿Cómo se aplicará el límite de blast radius ante una fuente no confiable?

## 16. Referencias

* RFC-0000 — The Kern RFC Process
* RFC-0001 — Kern Manifesto
* RFC-0002 — Kern Logical Architecture

---

## 17. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial del contrato de ejecución gobernada de Kern.

### 0.2 — 2026-06-27

Rediseño parcial tras revisión independiente de seguridad y arquitectura. Introduce identidades ejecutora y delegada, Decision Binding verificable, propagación de procedencia, clasificación y taint, restricciones sobre transform y defer, aprobaciones de un solo uso ligadas a la solicitud final, auditoría write-ahead, idempotencia, controles sobre acciones compuestas y límites frente a contenido no confiable.

### 0.2.1 — 2026-06-27

Aclaración del orden entre evaluación provisional de policy, aprobación humana y Decision Binding final. Evita una dependencia circular entre aprobación y autorización ejecutable, y precisa que toda transformación genera una solicitud derivada que debe reevaluarse.

### 0.2.2 — 2026-06-27

RFC Accepted por el Technical Owner tras revisión independiente de seguridad y arquitectura. Este contrato se convierte en la referencia fundacional de Kern para solicitudes gobernadas, Decision Bindings, aprobaciones humanas, ejecución mediada, procedencia, auditoría e idempotencia.

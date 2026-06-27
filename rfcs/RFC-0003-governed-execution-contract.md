# RFC-0003 â€” Governed Execution Contract

- **Estado:** Accepted
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.2.2
- **Tipo:** Architecture / Security / Foundational
- **Dominio:** EjecuciÃ³n gobernada y contratos de control
- **Depends on:** RFC-0000, RFC-0001, RFC-0002
- **DecisiÃ³n requerida:** AprobaciÃ³n del contrato lÃ³gico mÃ­nimo para lecturas gobernadas y acciones operativas en Kern

---

## 1. Resumen ejecutivo

Kern necesita un contrato comÃºn que impida que una salida de modelo, workflow, canal, plugin o contenido externo se convierta directamente en acceso a datos o acciÃ³n empresarial.

Este RFC define el contrato lÃ³gico mÃ­nimo para solicitar, evaluar, autorizar, ejecutar y auditar:

- acciones operativas sobre sistemas externos;
- lecturas gobernadas de conocimiento empresarial;
- aprobaciones humanas;
- restricciones de datos, alcance, coste y frecuencia;
- operaciones derivadas de contenido no confiable.

El objetivo no es decidir la implementaciÃ³n tÃ©cnica de Policy Engine, Tool Engine o Knowledge Engine.

El objetivo es asegurar que todos comparten una misma frontera gobernada.

El contrato no solo describe el camino correcto. Debe exigir que una decisiÃ³n de polÃ­tica verificable quede ligada a la solicitud final, a las identidades aplicables, a la organizaciÃ³n, al alcance y al efecto autorizado antes de que una tool pueda ejecutar una operaciÃ³n. El mecanismo tÃ©cnico concreto de ese binding se decidirÃ¡ despuÃ©s, pero el requisito lÃ³gico es normativo.

---

## 2. Problema

Sin un contrato explÃ­cito, cada integraciÃ³n puede inventar su propio camino:

- un agente llama directamente a una API;
- un workflow ejecuta una acciÃ³n sin pasar por polÃ­tica;
- una lectura de conocimiento evita controles de organizaciÃ³n;
- un plugin interpreta una instrucciÃ³n externa como autorizaciÃ³n;
- una aprobaciÃ³n humana no queda asociada a la operaciÃ³n concreta;
- una acciÃ³n queda auditada sin saber quiÃ©n la solicitÃ³, quÃ© la originÃ³ o quÃ© polÃ­tica la permitiÃ³.

Esto rompe la promesa central de Kern: permitir inteligencia empresarial Ãºtil sin perder control operativo.

---

## 3. Objetivos

Este contrato debe:

1. Exigir identidad, organizaciÃ³n y tenancy antes de cualquier lectura o acciÃ³n.
2. Distinguir entre una solicitud, una decisiÃ³n de polÃ­tica, una aprobaciÃ³n y una ejecuciÃ³n.
3. Tratar la procedencia y confianza del contenido como contexto de seguridad.
4. Permitir que Policy Engine permita, deniegue, limite, transforme o requiera aprobaciÃ³n.
5. Aplicar controles tanto a lecturas de conocimiento como a acciones operativas.
6. Asegurar que workflows, agentes, plugins y canales usan la misma frontera gobernada.
7. Permitir auditorÃ­a suficiente sin guardar indiscriminadamente contenido sensible.
8. Mantener contratos tecnolÃ³gicos neutrales y extensibles.

---

## 4. No objetivos

Este RFC no decide:

- modelo formal de roles, permisos o atributos;
- sintaxis de polÃ­ticas;
- sistema de autenticaciÃ³n;
- protocolo de transporte;
- formato exacto de schemas;
- mecanismo tÃ©cnico de aprobaciÃ³n humana;
- implementaciÃ³n de sandboxing;
- almacenamiento de auditorÃ­a;
- UI de administraciÃ³n;
- taxonomÃ­a completa de riesgo;
- niveles concretos de clasificaciÃ³n de datos;
- modelo de facturaciÃ³n o presupuestos.

Estas decisiones requerirÃ¡n RFCs posteriores.

---

## 5. Conceptos normativos

### 5.1 Identidad ejecutora e identidad delegada

Toda solicitud gobernada debe identificar la identidad ejecutora y, cuando exista, la identidad delegada.

La identidad ejecutora representa al agente, workflow, servicio o componente que solicita o realiza una operaciÃ³n dentro de Kern.

La identidad delegada representa a la persona u organizaciÃ³n en cuyo nombre se inicia una operaciÃ³n.

Policy Engine debe evaluar ambas identidades, su relaciÃ³n y el alcance solicitado aplicando privilegio mÃ­nimo.

Las operaciones programadas o iniciadas sin una persona concreta deben usar una identidad de servicio explÃ­cita, autorizada y auditable. No deben inventar una identidad delegada humana.

### 5.2 Decision Binding

Un Decision Binding es una evidencia verificable, emitida por el plano de control, que vincula una decisiÃ³n de polÃ­tica con una solicitud concreta y final.

Debe incluir o referenciar, como mÃ­nimo:

- identificador de solicitud;
- organizaciÃ³n;
- identidad ejecutora;
- identidad delegada, cuando exista;
- tipo de operaciÃ³n;
- alcance autorizado;
- huella del payload final;
- referencias de procedencia, clasificaciÃ³n y confianza aplicables;
- decisiÃ³n de policy y versiÃ³n de policy;
- aprobaciÃ³n humana asociada, cuando exista;
- expiraciÃ³n;
- identificador de correlaciÃ³n;
- restricciones, lÃ­mites o transformaciones aplicadas.

Tool Engine y Knowledge Engine deben rechazar una operaciÃ³n cuando el Decision Binding falte, no sea vÃ¡lido, estÃ© caducado, se haya emitido para otra solicitud, no coincida con el payload final o no pueda verificarse.

Este RFC no decide el formato criptogrÃ¡fico, token, firma o mecanismo tÃ©cnico concreto de verificaciÃ³n.

Cuando una operación requiera aprobación humana, Kern puede producir una evaluación de policy provisional antes de la aprobación. Esa evaluación debe estar ligada a la solicitud final, su payload final, alcance, organización, identidades, restricciones y riesgos relevantes.

La aprobación humana se vincula a esa evaluación provisional y a la solicitud final. Solo después de una aprobación válida puede emitirse el Decision Binding final para ejecución.

El Decision Binding final debe referenciar la evaluación provisional y la aprobación consumible correspondientes. Tool Engine no puede ejecutar basándose únicamente en una evaluación provisional o en una aprobación sin Decision Binding final.

### 5.3 Idempotencia y correlaciÃ³n

Toda Action Request debe incluir una clave de idempotencia o un mecanismo equivalente cuando la operaciÃ³n pueda reintentarse, producir efectos irreversibles o generar duplicados.

La clave debe estar ligada a la organizaciÃ³n, operaciÃ³n y alcance autorizado.

Toda operaciÃ³n debe conservar un identificador de correlaciÃ³n interno y, cuando exista, una referencia de correlaciÃ³n con el sistema externo.

### 5.4 Solicitud gobernada

Una solicitud gobernada es una peticiÃ³n para leer conocimiento empresarial o ejecutar una acciÃ³n operativa.

Toda solicitud gobernada debe incluir, como mÃ­nimo:

- identificador Ãºnico;
- organizaciÃ³n;
- identidad ejecutora;
- identidad delegada, cuando exista;
- tipo de operaciÃ³n;
- recurso o capacidad solicitada;
- alcance solicitado;
- origen inmediato y cadena de procedencia disponible;
- referencias brutas de origen aportadas por el solicitante;
- clasificaciÃ³n, confianza y taint asignados por una frontera controlada por Kern;
- correlaciÃ³n con sesiÃ³n, workflow o ejecuciÃ³n de agente;
- lÃ­mites aplicables;
- Decision Binding cuando la solicitud pase a ejecuciÃ³n;
- referencias de auditorÃ­a.

El solicitante puede aportar referencias brutas de origen, pero no puede asignar por sÃ­ mismo confianza, clasificaciÃ³n, taint ni autoridad.

La procedencia debe poder conservar una cadena transitiva de fuentes relevantes. Un salto intermedio no puede eliminar por sÃ­ solo los atributos de procedencia o taint de una fuente anterior.

### 5.5 Action Request

Una Action Request solicita un cambio, comunicaciÃ³n, activaciÃ³n, transferencia, configuraciÃ³n o efecto operativo sobre un sistema externo o una persona.

Una Action Request siempre es una operaciÃ³n relevante.

Una acciÃ³n compuesta o integraciÃ³n con mÃºltiples efectos debe descomponerse en Action Requests gobernadas o en un lote explÃ­citamente limitado, identificable y auditable.

Una aprobaciÃ³n no puede cubrir efectos futuros indeterminados.

Cuando una Action Request derive de Knowledge Request, debe conservar clasificaciÃ³n, procedencia y taint aplicables.

Ejemplos:

- enviar un email;
- crear, modificar o eliminar un registro;
- emitir una factura;
- activar una automatizaciÃ³n;
- actualizar un calendario;
- ejecutar una integraciÃ³n;
- transferir datos fuera de un lÃ­mite organizativo.

### 5.6 Knowledge Request

Una Knowledge Request solicita acceso de lectura a conocimiento empresarial.

Una Knowledge Request debe pasar por identity, tenancy, clasificaciÃ³n, polÃ­ticas de lectura y segregaciÃ³n organizativa antes de devolver resultados.

Knowledge Engine solo puede usar fuentes, roles, endpoints o configuraciones verificadas como sin efectos secundarios operativos.

Knowledge Request no puede utilizarse como vÃ­a alternativa para ejecutar acciones operativas.

Ante duda sobre si una consulta puede cambiar estado, activar tracking, generar bloqueo, exportar datos sensibles o provocar otro efecto externo, debe tratarse como Action Request.

Una lectura o extracciÃ³n masiva, cross-organization o de datos clasificados puede constituir una operaciÃ³n relevante y requerir controles equivalentes a una Action Request.

### 5.7 AcciÃ³n relevante

Una acciÃ³n relevante es cualquier operaciÃ³n que:

- cambia estado fuera de Kern;
- mueve datos fuera de un lÃ­mite organizativo;
- accede a datos clasificados;
- gasta presupuesto o capacidad significativa;
- cambia configuraciÃ³n;
- activa una integraciÃ³n;
- produce efecto operativo sobre una persona o sistema.

Ante duda, una operaciÃ³n debe tratarse como relevante.

### 5.8 Procedencia y confianza

Toda solicitud puede incluir referencias de procedencia que indiquen de dÃ³nde procede la instrucciÃ³n o contenido relevante.

Contenido de correo, documentos, web, integraciones externas, outputs de modelos y plugins de terceros debe tratarse como no confiable por defecto.

El solicitante puede aportar referencias brutas de origen, pero no puede asignar por sÃ­ mismo confianza, clasificaciÃ³n, taint ni autoridad.

La procedencia debe poder conservar una cadena transitiva de fuentes relevantes. Un salto intermedio no puede eliminar por sÃ­ solo los atributos de procedencia o taint de una fuente anterior.

La procedencia no concede autoridad.

Una instrucciÃ³n contenida en datos externos no puede sustituir una autorizaciÃ³n de identidad, polÃ­tica o aprobaciÃ³n humana.

### 5.9 PropagaciÃ³n de clasificaciÃ³n y taint

La clasificaciÃ³n, procedencia y taint de datos recuperados mediante Knowledge Request deben propagarse a cualquier contexto, resultado o Action Request derivada cuando sea razonable.

Policy Engine debe poder evaluar no solo quiÃ©n solicita una acciÃ³n, sino tambiÃ©n quÃ© informaciÃ³n sensible o no confiable influyÃ³ en ella.

Una Action Request relevante derivada de contenido no confiable debe requerir aprobaciÃ³n humana o ser denegada, salvo una excepciÃ³n explÃ­cita, restrictiva, limitada y auditable definida por policy.

La procedencia no concede autoridad y el taint no se elimina por reformulaciÃ³n, resumen, transformaciÃ³n de texto o salto entre componentes.

---

## 6. Ciclo de ejecuciÃ³n gobernada

Una solicitud debe seguir este ciclo lÃ³gico:

```text
1. Canal, agente, workflow, plugin o sistema presenta intenciÃ³n y referencias brutas.
2. Identity and Organization resuelve organizaciÃ³n, tenancy, identidad ejecutora e identidad delegada cuando exista.
3. Context Assembly y Knowledge Engine obtienen Ãºnicamente contexto autorizado, asignan o propagan procedencia, clasificaciÃ³n y taint.
4. Se construye una solicitud inicial con alcance, payload y referencias.
5. Policy Engine evalÃºa la semÃ¡ntica original de la solicitud.
6. Si Policy devuelve transform permitido, se crea una solicitud derivada mÃ¡s restrictiva, se registra la relaciÃ³n con la original y se reevalÃºa la solicitud final.
7. Un deny sobre la semÃ¡ntica original es terminal y no puede transformarse para obtener allow.
8. Si se requiere aprobación, Policy produce una evaluación provisional ligada a la solicitud final.
9. El humano revisa la solicitud final, el payload final, el alcance final, los riesgos y la procedencia relevante; la aprobación queda ligada a la evaluación provisional y se consume en el primer intento de ejecución.
10. Policy emite un Decision Binding final, verificable y ejecutable, ligado a la solicitud final, la evaluación provisional y la aprobación válida cuando aplique.
11. Audit registra de forma durable la intenciÃ³n antes de un efecto irreversible.
12. Tool Engine o Knowledge Engine verifica el Decision Binding, el payload final, la idempotencia, la organizaciÃ³n y las restricciones antes de ejecutar.
13. La ejecuciÃ³n autorizada ocurre.
14. Audit registra resultado, error, correlaciÃ³n externa y evidencia permitida.
15. Observability registra telemetrÃ­a sin convertirse en un canal lateral de datos sensibles.
16. El resultado vuelve al solicitante.
```

No existe un camino alternativo para ejecutar acciones o leer conocimiento fuera de este ciclo.

Los controles dinÃ¡micos relevantes deben poder reevaluarse en el punto de uso antes de ejecutar, para evitar cambios de contexto entre autorizaciÃ³n y efecto.

Un defer nunca permite ejecuciÃ³n. Debe asignarse a una autoridad resolutora, tener plazo de resoluciÃ³n y terminar en deny efectivo si expira, falla o no se resuelve.

---

## 7. Decisiones de polÃ­tica

Policy Engine puede devolver una de estas decisiones lÃ³gicas:

* `allow`: permite la operaciÃ³n dentro del alcance solicitado;
* `deny`: bloquea la operaciÃ³n;
* `limit`: permite una operaciÃ³n con alcance, frecuencia, coste, datos o capacidad reducidos;
* `transform`: produce una solicitud derivada, explícita y auditable, que debe ser semánticamente más restrictiva y reevaluarse antes de cualquier ejecución;
* `require_approval`: bloquea temporalmente la ejecuciÃ³n hasta recibir aprobaciÃ³n vÃ¡lida;
* `defer`: no puede decidir con la informaciÃ³n disponible y requiere resoluciÃ³n adicional.

`deny` es terminal para la solicitud original y no puede convertirse en `allow`, `limit` o `transform` mediante una reevaluaciÃ³n posterior.

`transform` solo puede reducir alcance, redactar datos, imponer lÃ­mites o sustituir una operaciÃ³n por otra semÃ¡nticamente mÃ¡s restrictiva.

`transform` no puede ampliar alcance, cambiar destinatario, modificar identidad delegada, elevar privilegios, aumentar presupuesto, cambiar un recurso objetivo ni convertir una operaciÃ³n en otra con mayor efecto operativo.

Toda transformaciÃ³n debe generar una solicitud derivada con referencias a la solicitud original, huellas pre-transformaciÃ³n y post-transformaciÃ³n, y auditorÃ­a de la modificaciÃ³n.

La solicitud derivada debe reevaluarse antes de ejecuciÃ³n. Una transformaciÃ³n no puede utilizarse para escapar de un deny terminal sobre la semÃ¡ntica original.

`limit` debe expresar restricciones aplicables y medibles. Tool Engine debe rechazar ejecutar una operaciÃ³n si no puede aplicar, verificar o medir los lÃ­mites impuestos.

`defer` nunca es ejecutable. Debe identificar una autoridad resolutora y un plazo. Si no se resuelve dentro del plazo, la solicitud termina como deny efectivo y se audita.

---

## 8. AprobaciÃ³n humana

Una aprobaciÃ³n humana debe asociarse a una solicitud concreta y no puede reutilizarse fuera de su organizaciÃ³n, alcance, operaciÃ³n y periodo de validez.

La aprobaciÃ³n se realiza Ãºnicamente sobre la solicitud final posterior a cualquier transformaciÃ³n permitida.

Debe vincularse de forma verificable a:

- huella del payload final;
- alcance final;
- organizaciÃ³n;
- identidad ejecutora;
- identidad delegada, cuando exista;
- evaluación provisional de policy asociada;
- polÃ­tica y versiÃ³n aplicable;
- expiraciÃ³n;
- identificador de solicitud y correlaciÃ³n.

La aprobación no requiere que exista previamente un Decision Binding final. Debe quedar ligada a la solicitud final y a la evaluación provisional de policy correspondiente.

El Decision Binding final se emite después de una aprobación válida y debe referenciar tanto la evaluación provisional como la aprobación consumible.

Una aprobaciÃ³n es de un solo uso. Debe consumirse atÃ³micamente en el primer intento de ejecuciÃ³n, incluso cuando la ejecuciÃ³n falle.

Si cambia el payload, el alcance, la organizaciÃ³n, la identidad, la policy aplicable o el Decision Binding, la aprobaciÃ³n queda invalidada.

Una aprobaciÃ³n debe registrar, como mÃ­nimo:

* identidad de quien aprueba;
* organizaciÃ³n;
* solicitud aprobada;
* alcance aprobado;
* momento de aprobaciÃ³n;
* caducidad, cuando aplique;
* decisiÃ³n de polÃ­tica asociada;
* evidencia de auditorÃ­a.

Una aprobaciÃ³n no puede ampliar permisos que la identidad aprobadora no posea.

---

## 9. Requisitos para Tool Engine

Tool Engine debe:

* aceptar Ãºnicamente Action Requests vÃ¡lidas;
* validar schema, organizaciÃ³n, identidad, permisos y condiciones;
* ejecutar solo despuÃ©s de una decisiÃ³n de polÃ­tica vÃ¡lida;
* respetar lÃ­mites, transformaciones y aprobaciones;
* usar secretos y accesos mÃ­nimos necesarios;
* impedir que una tool amplÃ­e sus propios permisos;
* registrar evidencia de ejecuciÃ³n;
* devolver resultados, errores y referencias de auditorÃ­a;
* distinguir solicitud, autorizaciÃ³n, ejecuciÃ³n y resultado.

Tool Engine debe verificar el Decision Binding antes de cada efecto externo.

Debe impedir que el poder efectivo de una credencial externa exceda el alcance autorizado por la solicitud. Cuando el sistema externo lo permita, debe preservar atribuciÃ³n on-behalf-of o una correlaciÃ³n equivalente entre la identidad interna de Kern y la operaciÃ³n externa.

Cuando no sea posible limitar tÃ©cnicamente una credencial al alcance autorizado, la integraciÃ³n debe tratarse como de mayor riesgo y requerir controles adicionales definidos por policy.

Tool Engine debe rechazar solicitudes mutadas, bindings caducados, approvals reutilizadas, lÃ­mites no aplicables o claves de idempotencia incompatibles.

Tool Engine no decide por sÃ­ mismo el modelo de autorizaciÃ³n global.

## 10. Requisitos para Knowledge Engine

Knowledge Engine debe:

* aceptar Ãºnicamente Knowledge Requests vÃ¡lidas;
* validar organizaciÃ³n, identidad, clasificaciÃ³n y restricciones de lectura;
* filtrar o particionar resultados por organizaciÃ³n antes de recuperarlos;
* conservar referencias de procedencia y clasificaciÃ³n;
* respetar retenciÃ³n, eliminaciÃ³n y minimizaciÃ³n;
* devolver referencias y resultados sujetos a polÃ­tica;
* impedir que recuperaciÃ³n de conocimiento se convierta en autorizaciÃ³n de una acciÃ³n.

Knowledge Engine debe verificar el Decision Binding cuando una lectura sea relevante, clasificada, masiva, cross-organization o estÃ© sometida a lÃ­mites explÃ­citos.

Debe impedir que resultados con clasificaciÃ³n o taint aplicable pierdan esos atributos cuando se entreguen a Context Assembly, Agent Engine o una Action Request derivada.

Knowledge Engine no puede devolver contenido de otra organizaciÃ³n salvo polÃ­tica explÃ­cita de comparticiÃ³n.

## 11. Requisitos para Context Assembly

Context Assembly debe:

* construir contexto usando Ãºnicamente datos autorizados;
* conservar referencias de procedencia, confianza y clasificaciÃ³n;
* evitar convertir contenido no confiable en autoridad;
* permitir que Policy Engine aumente controles cuando una solicitud derive de contenido no confiable;
* minimizar contenido sensible segÃºn polÃ­ticas de acceso y retenciÃ³n;
* mantener referencias entre el contexto utilizado y las solicitudes derivadas cuando sea razonable.

Context Assembly debe distinguir datos, instrucciones confiables y contenido no confiable.

No puede promover contenido no confiable a instrucciÃ³n autorizada por resumirlo, traducirlo, reformularlo o mezclarlo con contenido confiable.

Debe permitir limitar el blast radius de una misma fuente no confiable, incluyendo volumen de acciones derivadas, alcance y frecuencia.

Este RFC no afirma que la procedencia elimine por completo prompt injection.

---

## 12. AuditorÃ­a y observabilidad

Antes de un efecto irreversible, Audit debe registrar una intenciÃ³n durable que incluya al menos organizaciÃ³n, identidades, solicitud, alcance, Decision Binding, huella de payload, idempotency key y referencias de procedencia aplicables.

DespuÃ©s de la ejecuciÃ³n, Audit debe registrar resultado, error, intentos denegados, deferred, expirados y fallidos, junto con correlaciÃ³n externa cuando exista.

La evidencia debe poder preservar huellas, fingerprints o referencias de datos sensibles sin requerir almacenar indiscriminadamente su contenido completo.

La auditorÃ­a debe ser resistente a manipulaciÃ³n segÃºn un mecanismo tÃ©cnico que se definirÃ¡ en un RFC posterior.

Toda solicitud relevante debe producir evidencia de auditorÃ­a suficiente para responder:

* quiÃ©n solicitÃ³ la operaciÃ³n;
* para quÃ© organizaciÃ³n;
* quÃ© tipo de operaciÃ³n se intentÃ³;
* quÃ© recurso, tool o knowledge source intervino;
* quÃ© polÃ­tica decidiÃ³;
* si hubo aprobaciÃ³n humana;
* quÃ© resultado o error ocurriÃ³;
* quÃ© referencias de procedencia y clasificaciÃ³n aplicaron;
* quÃ© versiÃ³n de componentes participÃ³.

La auditorÃ­a debe respetar minimizaciÃ³n, retenciÃ³n y control de acceso.

Observability no puede almacenar payloads sensibles completos ni convertirse en una vÃ­a de acceso a datos con controles inferiores a Audit.

Debe priorizar mÃ©tricas, agregados, identificadores, referencias, trazas minimizadas y datos operativos sujetos a controles de acceso adecuados.

Observability puede registrar mÃ©tricas, trazas, rendimiento, degradaciones y consumo con retenciÃ³n y granularidad distintas de Audit.

---

## 13. Invariantes

1. Ninguna salida de modelo es autoridad por sÃ­ misma.
2. NingÃºn solicitante puede autoasignarse confianza, clasificaciÃ³n, taint, permisos o condiciÃ³n de recurso de plataforma.
3. Toda ejecuciÃ³n relevante requiere Decision Binding vÃ¡lido, verificable, no caducado y ligado al payload final.
4. Un deny terminal nunca puede transformarse para obtener permiso.
5. Un defer no resuelto nunca puede ejecutar.
6. Toda aprobaciÃ³n es de un solo uso y queda ligada a solicitud final, alcance final y payload final.
7. Toda acciÃ³n relevante derivada de contenido no confiable requiere aprobaciÃ³n humana o denegaciÃ³n, salvo excepciÃ³n explÃ­cita y limitada de policy.
8. La clasificaciÃ³n, procedencia y taint no se pierden al pasar de Knowledge a Context Assembly o Action Request.
9. Todo recurso es organization-scoped por defecto.
10. Un recurso de plataforma solo puede declararse mediante autoridad explÃ­cita del Control Plane y debe quedar auditado.
11. Una acciÃ³n compuesta no puede ocultar efectos mÃºltiples no gobernados.
12. Una solicitud relevante irreversible debe registrar intenciÃ³n durable antes de ejecuciÃ³n.
13. Observability no puede convertirse en canal lateral de payloads sensibles.

## 14. Consecuencias

Aceptar este RFC implica que futuros contratos de tools, knowledge sources, workflows, agents, channels, plugins y extensiones deben implementar o adaptarse a esta frontera gobernada.

Ninguna integraciÃ³n puede introducir una vÃ­a de acciÃ³n o lectura que evite el contrato de ejecuciÃ³n gobernada.

Cualquier excepciÃ³n requiere RFC explÃ­cito.

---

## 15. Preguntas abiertas

1. Â¿QuÃ© formato tÃ©cnico usarÃ¡ Decision Binding y cÃ³mo se verificarÃ¡ entre mÃ³dulos?
2. Â¿QuÃ© taxonomÃ­a versionada de confianza, clasificaciÃ³n y taint debe existir?
3. Â¿QuÃ© excepciones explÃ­citas pueden permitir acciones relevantes derivadas de contenido no confiable?
4. Â¿QuÃ© modelo de delegaciÃ³n y atribuciÃ³n on-behalf-of puede soportar cada integraciÃ³n externa?
5. Â¿CÃ³mo se limitarÃ¡ tÃ©cnicamente el alcance efectivo de credenciales externas?
6. Â¿QuÃ© polÃ­ticas de expiraciÃ³n, revocaciÃ³n y reintento aplicarÃ¡n a Decision Bindings y aprobaciones?
7. Â¿CÃ³mo se representarÃ¡n operaciones parcialmente reversibles, compensables o por lote?
8. Â¿QuÃ© mecanismos tÃ©cnicos garantizan audit tamper-evident y retenciÃ³n compatible con privacidad?
9. Â¿QuÃ© umbrales convierten una lectura, exportaciÃ³n o extracciÃ³n en operaciÃ³n relevante?
10. Â¿CÃ³mo se aplicarÃ¡ el lÃ­mite de blast radius ante una fuente no confiable?

## 16. Referencias

* RFC-0000 â€” The Kern RFC Process
* RFC-0001 â€” Kern Manifesto
* RFC-0002 â€” Kern Logical Architecture

---

## 17. Historial de cambios

### 0.1 â€” 2026-06-27

Borrador inicial del contrato de ejecuciÃ³n gobernada de Kern.

### 0.2 â€” 2026-06-27

RediseÃ±o parcial tras revisiÃ³n independiente de seguridad y arquitectura. Introduce identidades ejecutora y delegada, Decision Binding verificable, propagaciÃ³n de procedencia, clasificaciÃ³n y taint, restricciones sobre transform y defer, aprobaciones de un solo uso ligadas a la solicitud final, auditorÃ­a write-ahead, idempotencia, controles sobre acciones compuestas y lÃ­mites frente a contenido no confiable.

### 0.2.1 — 2026-06-27

Aclaración del orden entre evaluación provisional de policy, aprobación humana y Decision Binding final. Evita una dependencia circular entre aprobación y autorización ejecutable, y precisa que toda transformación genera una solicitud derivada que debe reevaluarse.

### 0.2.2 — 2026-06-27

RFC Accepted por el Technical Owner tras revisión independiente de seguridad y arquitectura. Este contrato se convierte en la referencia fundacional de Kern para solicitudes gobernadas, Decision Bindings, aprobaciones humanas, ejecución mediada, procedencia, auditoría e idempotencia.

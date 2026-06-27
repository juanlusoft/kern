# RFC-0006 — Capability, Tool and Extension Contract

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.2.1
- **Tipo:** Architecture / Security / Foundational
- **Dominio:** Capacidades, tools, integraciones, extensiones, registry y control de ejecución
- **Depends on:** RFC-0002, RFC-0003, RFC-0004, RFC-0005
- **Decisión requerida:** Aprobación del contrato lógico para capabilities, tools, integraciones y extensiones en Kern

---

## 1. Resumen ejecutivo

Kern necesita un contrato común para describir capacidades disponibles, cómo se implementan, quién puede resolverlas y qué fronteras de seguridad las gobiernan.

Este RFC define la relación entre capability, tool, integration, extension, extension publisher, registry, capability resolution, manifest y enforcement boundary sin fijar formatos, lenguajes, transporte, runtime ni mecanismos criptográficos concretos.

El objetivo es que una capability pueda declararse, resolverse, instalarse, activarse, auditarse y retirarse sin crear rutas alternativas de ejecución fuera de RFC-0003, RFC-0004 y RFC-0005.

---

## 2. Problema

Sin un contrato común, una integración puede exponer efectos ocultos, una extensión puede sobrepasar su alcance, un registry puede confundirse con autorización y una capability puede parecer inocua mientras ejecuta subefectos amplios.

Kern necesita separar con claridad:

- lo que una capability promete;
- lo que una tool o integration implementa;
- lo que una extensión solicita;
- lo que un extension publisher distribuye;
- lo que un registry publica;
- lo que capability resolution selecciona;
- lo que el enforcement boundary permite ejecutar.

---

## 3. Objetivos

Este RFC debe:

1. Definir normativamente capability, tool, integration, extension, extension publisher, registry, capability resolution, manifest y enforcement boundary.
2. Mantener neutralidad respecto a implementación, empaquetado y transporte.
3. Impedir que una extensión se auto-conceda autoridad.
4. Hacer que toda capability con efecto externo o irreversible dependa de RFC-0003, RFC-0004 y RFC-0005.
5. Exigir que los cambios de permisos, riesgo, efectos, datos o destinos desencadenen reevaluación.
6. Preservar multi-tenancy y auditoría por defecto.

---

## 4. No objetivos

Este RFC no decide:

- formato de manifest;
- JSON Schema, OpenAPI, gRPC, MCP o cualquier otro contrato serializado;
- mecanismo de distribución;
- sandboxing concreto;
- firma de artefactos;
- motor de runtime;
- lenguaje de implementación;
- proveedor concreto;
- catálogo inicial cerrado de capabilities;
- SDK;
- UI de instalación o consentimiento;
- mecanismo criptográfico concreto.

Estas decisiones requerirán RFCs posteriores.

---

## 5. Conceptos normativos

### 5.1 Kern Capability

Una Kern Capability es un contrato declarativo, estable y gobernable que describe una operación potencialmente disponible.

Una Kern Capability no es una concesión de autoridad, una credencial, un scope, un Decision Binding ni un token de Object-Capability security.

El término Capability en este RFC describe un contrato de operación de Kern. No se utiliza como sinónimo de un objeto o token infalsificable de autoridad.

Una capability define una acción posible, no una concesión de autoridad por sí misma.

### 5.2 Tool

Una Tool es una implementación invocable, mediada por Core, que realiza una o más Kern Capabilities bajo el contrato de ejecución gobernada.

Una Tool no recibe autoridad ambiental para producir efectos externos por libre.

### 5.3 Integration

Una Integration es una configuración organization-scoped que conecta una Tool o Capability con un sistema externo concreto.

Un adapter es un detalle interno de implementación de una Tool o Integration. No es una categoría autónoma de ejecución, autorización, resolución ni lifecycle.

Un adapter no puede introducir una ruta de efecto, credencial, red, callback, secreto o resolución fuera de las fronteras aplicables a la Tool o Integration que lo contiene.

Una Integration no puede ser simultáneamente una capability y una implementación.

Debe incluir como mínimo:

- sistema externo objetivo;
- configuración organization-scoped;
- límites de destinos y operaciones;
- requisitos de credenciales;
- clasificación de riesgo;
- estado de lifecycle.

### 5.4 Extension

Una Extension es un artefacto instalable que puede aportar una o más Tools, Integrations, manifests o componentes internos de implementación.

Una Extension:

- puede declarar necesidades;
- no puede auto-concederse autoridad;
- no puede ser un punto de decisión de autorización ni de mediación de efectos;
- no puede custodiar por defecto una credencial externa amplia;
- no puede declarar por sí misma que sus efectos reales son seguros.

Una Extension no puede aportar un adapter como ruta independiente no gobernada.

### 5.5 Extension Publisher

Extension Publisher es la entidad que distribuye o publica una Extension.

AI Provider mantiene el significado definido por RFC-0002: proveedor lógico de inferencia o modelos. Extension Publisher no es un AI Provider.

### 5.6 Manifest

Un Manifest declara requisitos, efectos previstos, destinos, necesidades de datos, operaciones, dependencias, riesgos y compatibilidades.

Un Manifest declara necesidades y afirmaciones sujetas a validación. No concede permisos, scopes, consentimiento, acceso a credenciales, disponibilidad operativa ni autorización de ejecución.

Un manifest incompleto, ambiguo o no verificable no es instalable, activable ni resolvible.

### 5.7 Registry

Un Registry publica y mantiene información de capabilities, extensiones, implementaciones y artefactos.

Estar registrado no implica estar autorizado, instalado, activado, resolvible ni ejecutable.

### 5.8 Capability Resolution

Capability Resolution selecciona una implementation concreta para una solicitud, organización y contexto gobernados.

Registry y Capability Resolution son responsabilidades distintas, conforme a RFC-0002.

Capability Resolution no puede sustituir una implementación, versión, configuración o artefacto después de que Policy Engine haya evaluado la solicitud y emitido la autorización correspondiente.

### 5.9 Implementation

Una Implementation es el artefacto concreto, identificable y verificable que realiza una Kern Capability mediante una Tool o una Integration.

Una Implementation debe tener identidad inmutable, versión, referencia de artefacto verificable, lifecycle y asociación explícita con las Capabilities que puede realizar.

Capability Resolution selecciona una Implementation concreta. Policy Engine y el Decision Binding final deben evaluar y ligar esa Implementation exacta, no una categoría genérica de Tool o Extension.

### 5.10 Core Enforcement Boundary

La frontera de enforcement, la validación de Decision Bindings, la mediación de efectos externos, la custodia de credenciales y la verificación de obligaciones pertenecen a Core o a componentes controlados por Core.

Una Tool, Integration o Extension nunca es un punto de decisión de autorización.

Puede solicitar una operación, aportar datos de ejecución o recibir una invocación gobernada, pero no puede emitir allow, resolver defer, validar por sí misma un Decision Binding, aprobar una excepción ni decidir que una obligación ha quedado satisfecha.

Toda decisión de autorización, mediación de efectos, validación de binding, verificación de obligaciones y custodia de credenciales pertenece exclusivamente a Core o a componentes controlados por Core.

### 5.11 Componente controlado por Core

Un componente controlado por Core es un componente que opera dentro del dominio de confianza de Kern y cumple simultáneamente estas condiciones:

- no es código suministrado, actualizado ni administrado por una Extension o Extension Publisher;
- su identidad, lifecycle y configuración se validan bajo control de Core;
- sus decisiones de enforcement, autorización, mediación de efectos y custodia de credenciales no pueden ser modificadas, anuladas ni influenciadas por una Extension;
- produce evidencia verificable de la aplicación de bindings, obligaciones y restricciones;
- puede ser auditado e invalidado por los mecanismos de gobierno de Kern.

Una Tool, Integration, Extension, adapter o Extension Publisher no puede declararse por sí mismo componente controlado por Core.

---

## 6. Modelo lógico y frontera de ejecución

1. Una solicitud selecciona una Capability declarada.
2. Capability Resolution selecciona una implementación exacta, una versión exacta, una configuración organization-scoped y una identidad de artefacto verificable.
3. Policy Engine evalúa solicitud, organización, identidad, scope, implementación exacta, riesgo, efectos, destinos, clasificación, obligaciones y lifecycle.
4. El Decision Binding final queda ligado como mínimo a:
   - capability;
   - implementación concreta;
   - versión;
   - identidad verificable del artefacto;
   - integration/configuración organization-scoped;
   - organización;
   - identidad;
   - solicitud;
   - efectos permitidos;
   - destinos permitidos;
   - obligaciones;
   - snapshot de policy.
5. Una Tool no puede sustituir una implementación autorizada por otra.
6. Toda llamada Tool→Tool, Tool→Integration, Tool→Extension o Tool→sistema externo debe volver a entrar por la frontera gobernada adecuada.
7. Una Extension no puede producir efectos externos sin pasar por una frontera controlada por Core.
8. Una Extension no puede asumir acceso ambiental a red, almacenamiento, procesos, secretos, colas, callbacks o capacidades de otras tools.
9. Toda capacidad ambiental que pueda generar un efecto relevante debe ser denegada o mediada por Core.
10. Un efecto no declarado, destino no autorizado o subefecto no gobernado debe bloquear la operación.

El Core no confía operativamente en que una Tool, Integration o Extension describa de forma honesta todos sus subefectos. Las declaraciones de manifest son entrada para validación y policy, no sustituyen la mediación real de efectos.

La ejecución de una Extension como código no confiable requiere precondiciones verificables de aislamiento, mediación de efectos, identidad de artefacto en tiempo de ejecución y confinamiento de credenciales.

Mientras una instalación de Kern no pueda demostrar esas precondiciones para una clase concreta de Extension o Integration, dicha clase no puede activarse para operaciones relevantes ni recibir acceso a sistemas externos, secretos, credenciales amplias, red, almacenamiento, callbacks, colas o procesos.

Estas precondiciones no son meras recomendaciones de implementación ni pueden degradarse a buenas prácticas opcionales.

Antes de un efecto externo, irreversible, compuesto, asíncrono o relevante, Core o un componente controlado por Core debe verificar que la Implementation efectivamente ejecutada coincide con la identidad de artefacto ligada al Decision Binding.

Una verificación realizada solo durante Capability Resolution no es suficiente cuando pueda existir sustitución de artefacto entre decisión y efecto.

La evidencia de esa coincidencia debe formar parte de la trazabilidad de ejecución.

El mapeo implementation identifier + version -> immutable artifact identity debe anclarse en Core o en una raíz de confianza validada por Core, no en una declaración unilateral del Extension Publisher.

---

## 7. Contrato de capability e implementación

Toda Capability debe tener:

- identificador estable;
- versión;
- organización o clasificación explícita como recurso de plataforma;
- operación declarada;
- recurso objetivo;
- tipo de efecto:
  - lectura;
  - escritura;
  - externo;
  - irreversible;
  - compuesto;
  - asíncrono o diferido;
- datos de entrada;
- datos de salida;
- clasificación, procedencia y taint de salida esperados;
- requisitos de identidad, scopes y delegación;
- requisitos de Policy Engine;
- obligaciones soportadas;
- destinos externos declarados;
- clasificación de riesgo;
- idempotencia;
- correlación;
- límites;
- comportamiento de error;
- comportamiento de compensación cuando aplique;
- subefectos gobernables cuando exista composición.

Una Capability de lectura no se considera automáticamente de bajo riesgo.

La clasificación, procedencia y taint de datos obtenidos, transformados, leídos o emitidos por una Capability deben ser asignados o verificados por una frontera de lectura, conocimiento, datos o ejecución controlada por Core.

Una Tool, Integration o Extension no puede elevar la confianza, reducir clasificación, eliminar taint ni declarar por sí misma que esos atributos dejan de aplicar.

Cuando no pueda verificarse la clasificación, procedencia o taint de una salida relevante, dicha salida debe tratarse como no confiable y de mayor riesgo conforme a RFC-0003 y RFC-0005.

Los logs, la telemetría, las métricas, las trazas y los canales secundarios no pueden convertirse en una vía de exfiltración ni en un camino para saltarse esas reglas de clasificación y gobernanza.

Una Capability de escritura, externa, irreversible, compuesta, asíncrona o diferida debe declarar explícitamente idempotencia, correlación y límites aplicables.

Para efectos irreversibles, la idempotencia es obligatoria salvo que una política fundacional determine explícitamente que no puede existir. En ese caso, la operación debe requerir controles reforzados y no puede reintentarse de forma implícita.

La identidad de una implementación debe estar ligada a un artefacto verificable e inmutable.

La combinación de identificador de implementación y versión no puede apuntar a contenido distinto con posterioridad.

Un cambio de contenido de artefacto, incluso si conserva el mismo manifest, identificador o versión declarada, constituye un cambio de implementación y requiere reevaluación de seguridad, lifecycle, consentimiento y autorizaciones dependientes.

---

## 8. Efectos compuestos, asíncronos y diferidos

Una operación compuesta no puede ocultar efectos bajo una capability aparentemente inocua.

Todo subefecto gobernable debe estar declarado en el plan de efectos y debe recibir gobernanza individual, o la operación compuesta debe demostrar atomicidad, idempotencia y estrategia de compensación verificables.

Cuando no pueda demostrarse una de esas dos condiciones, la operación compuesta debe ser denegada.

Un efecto asíncrono o diferido incluye, entre otros, colas, jobs, webhooks, callbacks, tareas programadas y operaciones cuya consecuencia pueda ocurrir después de finalizar la solicitud original.

Un efecto asíncrono no puede sobrevivir como autorización implícita tras expirar, revocarse o invalidarse el Decision Binding que lo originó.

Todo recheck previo al disparo de un efecto asíncrono debe ejecutarse por Core o un componente controlado por Core usando fuentes autoritativas y actuales de revocación, policy, organización, identidad, destinos y obligaciones.

Una Extension no puede autoevaluar que un binding asíncrono sigue vigente.

Todo callback o webhook entrante debe autenticarse y asociarse a una organización, Integration y contexto gobernado mediante mecanismos verificados por Core.

La organización, identidad, destino o contexto declarados por el callback no son evidencia suficiente por sí mismos.

Los efectos asíncronos relevantes deben poder cancelarse, suspenderse o bloquearse cuando se revoque la autorización, se suspenda una extensión o se invalide una integración.

Cuando una operación compuesta o irreversible no pueda demostrar atomicidad, idempotencia y compensación verificables, debe denegarse por defecto hasta que exista un contrato de compensación aceptado para ese tipo de sistema externo.

Un resultado parcial no puede ocultarse como éxito completo.

Una operación compuesta debe registrar efectos realizados, efectos pendientes, efectos compensados y efectos no compensables.

Una Tool o Extension no puede continuar subefectos posteriores tras un deny, revocación, fallo de obligación o invalidación relevante.

---

## 9. Ciclo de vida, actualización y revocación

El ciclo de vida lógico incluye:

- registro;
- validación;
- instalación;
- activación;
- suspensión;
- revocación;
- actualización;
- deprecación;
- retirada;
- compatibilidad;
- rollback.

Instalación no implica activación.
Activación no implica consentimiento permanente.
Registro no implica autorización.
Resolución no implica ejecución.

Los disparadores obligatorios de reevaluación y reconsentimiento incluyen:

- cambio de artefacto;
- versión;
- manifest;
- scopes solicitados;
- efectos;
- subefectos;
- destinos;
- datos tratados;
- clasificación;
- riesgo;
- dependencias;
- credenciales;
- modelo de aislamiento;
- configuración organization-scoped.

Una Implementation o Extension vulnerable o revocada no puede reactivarse, seleccionarse, instalarse ni ejecutarse mediante excepción de policy.

Una Implementation o Extension deprecada o retirada exclusivamente por compatibilidad puede admitir una excepción limitada, temporal, auditable y aprobada cuando corresponda, siempre que policy lo permita.

Un rollback hacia una versión vulnerable o revocada debe ser denegado.

Un rollback es un cambio de lifecycle y debe reevaluar consentimiento, riesgo y autorizaciones dependientes.

---

## 10. Multi-tenancy, credenciales y aislamiento

Las configuraciones, credenciales, tokens derivados, manifests instalados, consentimientos, caches, resultados, logs, colas, callbacks, artefactos de ejecución y estados de lifecycle son organization-scoped por defecto.

Una Extension habilitada para una organización no puede servir implícitamente a otra organización.

Una ejecución multi-tenant debe recibir organización explícita y no puede reutilizar memoria, contexto, secretos, resultados, variables de entorno, colas ni datos empresariales de otra organización.

Cuando un sistema externo solo exponga una credencial de servicio amplia, la credencial debe permanecer exclusivamente bajo custodia de Core o de un componente controlado por Core.

Una Tool, Integration o Extension no puede recibir esa credencial, ni completa ni disfrazada como material limitado a la operación.

En ese caso, la Extension solo puede solicitar una operación a un mediador controlado por Core, que aplica las restricciones del Decision Binding antes de producir el efecto externo.

La mediación reduce el blast radius de una credencial amplia, pero no elimina por sí sola el riesgo residual del sistema externo. Kern debe preferir identidad on-behalf-of o credenciales externas acotadas cuando el sistema lo permita.

Cuando un sistema no proporcione confinamiento, trazabilidad, idempotencia, cancelación o visibilidad suficientes, la Integration debe clasificarse como de mayor riesgo y requerir deny o controles reforzados conforme a policy. Nunca puede tratarse como plenamente gobernada por defecto.

Una instancia de Extension que atienda más de una organización debe impedir acceso cruzado incluso durante ejecuciones concurrentes.

No puede depender de memoria global mutable, pools no vinculados a organización, variables de entorno compartidas, caches con claves incompletas ni estados de proceso reutilizables entre organizaciones.

Core debe poder verificar que cada ejecución recibe contexto organizativo explícito y que el estado mutable relevante se encuentra aislado por organización o por invocación.

---

## 11. Integración con RFC-0002 a RFC-0005

RFC-0002: Registry y Capability Resolution son distintos.

RFC-0003: todo efecto relevante necesita el flujo de ejecución gobernada y Decision Binding final.

RFC-0004: scopes, delegación, revocación y cross-organization no pueden ampliarse por Extension.

RFC-0005: Policy Engine compone decisiones sobre la implementación exacta, configuración, efectos, destinos, riesgo y lifecycle.

RFC-0006 depende de que RFC-0003 proporcione Decision Bindings verificables ligados a la solicitud y del enforcement controlado por Core; de que RFC-0004 impida ampliación de autoridad y regule credenciales externas; y de que RFC-0005 componga policy de forma fail-closed.

La ejecución de una Extension como código no confiable requiere precondiciones verificables de aislamiento, mediación de efectos, identidad de artefacto en tiempo de ejecución y confinamiento de credenciales.

Mientras una instalación de Kern no pueda demostrar esas precondiciones para una clase concreta de Extension o Integration, dicha clase no puede activarse para operaciones relevantes ni recibir acceso a sistemas externos, secretos, credenciales amplias, red, almacenamiento, callbacks, colas o procesos.

Estas precondiciones no son meras recomendaciones de implementación ni pueden degradarse a buenas prácticas opcionales.

Una Extension, Tool o Integration no puede degradar estas garantías a decisiones locales o advisory.

---

## 12. Invariantes

1. Una Kern Capability no equivale a autoridad.
2. Un Manifest no equivale a permiso, consentimiento, scope ni acceso a credenciales.
3. Registry no equivale a autorización, activación, resolución ni ejecución.
4. Capability Resolution no puede sustituir implementación, versión, artefacto o configuración después de autorización.
5. Una Extension no puede autoaprobarse, ampliar scopes, identidad, delegación, organización ni authority.
6. La frontera de enforcement y mediación de efectos pertenece a Core o a componentes controlados por Core.
7. Una Tool, Integration o Extension nunca es un punto de decisión de autorización.
8. Ningún efecto externo, irreversible, compuesto o asíncrono puede producirse fuera del ciclo gobernado.
9. Ninguna Tool puede ocultar subefectos o invocar otra capacidad fuera de una nueva frontera gobernada.
10. La salida de una Capability propaga clasificación, procedencia y taint.
11. La identidad de implementación está ligada a un artefacto verificable e inmutable.
12. Un cambio de artefacto invalida consentimientos, resoluciones y autorizaciones dependientes.
13. Las credenciales externas amplias no son autoridad global y no se entregan como capacidad ambiental a extensiones.
14. Toda operación cross-organization requiere los requisitos de RFC-0004 y no puede ser introducida por resolución o configuración de una extensión.
15. Configuraciones, credenciales, caches, resultados, logs, colas, callbacks y lifecycle son organization-scoped por defecto.
16. Una operación asíncrona revalida autorización y obligaciones antes del disparo efectivo.
17. Una operación compuesta declara y gobierna sus subefectos o demuestra atomicidad, idempotencia y compensación.
18. Versiones vulnerables, revocadas, deprecadas o retiradas no pueden reactivarse silenciosamente.
19. No existe ruta alternativa de ejecución mediante código de extensión.
20. Una declaración de manifest no sustituye la verificación ni mediación controlada por Core.
21. Un componente controlado por Core debe cumplir el dominio de confianza definido en este RFC.
22. La ejecución de código no confiable sin aislamiento, mediación de efectos, identidad de artefacto verificable en runtime y confinamiento de credenciales está prohibida para operaciones relevantes.
23. La clasificación, procedencia y taint relevantes no pueden ser establecidos, eliminados ni reducidos unilateralmente por una Extension.
24. Una credencial externa amplia solo puede utilizarse desde Core o un mediador controlado por Core.
25. Un callback entrante no puede autoatribuirse organización, identidad ni autoridad.
26. Una versión vulnerable o revocada no es excepcionable.
27. Cuando no pueda verificarse atomicidad, idempotencia y compensación de un efecto compuesto o irreversible, la operación debe denegarse por defecto.

---

## 13. Consecuencias

Aceptar este RFC implica que toda capability, tool, integration o extension futura debe:

- declararse de forma estable y auditable;
- respetar la separación entre catálogo y resolución;
- pasar por las fronteras de RFC-0003, RFC-0004 y RFC-0005 cuando corresponda;
- preservar multi-tenancy por defecto;
- exponer subefectos cuando existan;
- someter cambios relevantes a reevaluación;
- aceptar que el Core, y no la extensión, posee la frontera de enforcement.

Ningún componente podrá usar una capability para crear una vía de ejecución paralela a las reglas de Kern.

---

## 14. Preguntas abiertas

Las preguntas abiertas solo cubren elecciones tecnológicas concretas. Las precondiciones de aislamiento, mediación de efectos, verificación de artefacto y confinamiento de credenciales no quedan abiertas en este RFC.

1. ¿Qué formato de manifest se decidirá más adelante?
2. ¿Qué transporte o protocolo gobernará la distribución de capabilities?
3. ¿Cómo se implementará el sandboxing concreto?
4. ¿Cómo se distribuirán las extensiones?
5. ¿Qué mecanismo de firma o attestation se elegirá?
6. ¿Qué SDKs se construirán y con qué contrato?
7. ¿Cuál será el catálogo inicial de capabilities?
8. ¿Qué mecanismos técnicos de aislamiento se seleccionarán?
9. ¿Qué UI de instalación y consentimiento se usará?
10. ¿Qué modelo de compensación se exigirá para sistemas externos sin rollback?
11. ¿Qué estrategia de observación de subefectos se adoptará?
12. ¿Qué modelo de aprobación se usará para excepciones de anti-rollback?
13. ¿Cómo se compatibilizarán artefactos, manifests y contratos de capability cuando evolucionen de forma asíncrona?

---

## 15. Referencias

* RFC-0002 — Kern Logical Architecture
* RFC-0003 — Governed Execution Contract
* RFC-0004 — Identity, Tenancy and Authorization Model
* RFC-0005 — Policy Evaluation and Decision Model

---

## 16. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial del contrato lógico para capabilities, tools, integraciones y extensiones de Kern.

### 0.2 — 2026-06-27

Rediseño parcial tras revisión independiente de seguridad. Define fronteras obligatorias entre Core y extensiones no confiables, mediación de efectos, confinamiento de credenciales, identidad verificable de artefactos, resolución ligada a implementación concreta, operaciones asíncronas gobernadas y aislamiento multi-tenant de extensiones e integraciones.

### 0.2.1 — 2026-06-27

Endurecimiento tras revisión independiente de seguridad y patrones de extensibilidad. Define componente controlado por Core, prohíbe decisiones locales de autorización por extensiones, establece precondiciones bloqueantes para código no confiable, exige verificación de artefacto en tiempo de efecto, fija taint y clasificación bajo fronteras de Core, endurece credenciales externas amplias, callbacks, aislamiento concurrente multi-tenant y política de versiones vulnerables o revocadas.

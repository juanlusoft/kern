# RFC-0005 — Policy Evaluation and Decision Model



- **Estado:** Accepted

- **Autor:** Kern Architecture Council

- **Fecha:** 2026-06-27

- **Versi?n:** 0.2.2

- **Tipo:** Architecture / Security / Foundational

- **Dominio:** Evaluación de políticas y decisiones gobernadas

- **Depends on:** RFC-0000, RFC-0001, RFC-0002, RFC-0003, RFC-0004

- **Decisión requerida:** Aprobación del modelo lógico de evaluación, composición y resultado de políticas en Kern



---



## 1. Resumen ejecutivo



Kern necesita un modelo común para decidir si una solicitud puede leer conocimiento, ejecutar una acción, usar una integración, acceder a un recurso compartido o continuar una operación de larga duración.



RFC-0003 define el ciclo de ejecución gobernada y los Decision Bindings.



RFC-0004 define identidad, tenancy, autoridad, scopes, delegación, revocación y separación de deberes.



Este RFC define cómo Policy Engine evalúa esos atributos y produce una decisión lógica, verificable y auditable.



El objetivo no es elegir un lenguaje de políticas ni una implementación concreta. El objetivo es impedir que cada tool, workflow, agente, extensión o canal invente reglas de autorización, riesgo, aprobación o límites por separado.



---



## 2. Problema



Sin un modelo de decisión común, Kern puede acabar con políticas incompatibles entre sí:



- una tool permite una acción que Policy Engine habría denegado;

- un workflow aplica permisos antiguos tras una revocación;

- una extensión interpreta una aprobación como permiso permanente;

- una regla de organización contradice una regla de plataforma sin criterio de composición;

- un agente usa una clasificación o procedencia incompleta para reducir controles;

- una política limita una operación, pero Tool Engine no recibe una obligación verificable para aplicar ese límite;

- una decisión se reutiliza sobre una solicitud, identidad, payload o contexto distintos.



Kern necesita separar con claridad:



- entrada de decisión;

- evaluación de política;

- decisión provisional;

- obligaciones y restricciones;

- aprobación humana;

- Decision Binding final;

- enforcement en el punto de ejecución;

- evidencia de auditoría.



---



## 3. Objetivos



Este RFC debe:



1. Definir los atributos mínimos que Policy Engine puede evaluar.

2. Hacer obligatorio el contexto de organización, identidad, autoridad, scope, recurso y operación.

3. Definir decisiones lógicas compatibles con RFC-0003.

4. Definir una composición fail-closed cuando existan reglas aplicables en conflicto.

5. Distinguir entre política de autorización, política de riesgo, política de datos y política operativa.

6. Permitir límites, obligaciones, transformaciones restrictivas y aprobaciones humanas.

7. Evitar que una decisión provisional se use como autorización ejecutable.

8. Producir resultados que Tool Engine, Knowledge Engine y otros puntos de enforcement puedan comprobar.

9. Mantener neutralidad respecto a motores, lenguajes y formatos de política.

10. Permitir auditoría de decisiones sin exigir almacenamiento de contenido sensible ni razonamiento interno del modelo.



---



## 4. No objetivos



Este RFC no decide:



- sintaxis concreta de políticas;

- motor de evaluación;

- modelo definitivo RBAC, ABAC, ReBAC o híbrido;

- lenguaje de consulta;

- interfaz de administración de políticas;

- formato criptográfico de Decision Binding;

- almacenamiento de reglas;

- sistema de versionado de políticas;

- taxonomía final de riesgo;

- catálogo de operaciones de alto impacto;

- umbrales concretos de aprobación;

- interfaz de auditoría;

- mecanismo de despliegue de políticas.



Estas decisiones requerirán RFCs posteriores.



---



## 5. Conceptos normativos



### 5.1 Policy Engine



Policy Engine es el componente lógico responsable de evaluar solicitudes gobernadas frente a políticas aplicables.



Policy Engine no ejecuta efectos externos, no recupera secretos de herramientas y no concede autoridad por sí mismo fuera de los límites definidos por RFC-0003 y RFC-0004.



Toda decisión de Policy Engine debe poder asociarse a:



- solicitud;

- organización;

- identidad ejecutora;

- identidad delegada, cuando exista;

- recurso objetivo;

- operación;

- scope;

- política o conjunto de políticas aplicables;

- estado de revocación;

- restricciones;

- contexto de riesgo;

- evidencia de auditoría.



### 5.2 Contexto de decisión

Toda evaluación relevante debe recibir un contexto explícito y verificable que incluya, como mínimo:

- organización;
- identidad ejecutora;
- identidad delegada, cuando exista;
- concesiones, delegaciones y scopes aplicables;
- estado de suspensión, revocación, expiración e invalidación;
- tipo de solicitud;
- operación solicitada;
- recurso objetivo;
- clasificación, procedencia, confianza y taint aplicables;
- límites económicos, temporales, operativos o de frecuencia;
- contexto de sesión, workflow, agente o canal cuando sea relevante;
- riesgo asociado a integración, credencial externa o recurso compartido;
- referencias de aprobación humana cuando exista;
- referencias de políticas aplicables y sus versiones.

Un contexto incompleto, ambiguo, no verificable o incompatible con la operación solicitada debe producir deny para operaciones relevantes.

Todo atributo crítico de seguridad incluido en el contexto debe conservar referencia de procedencia, productor responsable y estado de frescura verificable.

Los atributos críticos incluyen, como mínimo, organización, identidad ejecutora, identidad delegada cuando exista, delegación, scope, estado de revocación, clasificación, procedencia, taint, riesgo de integración, autorización cross-organization, aprobación y versiones de políticas aplicables.

Un atributo crítico auto-reportado por agente, workflow, tool, extensión, canal, provider, runtime o contenido externo no constituye evidencia suficiente sin validación de una frontera controlada por Kern.

La ausencia, inconsistencia, caducidad o imposibilidad de verificar clasificación, procedencia, taint, riesgo, revocación o relevancia debe tratar la solicitud como relevante y de mayor riesgo. No puede interpretarse como contenido limpio, no sensible o de bajo riesgo.

Si un atributo crítico necesario para determinar si una operación es relevante no está disponible, la operación debe tratarse como relevante y no puede ejecutar hasta que exista contexto verificable.
### 5.3 Tipos de política

Kern distingue al menos estas categorías lógicas:

#### Política de autorización

Determina si una identidad, delegación, concesión y scope permiten una acción sobre un recurso.

#### Política de datos

Determina si una operación puede acceder, recuperar, transformar, exportar, retener o revelar datos según organización, clasificación, propósito, procedencia y límites aplicables.

#### Política operativa

Determina límites de coste, frecuencia, volumen, duración, horario, destino, lote, integración, recurso o capacidad.

#### Política de riesgo

Determina controles adicionales según impacto, credenciales externas amplias, contenido no confiable, operación cross-organization, recurso compartido, automatización, procedencia, taint o degradación de controles.

#### Política de aprobación

Determina cuándo una operación requiere aprobación humana, separación de deberes, aprobador independiente o escalado adicional.

Una política puede imponer restricciones adicionales, pero no puede ampliar autoridad por encima de RFC-0003, RFC-0004 o una denegación válida.

Existe una postura mínima de riesgo fundacional independiente de la configuración de una organización.

Una operación derivada de contenido no confiable, una operación cross-organization, una operación que use una credencial externa amplia o una operación sobre un recurso compartido con aislamiento no verificable debe recibir controles reforzados.

Como mínimo, debe requerir aprobación humana independiente o resultar en deny, salvo excepción explícita, limitada, verificable y auditable definida por policy conforme a RFC-0003 y RFC-0004.

La ausencia de una política de riesgo específica nunca reduce esta postura mínima.
### 5.4 Decisión de política

Policy Engine puede producir una o más de estas decisiones lógicas:

- `allow`;
- `deny`;
- `limit`;
- `transform`;
- `require_approval`;
- `defer`.

Las decisiones se interpretan conforme a RFC-0003.

Una decisión debe incluir:

- identificador;
- solicitud evaluada;
- organización;
- identidades aplicables;
- políticas y versiones consideradas;
- resultado;
- restricciones;
- obligaciones de enforcement;
- transformaciones, cuando existan;
- motivo o categoría de decisión apta para auditoría;
- periodo de validez;
- referencia de correlación;
- evidencia de auditoría;
- snapshot verificable del contexto de decisión.

Toda decisión debe quedar ligada a un snapshot verificable del contexto de decisión, incluyendo una huella o referencia verificable de los atributos críticos, políticas y versiones evaluadas.

El snapshot debe incluir, cuando aplique, organización, identidades, delegaciones, concesiones, scopes, estado de revocación, clasificación, procedencia, taint, riesgo de integración, aprobación y versión de política.

Una decisión no puede reutilizarse sobre un snapshot de contexto, política, autorización o solicitud distinto.

`limit` solo puede reducir límites cuantitativos, frecuencia, volumen, presupuesto, duración, exposición de datos o alcance ya permitido. No puede cambiar organización, identidad, recurso objetivo, destinatario, acción, delegación ni ampliar scope.

`require_approval` solo puede suspender una solicitud todavía potencialmente autorizable. No puede convertir un deny terminal en una solicitud aprobable.

`defer` nunca es ejecutable y solo puede resolverse mediante una nueva evaluación de Policy Engine con contexto verificable o terminar como deny efectivo.

El periodo de validez de una decisión no autoriza por sí solo un efecto irreversible. Para efectos irreversibles, externos o relevantes, el punto de enforcement debe comprobar de nuevo los atributos críticos establecidos por este RFC antes de ejecutar.

Toda decisión provisional de `require_approval` o `defer` debe tener una expiración explícita. Si expira antes de cumplirse sus condiciones, deja de ser utilizable y la solicitud debe reevaluarse o terminar como deny efectivo.

Una decisión no es un Decision Binding ejecutable por sí sola.
### 5.5 Obligaciones de enforcement

Una obligación de enforcement es una condición verificable emitida por Policy Engine que debe aplicarse antes, durante o después de una operación permitida.

Las obligaciones que condicionan un efecto irreversible, externo o relevante deben aplicarse y verificarse antes de dicho efecto. Una obligación posterior no puede compensar ni autorizar retroactivamente un efecto irreversible ya producido.

Las obligaciones deben pertenecer a un catálogo tipado y versionado definido por Kern. Un componente de enforcement debe declarar de forma verificable qué tipos de obligación puede aplicar.

Ejemplos:

- exigir aprobación humana;
- imponer importe máximo;
- limitar número de destinatarios;
- restringir campos de datos;
- exigir redacción o transformación de datos;
- imponer frecuencia máxima;
- exigir identidad on-behalf-of cuando esté disponible;
- requerir auditoría reforzada;
- impedir uso de determinada integración;
- limitar duración o volumen;
- requerir separación de deberes;
- obligar a reevaluar antes de un efecto adicional;
- exigir confinamiento de credencial al scope autorizado.

Una obligación debe ser explícita, medible, verificable y aplicable por el componente responsable.

Toda obligación aplicable a una operación debe cumplirse de forma atómica antes del efecto correspondiente. El cumplimiento parcial, la incapacidad de verificar una obligación o la ausencia de soporte declarado para su tipo debe bloquear la operación relevante.

Las obligaciones cuantitativas que limiten presupuesto, frecuencia, volumen, destinatarios o capacidad deben tener una contabilidad agregada autoritativa. En operaciones compuestas o lotes, el límite debe aplicarse al efecto agregado gobernado, no solo a cada subefecto aislado.

Una obligación solo puede satisfacer una política que se declare explícitamente condicional. Una obligación no puede neutralizar, reinterpretar ni convertir en allow un deny terminal.
### 5.6 Composición de políticas

Una solicitud puede estar sometida simultáneamente a políticas de plataforma, organización, recurso, integración, identidad, datos, riesgo, operación y aprobación.

La composición debe ser fail-closed, determinista y monotónica respecto a la protección.

La autorización es conjuntiva por categoría y ámbito aplicable. Un `allow` es necesario pero no suficiente: toda política de autorización aplicable debe permitir la operación dentro de su scope.

Como regla fundacional:

1. una denegación válida prevalece sobre cualquier allow, limit, transform, aprobación o concesión;
2. todo `defer` aplicable bloquea ejecución, con independencia de otros allow, hasta que Policy Engine lo resuelva mediante nueva evaluación;
3. una política no puede ampliar autoridad concedida por otra capa;
4. una obligación adicional solo puede restringir o condicionar una operación;
5. las restricciones compatibles se componen en su forma más restrictiva, de manera independiente del orden;
6. si una restricción, límite, transformación u obligación no puede componerse de forma determinista y verificable, la operación relevante debe ser denegada;
7. una transformación solo puede producir una solicitud derivada más restrictiva;
8. una solicitud derivada debe conservar la cadena de origen, el contexto de seguridad y todos los deny terminales aplicables a la solicitud original;
9. una transformación no puede utilizarse para escapar, reducir o reevaluar fuera de alcance un deny terminal;
10. el número de transformaciones derivadas debe estar acotado. Si no converge dentro del límite aplicable, la solicitud debe terminar como deny;
11. una aprobación humana no puede revertir una denegación terminal ni crear autoridad inexistente;
12. una política de menor alcance no puede debilitar una política aplicable de mayor protección;
13. toda operación cross-organization requiere autorización conjuntiva, vigente y verificable de las organizaciones implicadas, además de los requisitos de RFC-0004;
14. si no puede determinarse qué políticas aplican, si una categoría exigible carece de evaluación explícita o si el contexto requerido no está disponible, la operación relevante debe ser denegada o deferida sin ejecución.

Las políticas de datos, riesgo, operación y aprobación cuyos atributos disparadores estén presentes deben producir una decisión explícita, obligación o deny. La ausencia de una coincidencia no puede interpretarse como permiso implícito.

El modelo detallado de precedencia entre ámbitos y la sintaxis de composición se decidirán posteriormente.
### 5.7 Decisión provisional y decisión ejecutable

Una decisión provisional expresa el resultado de Policy Engine sobre una solicitud final, pero no permite todavía un efecto externo cuando falte una aprobación, binding, revalidación o condición de enforcement.

Cuando exista una transformación permitida, la solicitud debe alcanzar primero su forma final derivada y reevaluada. Toda aprobación humana posterior debe vincularse exclusivamente a esa solicitud final, su payload final, scope final, obligaciones finales y contexto de seguridad aplicable.

Una decisión provisional no puede cruzar como autorización hacia Tool Engine, Knowledge Engine, channels, workflows, extensions, providers, runtimes ni sistemas externos.

Los componentes de enforcement solo pueden recibir una autorización ejecutable mediante Decision Binding final verificable conforme a RFC-0003.

Una decisión ejecutable requiere:

- contexto de decisión válido;
- snapshot verificable vigente;
- políticas aplicables evaluadas;
- concesiones, delegaciones y scopes válidos;
- obligaciones aplicables verificables;
- aprobación válida cuando se requiera;
- ausencia de suspensión, revocación, expiración o invalidación relevante;
- Decision Binding final verificable conforme a RFC-0003.

Para efectos irreversibles, externos o relevantes, la decisión ejecutable requiere además comprobación fresca de revocación, suspensión, expiración, invalidación de aprobación y versión de política aplicable en el punto de enforcement.

Un Decision Binding final no puede ser interpretado como válido si sus atributos críticos, sus políticas aplicables o su aprobación asociada han cambiado, expirado, sido revocados o no pueden verificarse de forma fresca.
### 5.8 Revalidación



Las decisiones, aprobaciones y bindings deben reevaluarse o invalidarse cuando cambie un atributo relevante, incluyendo:



- identidad;

- organización;

- delegación;

- concesión;

- scope;

- recurso;

- payload;

- clasificación;

- procedencia o taint;

- política aplicable;

- aprobación;

- riesgo de integración;

- estado de revocación;

- límite económico, temporal u operativo.



Toda operación de larga duración debe reevaluar Policy Engine antes de producir efectos relevantes adicionales.



Un cambio de organizaci?n, identidad, delegaci?n, concesi?n, scope, clasificaci?n, procedencia, taint, riesgo, revocaci?n, aprobaci?n, versi?n de pol?tica o rollback relevante invalida el snapshot asociado y exige nueva evaluaci?n.



Para efectos irreversibles, externos o relevantes, la comprobaci?n en el punto de enforcement debe verificar que el snapshot y las versiones de pol?tica siguen vigentes.



### 5.9 Auditoría de decisión

Toda decisión relevante debe generar evidencia suficiente para responder:

- qué solicitud se evaluó;
- para qué organización;
- qué identidades intervinieron;
- qué políticas y versiones se consideraron;
- qué resultado y restricciones se produjeron;
- qué obligaciones se impusieron;
- si se requirió o recibió aprobación;
- qué binding final se emitió, cuando aplique;
- qué revalidaciones o invalidaciones ocurrieron.

La auditoría debe usar referencias, huellas, categorías y datos minimizados cuando el contenido completo sea sensible.

Como mínimo, la evidencia de una decisión relevante debe incluir identificadores y versiones de políticas consideradas, referencia o huella del snapshot de contexto, resultado final, deny o defer aplicables, restricciones, obligaciones, transformaciones, aprobación, Decision Binding final cuando exista, y eventos de revalidación o invalidación.

La auditoría no debe almacenar por defecto el texto fuente completo de políticas ni atributos sensibles innecesarios.

Policy Engine no debe registrar ni requerir razonamiento interno del modelo como condición de auditoría.
## 6. Flujo lógico de decisión



```text

1. Una solicitud gobernada llega a Policy Engine con contexto verificable.

2. Policy Engine valida completitud, organización, identidad, scopes, delegaciones, estado de revocación y atributos de riesgo.

3. Identifica políticas aplicables.

4. Evalúa autorización, datos, operación, riesgo y aprobación.

5. Compone resultados y restricciones con postura fail-closed.

6. Si existe deny terminal, la solicitud no puede ejecutarse.

7. Si existe transform permitido, crea solicitud derivada más restrictiva y requiere reevaluación.

8. Si existe require_approval, produce decisión provisional y espera aprobación válida.

9. Si existen obligaciones, deben poder ser comprobadas por el punto de enforcement correspondiente.

10. Solo una decisión final válida, junto con aprobación cuando aplique y Decision Binding verificable, permite ejecución.

11. Antes de cada efecto externo o relevante, el punto de enforcement verifica binding, contexto vigente y obligaciones.

12. Audit registra decisión, restricciones, aprobación, binding, ejecución e invalidaciones relevantes.

```



No existe una vía alternativa para que una tool, workflow, agente, extensión, provider, runtime o channel ignore este flujo.



---



## 7. Integración con RFC-0003 y RFC-0004

RFC-0003 define el ciclo de ejecución gobernada, Decision Binding, aprobación humana, Tool Engine, Knowledge Engine y auditoría.

RFC-0004 define identidad, tenancy, autoridad, scopes, delegación, revocación, operadores y separación de deberes.

Este RFC define cómo Policy Engine evalúa y compone esas condiciones.

Los bundles de políticas, políticas compiladas, decisiones cacheadas, snapshots de contexto, resultados de evaluación y artefactos de enforcement deben ser organization-scoped por defecto.

Cuando un artefacto de política se comparta como recurso de plataforma, debe existir aislamiento verificable, propósito explícito, ausencia de contexto empresarial reutilizable y auditoría.

No puede reutilizarse implícitamente una decisión, caché, bundle compilado ni resultado de evaluación de una organización para otra.

Policy Engine no puede:

* ampliar scopes;
* crear delegaciones;
* ignorar suspensión, revocación o expiración;
* convertir una credencial externa amplia en autoridad;
* tratar una aprobación como concesión;
* reducir controles por contenido no confiable;
* permitir acceso cross-organization sin los requisitos de RFC-0004;
* emitir una decisión ejecutable sin Decision Binding final conforme a RFC-0003;
* tratar un atributo crítico ausente, auto-reportado o no verificable como evidencia suficiente;
* resolver un defer fuera de una nueva evaluación de Policy Engine;
* permitir que una transformación escape de un deny terminal heredado;
* autorizar un efecto irreversible solo por la vigencia temporal de una decisión o binding.
## 8. Invariantes

1. Toda operación relevante debe evaluarse con contexto explícito, completo, fresco cuando corresponda y verificable.
2. Un contexto incompleto, ambiguo, auto-reportado, caducado o imposible de verificar produce deny para una operación relevante.
3. La ausencia de un atributo crítico para determinar relevancia, clasificación, procedencia, taint, riesgo o revocación trata la solicitud como relevante y de mayor riesgo.
4. Toda decisión solo es válida para el snapshot verificable de contexto y versiones de política sobre el que fue emitida.
5. Policy Engine no ejecuta efectos externos ni actúa como una tool.
6. La autorización es conjuntiva: toda política de autorización aplicable debe permitir dentro de su scope; un allow aislado no es suficiente.
7. Una denegación válida es terminal y no puede neutralizarse mediante obligación, transformación, aprobación, concesión o reevaluación de una solicitud derivada.
8. Todo defer aplicable bloquea ejecución y solo Policy Engine puede resolverlo mediante nueva evaluación.
9. Ninguna política puede ampliar autoridad por encima de concesiones, delegaciones, scopes, RFC-0003 o RFC-0004.
10. Las obligaciones adicionales solo pueden restringir o condicionar una operación.
11. Toda obligación aplicable debe cumplirse de forma atómica. Una obligación no aplicable, no soportada, parcialmente cumplida o no verificable bloquea la operación relevante.
12. Las obligaciones-gate para efectos irreversibles, externos o relevantes deben verificarse antes del efecto.
13. Las obligaciones cuantitativas requieren contabilidad agregada autoritativa y se aplican al efecto compuesto o lote gobernado.
14. Una transformación solo puede producir una solicitud derivada más restrictiva, debe conservar cadena de origen y deny terminales aplicables, y debe reevaluarse.
15. Una transformación no puede escapar de un deny terminal. La no convergencia o exceso de iteraciones produce deny.
16. Una aprobación humana no crea autoridad, no amplía scope, no revierte un deny terminal y solo puede aprobar la solicitud final posterior a transformaciones.
17. Una decisión provisional no es ejecutable y no puede cruzar a un punto de enforcement como autorización.
18. Ningún componente puede convertir una decisión provisional o defer en autorización ejecutable.
19. Toda ejecución requiere Decision Binding final verificable conforme a RFC-0003.
20. Todo efecto irreversible, externo o relevante requiere comprobación fresca de atributos críticos, revocación, aprobación, versión de política y obligaciones en el punto de enforcement.
21. Toda decisión, aprobación o binding relevante debe invalidarse o reevaluarse cuando cambie un atributo relevante.
22. Una operación larga debe reevaluarse antes de producir efectos relevantes adicionales.
23. Si no se pueden determinar políticas aplicables, si una categoría exigible no produce una decisión explícita o si no se pueden componer restricciones de forma segura, la operación relevante no ejecuta.
24. La postura mínima de riesgo se aplica incluso sin política específica de organización para contenido no confiable, cross-organization, credenciales externas amplias o aislamiento no verificable.
25. Toda operación cross-organization requiere autorización conjuntiva, vigente, verificable y auditable de las organizaciones implicadas.
26. Los artefactos de política, cachés y decisiones son organization-scoped por defecto y no se reutilizan implícitamente entre organizaciones.
27. Policy Engine no puede usar razonamiento interno del modelo como autoridad o requisito de auditoría.
28. Una credencial externa amplia no constituye autoridad global.
29. No existe una vía alternativa de política o ejecución fuera de este modelo.
## 9. Consecuencias



Aceptar este RFC implica que futuros contratos de tools, knowledge sources, workflows, agentes, extensiones, providers, runtimes, canales, UI administrativa y APIs deben consultar o respetar Policy Engine antes de permitir operaciones relevantes.



Ningún componente podrá implementar un modelo local de autorización que contradiga la composición, obligaciones o invariantes definidos aquí.



Las políticas concretas podrán evolucionar, pero deberán respetar estas fronteras.



---



## 10. Preguntas abiertas

1. ¿Qué representación concreta usarán las políticas, condiciones y obligaciones?
2. ¿Cómo se ordenarán formalmente políticas de plataforma, organización, recurso, integración e identidad?
3. ¿Qué taxonomía de riesgos y operaciones de alto impacto utilizará Kern?
4. ¿Qué catálogo de obligaciones verificables debe existir en Core v1?
5. ¿Cómo se versionarán, desplegarán, probarán y revertirán políticas?
6. ¿Qué modelo técnico garantizará evaluación consistente en instalaciones distribuidas?
7. ¿Qué interfaces administrativas permitirán editar políticas sin crear configuraciones inseguras?
8. ¿Cómo se simularán políticas antes de aplicarlas en producción?
9. ¿Qué decisiones pueden cachearse, durante cuánto tiempo y bajo qué invalidaciones?
10. ¿Cómo se explicarán decisiones a usuarios y operadores sin filtrar reglas sensibles ni contenido protegido?
11. ¿Qué funciones deterministas usarán las distintas clases de límite y restricción para componer su forma más restrictiva?
12. ¿Qué catálogo tipado de obligaciones, capacidades de enforcement y mecanismos de contabilidad agregada formarán parte de Core v1?
13. ¿Qué mecanismos garantizarán frescura de atributos críticos, invalidación de bindings y consistencia de versión de política en instalaciones distribuidas?
14. ¿Qué límite máximo y estrategia de diagnóstico aplicarán a cadenas de transformaciones derivadas no convergentes?
## 11. Referencias



* RFC-0000 — The Kern RFC Process

* RFC-0001 — Kern Manifesto

* RFC-0002 — Kern Logical Architecture

* RFC-0003 — Governed Execution Contract

* RFC-0004 — Identity, Tenancy and Authorization Model



---



## 12. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial del modelo de evaluación y composición de políticas de Kern.

### 0.2.1 — 2026-06-27

Correcciones de semántica normativa tras verificación final. Hace explícitas la autorización conjuntiva, el defer bloqueante, la herencia de deny en transformaciones, el catálogo tipado y enforcement atómico de obligaciones, la contabilidad agregada, la integridad y frescura de atributos críticos, la postura mínima de riesgo, los snapshots verificables y la autorización cross-organization conjunta.

### 0.2.2 ? 2026-06-27

RFC Accepted por el Technical Owner tras revisi?n independiente de seguridad y arquitectura. Este RFC establece el modelo fundacional de Kern para evaluaci?n de pol?ticas, composici?n fail-closed, obligaciones de enforcement, decisiones provisionales, snapshots verificables y autorizaciones ejecutables mediante Decision Bindings.

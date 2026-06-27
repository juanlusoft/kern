# RFC-0005 — Policy Evaluation and Decision Model

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.1
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
- evidencia de auditoría.

Una decisión no es un Decision Binding ejecutable por sí sola.

### 5.5 Obligaciones de enforcement

Una obligación de enforcement es una condición verificable que debe aplicarse antes, durante o después de una operación permitida.

Ejemplos:

- exigir aprobación humana;
- imponer importe máximo;
- limitar número de destinatarios;
- restringir campos de datos;
- exigir redacción;
- imponer frecuencia máxima;
- exigir identidad on-behalf-of cuando esté disponible;
- requerir auditoría reforzada;
- impedir uso de determinada integración;
- limitar duración o volumen;
- requerir separación de deberes;
- obligar a reevaluar antes de un efecto adicional.

Una obligación debe ser explícita, medible, verificable y aplicable por el componente responsable.

Si una obligación no puede aplicarse o verificarse, la operación relevante debe ser denegada.

### 5.6 Composición de políticas

Una solicitud puede estar sometida simultáneamente a políticas de plataforma, organización, recurso, integración, identidad, datos, riesgo, operación y aprobación.

La composición debe ser fail-closed.

Como regla transitoria y fundacional:

1. una denegación válida prevalece sobre cualquier allow, limit, transform o concesión;
2. una política no puede ampliar autoridad concedida por otra capa;
3. una obligación adicional puede restringir una operación permitida;
4. las restricciones compatibles se acumulan;
5. las restricciones incompatibles deben producir deny o defer no ejecutable;
6. una transformación solo puede producir una solicitud derivada más restrictiva;
7. una aprobación humana no puede revertir una denegación terminal ni crear autoridad inexistente;
8. una política de menor alcance no puede debilitar una política aplicable de mayor protección;
9. si no puede determinarse qué políticas aplican, la operación relevante debe ser denegada o deferida sin ejecución.

El modelo detallado de precedencia entre ámbitos y la sintaxis de composición se decidirán posteriormente.

### 5.7 Decisión provisional y decisión ejecutable

Una decisión provisional expresa el resultado de Policy Engine sobre una solicitud final, pero no permite todavía un efecto externo cuando falte una aprobación, binding, revalidación o condición de enforcement.

Una decisión ejecutable requiere:

- contexto de decisión válido;
- políticas aplicables evaluadas;
- concesiones, delegaciones y scopes válidos;
- obligaciones aplicables verificables;
- aprobación válida cuando se requiera;
- ausencia de suspensión, revocación, expiración o invalidación relevante;
- Decision Binding final verificable conforme a RFC-0003.

Ningún agente, workflow, canal, extensión, tool o provider puede convertir una decisión provisional en una autorización ejecutable.

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

Policy Engine no debe registrar ni requerir razonamiento interno del modelo como condición de auditoría.

---

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

Policy Engine no puede:

* ampliar scopes;
* crear delegaciones;
* ignorar suspensión, revocación o expiración;
* convertir una credencial externa amplia en autoridad;
* tratar una aprobación como concesión;
* reducir controles por contenido no confiable;
* permitir acceso cross-organization sin los requisitos de RFC-0004;
* emitir una decisión ejecutable sin Decision Binding final conforme a RFC-0003.

---

## 8. Invariantes

1. Toda operación relevante debe evaluarse con contexto explícito, completo y verificable.
2. Un contexto incompleto, ambiguo o imposible de verificar produce deny para una operación relevante.
3. Policy Engine no ejecuta efectos externos ni actúa como una tool.
4. Una denegación válida es terminal.
5. Ninguna política puede ampliar autoridad por encima de concesiones, delegaciones, scopes, RFC-0003 o RFC-0004.
6. Las obligaciones adicionales solo pueden restringir o condicionar una operación.
7. Una obligación no aplicable o no verificable bloquea la operación relevante.
8. Una transformación solo puede producir una solicitud derivada más restrictiva y debe reevaluarse.
9. Una aprobación humana no crea autoridad, no amplía scope y no revierte un deny terminal.
10. Una decisión provisional no es ejecutable.
11. Ningún componente puede convertir una decisión provisional en autorización ejecutable.
12. Toda ejecución requiere Decision Binding final verificable conforme a RFC-0003.
13. Toda decisión, aprobación o binding relevante debe invalidarse o reevaluarse cuando cambie un atributo relevante.
14. Una operación larga debe reevaluarse antes de producir efectos relevantes adicionales.
15. Si no se pueden determinar políticas aplicables o componer restricciones de forma segura, la operación relevante no ejecuta.
16. Policy Engine no puede usar razonamiento interno del modelo como autoridad o requisito de auditoría.
17. Una credencial externa amplia no constituye autoridad global.
18. No existe una vía alternativa de política o ejecución fuera de este modelo.

---

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

---

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

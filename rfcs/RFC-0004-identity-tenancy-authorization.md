# RFC-0004 — Identity, Tenancy and Authorization Model

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.1
- **Tipo:** Architecture / Security / Foundational
- **Dominio:** Identidad, tenancy y autorización
- **Depends on:** RFC-0000, RFC-0001, RFC-0002, RFC-0003
- **Decisión requerida:** Aprobación del modelo lógico de identidad, aislamiento organizativo y autorización de Kern

---

## 1. Resumen ejecutivo

Kern necesita distinguir con precisión quién solicita una operación, en nombre de quién actúa, a qué organización pertenece, qué recursos puede tocar y qué alcance tiene su autoridad.

Este RFC define el modelo lógico de:

- identidades humanas;
- identidades de servicio;
- identidades de agente;
- identidades de workflow;
- extensiones y componentes externos;
- organizaciones y recursos de plataforma;
- pertenencia organizativa;
- delegación;
- autorización;
- scopes;
- límites temporales;
- aprobación humana;
- revocación.

El objetivo es que Policy Engine y el Governed Execution Contract puedan evaluar solicitudes con identidades y límites explícitos, evitando privilegios globales implícitos, confusión entre organizaciones y escalada de autoridad mediante agentes, tools o integraciones.

---

## 2. Problema

Una plataforma empresarial de IA se vuelve insegura cuando trata todas las identidades como si fueran equivalentes.

Ejemplos de errores que Kern debe evitar:

- un agente recibe permisos globales porque actúa para muchos usuarios;
- una tool usa una credencial de servicio amplia sin relación verificable con el alcance autorizado;
- un workflow programado hereda indefinidamente privilegios de su creador;
- un canal externo afirma una organización sin validación central;
- una aprobación humana concede autoridad más allá de la operación revisada;
- una extensión se habilita para una organización y termina accediendo a datos de otra;
- un recurso compartido se interpreta accidentalmente como recurso de plataforma;
- un usuario revocado mantiene acceso mediante sesiones, bindings, aprobaciones o credenciales delegadas previas.

Kern necesita un modelo que haga de la organización y la autoridad un contexto explícito, verificable y revocable.

---

## 3. Objetivos

Este RFC debe:

1. Definir tipos de identidad con responsabilidades distintas.
2. Hacer obligatorio el organization context para recursos y operaciones.
3. Distinguir identidad ejecutora de identidad delegada.
4. Evitar que una identidad de agente, servicio, workflow o extensión se convierta en un superusuario.
5. Definir autoridad como una concesión explícita, limitada y revocable.
6. Permitir autorización basada en organización, recurso, acción, alcance, contexto y tiempo.
7. Asegurar que las aprobaciones humanas no amplían privilegios existentes.
8. Permitir que RFC-0003 emita Decision Bindings con información de identidad y autoridad verificable.
9. Mantener separación entre modelo lógico de autorización y formato técnico concreto de tokens, sesiones o credenciales.
10. Proteger segregación multiempresa y evitar acceso cross-organization por defecto.

---

## 4. No objetivos

Este RFC no decide:

- proveedor concreto de identidad;
- protocolo de autenticación;
- formato de token;
- algoritmo criptográfico;
- interfaz de inicio de sesión;
- modelo final de roles;
- sintaxis de políticas;
- directorio corporativo o integración SSO;
- jerarquía formal de departamentos, filiales o grupos;
- mecanismo de almacenamiento de sesiones;
- implementación concreta de revocación;
- modelo comercial de organizaciones;
- federación entre instalaciones de Kern.

Estas decisiones requerirán RFCs posteriores.

---

## 5. Conceptos normativos

### 5.1 Organización

Una organización representa el límite principal de propiedad, control, políticas, datos y operación dentro de Kern.

Toda identidad, recurso, sesión, solicitud, Decision Binding, aprobación, configuración, tool, knowledge source, agente, workflow, resultado, caché y registro debe llevar un organization context explícito o declararse formalmente como recurso de plataforma.

Por defecto, todo recurso es organization-scoped.

Una organización no puede acceder a datos, configuraciones, resultados o recursos de otra organización salvo mediante una política explícita de compartición aprobada por una autoridad válida.

### 5.2 Recurso de plataforma

Un recurso de plataforma es un recurso compartido que no pertenece a una organización concreta.

Un recurso no puede declararse como recurso de plataforma por una extensión, agente, workflow, canal o solicitante.

Solo una autoridad explícita del Control Plane puede crear o clasificar un recurso de plataforma, y esa decisión debe quedar auditada.

Los recursos de plataforma deben tener límites de acceso, ownership, propósito y políticas explícitas.

### 5.3 Identidad

Una identidad es una entidad reconocida por Kern que puede autenticarse, solicitar, ejecutar, aprobar, administrar o auditar operaciones según la autoridad que se le haya concedido.

Toda identidad debe tener:

- identificador estable;
- tipo de identidad;
- estado de ciclo de vida;
- organización o condición explícita de recurso de plataforma;
- atributos relevantes de autorización;
- referencias de origen o autenticación cuando aplique;
- estado de revocación o suspensión;
- trazabilidad de creación, modificación y uso relevante.

La existencia de una identidad no concede autoridad por sí sola.

### 5.4 Tipos de identidad

Kern reconoce, como mínimo, estos tipos lógicos de identidad:

#### Identidad humana

Representa a una persona que puede iniciar sesiones, solicitar operaciones, aprobar acciones o administrar recursos dentro de su autoridad.

#### Identidad de servicio

Representa un proceso no humano autorizado para ejecutar operaciones programadas, integraciones o automatizaciones.

Debe tener propósito, organización, alcance, propietario responsable y límites explícitos.

No puede asumir implícitamente la identidad de una persona.

#### Identidad de agente

Representa un agente de IA configurado para razonar, proponer solicitudes y coordinar operaciones gobernadas.

Una identidad de agente no concede autoridad inherente sobre datos o sistemas externos.

Su autoridad efectiva depende de sus permisos, de la identidad delegada cuando exista, de Policy Engine y de los límites de cada solicitud.

#### Identidad de workflow

Representa una ejecución automatizada o plantilla de proceso.

Debe tener una identidad propia o una identidad de servicio explícitamente asociada.

Un workflow no hereda indefinidamente los privilegios de quien lo creó.

#### Identidad de extensión

Representa una extensión, plugin, provider, runtime, channel, tool o integración instalada en Kern.

La identidad de extensión identifica al componente técnico, pero no le concede acceso a recursos de organizaciones.

Los permisos declarados por una extensión son solicitudes sujetas a operador, políticas y límites organizativos.

### 5.5 Identidad ejecutora e identidad delegada

La identidad ejecutora representa el agente, workflow, servicio o componente que realiza una solicitud dentro de Kern.

La identidad delegada representa a la persona u organización en cuyo nombre se inicia una operación, cuando exista.

Una solicitud puede incluir ambas identidades, pero deben ser evaluadas de forma separada.

La autoridad efectiva nunca puede exceder la intersección permitida entre:

- la identidad ejecutora;
- la identidad delegada, cuando exista;
- la organización;
- el recurso objetivo;
- la acción solicitada;
- el scope;
- las políticas aplicables;
- los límites temporales y operativos.

Las solicitudes programadas sin usuario humano deben usar una identidad de servicio explícita y no inventar una identidad delegada humana.

### 5.6 Autoridad

La autoridad es la capacidad explícitamente concedida para realizar una acción sobre un recurso dentro de un contexto definido.

La autoridad debe ser:

- explícita;
- limitada;
- verificable;
- revocable;
- auditable;
- scoped por organización salvo decisión explícita de plataforma;
- limitada por tiempo cuando aplique;
- evaluable por Policy Engine.

La autoridad no se deriva automáticamente de:

- ser administrador de un canal;
- crear un agente;
- instalar una extensión;
- poseer una credencial externa;
- tener acceso a una conversación;
- haber aprobado una operación distinta;
- pertenecer a otra organización;
- ser el autor de un workflow.

### 5.7 Scope

Un scope define los límites verificables de una concesión de autoridad.

Puede restringir, entre otros:

- organización;
- recurso o tipo de recurso;
- acción;
- conjunto de datos;
- campos;
- destinatarios;
- importe;
- frecuencia;
- presupuesto;
- ventana temporal;
- canal;
- integración;
- nivel de clasificación;
- operación individual o lote limitado.

Un scope debe ser lo suficientemente específico para permitir a Policy Engine y Tool Engine comprobar si una operación real permanece dentro del límite autorizado.

Un scope ambiguo debe tratarse como insuficiente para autorizar una operación relevante.

### 5.8 Delegación

La delegación permite que una identidad ejecutora actúe en nombre de una identidad delegada dentro de límites explícitos.

Toda delegación debe incluir o referenciar:

- organización;
- identidad ejecutora;
- identidad delegada;
- acciones permitidas;
- recursos o scopes permitidos;
- periodo de validez;
- condiciones de revocación;
- origen de la delegación;
- evidencia de auditoría.

La delegación no puede conceder más autoridad que la que posee la identidad delegada ni más autoridad que la permitida a la identidad ejecutora.

La delegación no puede utilizarse para cruzar organizaciones sin política explícita de compartición y autoridad válida.

### 5.9 Concesión de autoridad

Una concesión de autoridad es una decisión explícita que habilita una identidad, dentro de un scope definido, a solicitar o ejecutar una clase de operación.

Una concesión debe tener:

- emisor o autoridad responsable;
- identidad destinataria;
- organización;
- scope;
- fecha de creación;
- estado;
- expiración cuando aplique;
- referencia de revocación;
- evidencia de auditoría.

Una concesión no sustituye Policy Engine ni Decision Binding.

Una concesión define el límite potencial de una operación; Policy Engine decide si esa operación concreta puede realizarse en el contexto actual.

### 5.10 Revocación y suspensión

Kern debe poder revocar o suspender identidades, delegaciones, concesiones, sesiones, aprobaciones, Decision Bindings y accesos de extensión.

Una revocación o suspensión debe aplicarse antes de nuevas operaciones relevantes y debe invalidar cualquier autoridad que dependa de ella.

Las operaciones ya iniciadas deben reevaluarse antes de producir efectos adicionales cuando sea razonable.

La implementación concreta de propagación de revocación se decidirá en un RFC posterior.

---

## 6. Modelo de autorización

La autorización en Kern no se resuelve mediante un único rol global.

Una operación debe evaluarse usando, como mínimo:

```text
organization context
+ identidad ejecutora
+ identidad delegada, cuando exista
+ recurso objetivo
+ acción solicitada
+ scope
+ clasificación y procedencia
+ concesiones y delegaciones válidas
+ políticas aplicables
+ estado de revocación
+ límites temporales, operativos y económicos
````

Una autorización debe poder resultar en:

* permitir;
* denegar;
* limitar;
* requerir aprobación;
* transformar de forma restrictiva;
* deferir para resolución adicional.

Las reglas específicas de composición de políticas pertenecen a RFCs posteriores. Mientras tanto, una denegación válida prevalece sobre cualquier concesión, transformación o permiso.

---

## 7. Relaciones entre identidades

Kern debe modelar explícitamente relaciones relevantes entre identidades:

* persona miembro de una organización;
* persona administradora de una organización;
* agente propiedad de una organización;
* agente configurado por una identidad humana;
* workflow ejecutado por una identidad de servicio;
* extensión habilitada para una organización;
* tool asociada a una extensión;
* provider o runtime autorizado como recurso de plataforma;
* identidad delegada por otra identidad;
* aprobador autorizado para un tipo de operación.

Estas relaciones no conceden por sí mismas autoridad ilimitada.

Cada relación debe estar limitada por organización, propósito, scope y políticas aplicables.

---

## 8. Requisitos para tipos concretos

### 8.1 Usuarios humanos

Un usuario humano puede solicitar, administrar o aprobar operaciones según sus concesiones y políticas.

Un usuario no puede aprobar una operación que exceda su propia autoridad.

Las aprobaciones deben seguir RFC-0003 y nunca crean autoridad nueva.

### 8.2 Agentes

Un agente puede construir contexto, razonar y proponer Action Requests o Knowledge Requests.

Un agente no puede:

* ejecutar efectos externos directamente;
* aprobar sus propias operaciones;
* elevar sus propios permisos;
* cambiar su organización;
* declarar un recurso como recurso de plataforma;
* eliminar o modificar su propia auditoría;
* asumir una identidad delegada inexistente.

### 8.3 Workflows

Un workflow debe ejecutar bajo identidad de workflow o identidad de servicio explícita.

Los permisos de un workflow deben evaluarse en cada operación relevante.

Un workflow no puede mantener acceso después de una revocación, suspensión, expiración o cambio de política aplicable.

### 8.4 Extensiones, tools y canales

Una extensión puede declarar capacidades, permisos requeridos y compatibilidad, pero no puede concederse autoridad.

Una tool puede usar credenciales externas únicamente dentro del alcance autorizado por una solicitud y su Decision Binding.

Un channel puede aportar credenciales y referencias de origen, pero no puede validar por sí mismo organización, identidad, confianza, clasificación o taint.

### 8.5 Operadores de Kern

Un operador de Kern administra componentes, configuraciones y organizaciones dentro de la autoridad que se le haya concedido.

Un operador no obtiene por defecto acceso al contenido empresarial de todas las organizaciones.

Las operaciones administrativas relevantes de un operador deben ser auditadas y estar sujetas a tenancy, scopes y políticas.

---

## 9. Aprobación humana y separación de deberes

La aprobación humana es una decisión limitada sobre una solicitud final concreta, según RFC-0003.

Una aprobación no puede:

* ampliar un scope;
* sustituir una concesión inexistente;
* crear delegación;
* cambiar organización;
* elevar privilegios;
* aprobar una identidad suspendida o revocada;
* reutilizarse para otra solicitud;
* evitar una denegación terminal de Policy Engine.

Kern debe poder requerir separación de deberes cuando una política lo exija.

Una misma identidad no debe solicitar y aprobar una operación de alto impacto cuando la política aplicable requiera aprobación independiente.

El modelo concreto de umbrales, doble aprobación y flujos de escalado se decidirá posteriormente.

---

## 10. Tenancy y recursos compartidos

La segregación organizativa es una invariante transversal.

Kern debe asegurar que:

* sesiones, conversaciones, memoria, cachés, resultados, logs, aprobaciones y bindings mantengan organization context;
* una identidad de una organización no pueda enumerar recursos de otra;
* un agente no pueda reutilizar contexto de otra organización;
* una extensión habilitada para una organización no pueda operar sobre otra sin autorización explícita;
* modelos, providers, runtimes o infraestructura compartida no reutilicen contexto, memoria o cachés entre organizaciones sin aislamiento y política explícita;
* todo acceso cross-organization sea explícito, limitado, auditable y revocable.

---

## 11. Integración con RFC-0003

RFC-0003 define cómo una solicitud se evalúa, aprueba, vincula y ejecuta.

Este RFC define los atributos de identidad, organización, delegación, autoridad y scope que alimentan esa evaluación.

Antes de emitir un Decision Binding, Policy Engine debe poder comprobar:

* organización válida;
* identidad ejecutora válida;
* identidad delegada válida, cuando exista;
* delegación válida, cuando aplique;
* concesiones y scopes suficientes;
* ausencia de revocación o suspensión;
* relación permitida entre identidades;
* aprobación válida, cuando se requiera;
* políticas y límites aplicables.

Ningún Decision Binding puede conceder autoridad que este RFC no permita.

---

## 12. Invariantes

1. Toda operación tiene organization context explícito o pertenece formalmente a un recurso de plataforma.
2. Todo recurso es organization-scoped por defecto.
3. Ninguna identidad obtiene autoridad por existir, autenticarse o instalarse.
4. Ninguna identidad ejecutora puede exceder la autoridad de la identidad delegada, cuando exista.
5. Ninguna delegación puede ampliar autoridad respecto a ejecutor, delegado, organización o scope.
6. Ninguna extensión, tool, agente, workflow o canal puede concederse permisos a sí misma.
7. Ningún canal valida por sí mismo organización, identidad, confianza, clasificación o taint.
8. Ningún agente aprueba sus propias operaciones.
9. Ninguna aprobación humana crea autoridad nueva ni amplía un scope existente.
10. Toda autoridad relevante debe poder revocarse o suspenderse.
11. Una revocación o suspensión invalida futuras operaciones dependientes antes de su ejecución.
12. Todo acceso cross-organization requiere política explícita, autoridad válida, scope limitado y auditoría.
13. Ninguna credencial externa puede justificar por sí misma una operación fuera del scope autorizado.
14. Ningún recurso puede declararse de plataforma sin autoridad explícita del Control Plane y auditoría.
15. Una denegación válida prevalece sobre cualquier concesión, delegación o permiso.

---

## 13. Consecuencias

Aceptar este RFC implica que futuras implementaciones de autenticación, roles, permisos, sesiones, herramientas, plugins, workflows, proveedores, canales y UI administrativa deben respetar esta separación entre identidad, autoridad, delegación y ejecución.

No se podrá introducir una integración que trate una credencial externa, un rol global, un agente o un canal como fuente autónoma de autoridad.

Cualquier excepción requiere RFC explícito.

---

## 14. Preguntas abiertas

1. ¿Qué combinación de roles, atributos, relaciones y políticas debe usar Kern como modelo formal de autorización?
2. ¿Cómo se representarán y revocarán técnicamente delegaciones, concesiones y sesiones?
3. ¿Qué jerarquía organizativa soportará Kern para departamentos, filiales y unidades delegadas?
4. ¿Qué reglas de separación de deberes se exigirán para distintos niveles de impacto?
5. ¿Cómo se representarán scopes complejos de datos, campos, destinatarios, presupuestos y lotes?
6. ¿Qué interfaces de administración permitirán conceder autoridad sin crear configuraciones inseguras?
7. ¿Qué mecanismos de federación o SSO podrán integrarse sin romper tenancy y revocación?
8. ¿Cómo se comprobará revocación de forma consistente en operaciones distribuidas o de larga duración?
9. ¿Qué tipo de recursos de plataforma deben existir y qué autoridad puede administrarlos?

---

## 15. Referencias

* RFC-0000 — The Kern RFC Process
* RFC-0001 — Kern Manifesto
* RFC-0002 — Kern Logical Architecture
* RFC-0003 — Governed Execution Contract

---

## 16. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial del modelo de identidad, tenancy y autorización de Kern.


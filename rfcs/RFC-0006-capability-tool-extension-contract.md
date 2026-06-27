# RFC-0006 — Capability, Tool and Extension Contract

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.1
- **Tipo:** Architecture / Security / Foundational
- **Dominio:** Capacidades, tools, integraciones, extensiones y proveedores
- **Depends on:** RFC-0002, RFC-0003, RFC-0004, RFC-0005
- **Decisión requerida:** Aprobación del contrato lógico para capabilities, tools, integraciones y extensiones en Kern

---

## 1. Resumen ejecutivo

Kern necesita un contrato común para describir capacidades disponibles, cómo se implementan, quién puede activarlas y qué fronteras de seguridad las gobiernan.

Este RFC define la relación entre capability, tool, integration, extension, provider, registry, capability resolution, manifest y enforcement point sin fijar formatos, lenguajes, transporte, runtime ni mecanismos criptográficos concretos.

El objetivo es que una capability pueda declararse, resolverse, instalarse, activarse, auditarse y retirarse sin crear rutas alternativas de ejecución fuera de RFC-0003, RFC-0004 y RFC-0005.

---

## 2. Problema

Sin un contrato común, una integración puede exponer efectos ocultos, una extensión puede sobrepasar su alcance, un registry puede confundirse con autorización y una capability puede parecer inocua mientras ejecuta subefectos amplios.

Kern necesita separar con claridad:

- lo que una capability promete;
- lo que una tool o integration implementa;
- lo que una extensión solicita;
- lo que un provider suministra;
- lo que un registry publica;
- lo que capability resolution selecciona;
- lo que un enforcement point permite ejecutar.

---

## 3. Objetivos

Este RFC debe:

1. Definir normativamente capability, tool, integration, extension, provider, registry, capability resolution, manifest y enforcement point.
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

### 5.1 Capability

Una capability es una descripción estable de una operación disponible en Kern.

Una capability define una acción posible, no una concesión de autoridad por sí misma.

Una capability puede ser resuelta hacia una implementación concreta, pero solo dentro de los límites de identidad, scopes, delegación, policy y binding aplicables.

### 5.2 Tool, integration y extension

Una tool es una implementación operativa de una capability orientada a ejecutar una acción concreta.

Una integration es una capability o implementación que conecta Kern con un sistema, recurso o servicio externo.

Una extension es un paquete lógico que puede solicitar capacidades, proponer configuraciones, declarar necesidades y participar en el ciclo de vida de capabilities, pero no puede auto-concederse autoridad.

Una credencial externa no constituye una capability ni una autoridad.

### 5.3 Provider, registry, capability resolution y manifest

Un provider es la fuente lógica que suministra una implementación, artefacto o soporte para una tool, integration o extension.

Un registry es el catálogo gobernado que publica capabilities disponibles y sus metadatos mínimos.

Capability resolution es la responsabilidad lógica de seleccionar qué capability, versión, implementación o configuración puede atender una solicitud dada el contexto gobernado.

Registry y capability resolution son responsabilidades distintas, conforme a RFC-0002.

Un manifest es la declaración de necesidades, capacidades solicitadas, dependencias, riesgos, límites y requisitos de instalación o activación de una extensión o capability.

Un manifest no concede permisos, no crea scopes y no sustituye Decision Binding.

### 5.4 Enforcement point

Un enforcement point es la frontera donde Kern verifica que una capability, tool, integration o extension puede producir un efecto permitido bajo políticas, bindings, obligaciones y revalidaciones vigentes.

Ningún enforcement point puede ejecutar fuera de RFC-0003, RFC-0004 y RFC-0005.

---

## 6. Modelo lógico

### 6.1 Contrato mínimo de una capability

Toda capability debe declarar, como mínimo:

- identificador estable;
- versión;
- organización o clasificación como recurso de plataforma;
- operación declarada;
- recurso objetivo;
- tipo de efecto: lectura, escritura, externo, irreversible o compuesto;
- requisitos de identidad, scopes y delegación;
- requisitos de Policy Engine;
- obligaciones soportadas;
- clasificación de riesgo;
- contrato de entrada y salida;
- idempotencia, correlación y límites cuando correspondan.

### 6.2 Relación entre declaración e implementación

Una capability describe lo que puede ocurrir.

Una tool o integration implementa la capability de forma concreta.

Una extension puede solicitar capabilities, pero no puede ampliar scopes, delegaciones, identidades ni organización por sí misma.

Una capability no puede ocultar subefectos bajo una operación aparentemente inocua.

Las operaciones compuestas deben declarar sus subefectos gobernables.

### 6.3 Requisitos de gobernanza

Toda capability debe respetar la composición de políticas, las obligaciones y el Decision Binding final cuando corresponda.

Una capability con efecto externo o irreversible requiere Decision Binding final verificable.

Una tool o integration debe verificar las obligaciones aplicables antes del efecto.

Una actualización de extensión o capability que cambie permisos, riesgo, efectos, datos o destinos requiere reevaluación y, cuando corresponda, nuevo consentimiento.

---

## 7. Ciclo de vida

El ciclo de vida lógico de una capability, tool o extension incluye, como mínimo:

- registro;
- validación;
- instalación;
- activación;
- actualización;
- suspensión;
- revocación;
- retirada;
- compatibilidad;
- deprecación.

Cada transición debe ser trazable y verificable.

La activación no implica consentimiento permanente.

La suspensión, revocación o retirada invalidan el uso dependiente.

La compatibilidad debe comprobarse antes de activar o actualizar una capability o extensión.

---

## 8. Integración con RFC-0002 a RFC-0005

RFC-0002 define la arquitectura lógica y la separación entre registry, capability resolution y fronteras de control.

RFC-0003 define el ciclo de ejecución gobernada, Decision Binding, aprobación humana, Tool Engine y auditoría.

RFC-0004 define identidad, tenancy, scopes, delegación, revocación y separación de deberes.

RFC-0005 define composición de políticas, riesgo, obligaciones, transformaciones y decisiones provisionales.

Este RFC define cómo capabilities, tools, integrations y extensions consumen esas fronteras sin sustituirlas.

Una capability no puede ejecutarse fuera de RFC-0003, RFC-0004 y RFC-0005.

Una actualización que cambie permisos, riesgo, efectos, datos o destinos exige nueva evaluación y, si afecta a consentimiento, nuevo consentimiento.

---

## 9. Invariantes

1. Una capability no equivale a autoridad.
2. Un manifest no equivale a permiso.
3. Una extension no puede autoaprobarse ni auto-concederse scopes.
4. Una capability no puede ejecutar sin binding cuando corresponda.
5. Una capability no puede ampliar scopes, identidad, delegación ni organización.
6. Ninguna tool puede implementar una ruta alternativa de ejecución fuera de RFC-0003 a RFC-0005.
7. Cambios de riesgo o permisos invalidan consentimientos y autorizaciones dependientes.
8. Credenciales externas amplias no se convierten en permisos globales.
9. Operaciones compuestas no pueden esconder efectos.
10. Recursos compartidos requieren aislamiento verificable.
11. Registry y capability resolution son responsabilidades distintas.
12. Un manifest declara necesidades, no permisos.

---

## 10. Consecuencias

Aceptar este RFC implica que toda capability, tool, integration o extension futura debe:

- declararse de forma estable y auditable;
- respetar la separación entre catálogo y resolución;
- pasar por las fronteras de RFC-0003, RFC-0004 y RFC-0005 cuando corresponda;
- preservar multi-tenancy por defecto;
- exponer subefectos cuando existan;
- someter cambios relevantes a reevaluación.

Ningún componente podrá usar una capability para crear una vía de ejecución paralela a las reglas de Kern.

---

## 11. Preguntas abiertas

1. ¿Qué formato de manifest se decidirá más adelante?
2. ¿Qué transporte o protocolo gobernará la distribución de capabilities?
3. ¿Cómo se implementará el sandboxing concreto?
4. ¿Cómo se distribuirán las extensiones?
5. ¿Qué mecanismo de firma o attestation se elegirá?
6. ¿Qué SDKs se construirán y con qué contrato?
7. ¿Cuál será el catálogo inicial de capabilities?
8. ¿Qué mecanismos técnicos de aislamiento se seleccionarán?
9. ¿Qué UI de instalación y consentimiento se usará?

---

## 12. Referencias

* RFC-0002 — Kern Logical Architecture
* RFC-0003 — Governed Execution Contract
* RFC-0004 — Identity, Tenancy and Authorization Model
* RFC-0005 — Policy Evaluation and Decision Model

---

## 13. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial del contrato lógico para capabilities, tools, integraciones y extensiones de Kern.

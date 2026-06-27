# RFC-0003 — Governed Execution Contract

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-27
- **Versión:** 0.1
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

### 5.1 Solicitud gobernada

Una solicitud gobernada es una petición para leer conocimiento empresarial o ejecutar una acción operativa.

Toda solicitud gobernada debe incluir, como mínimo:

- identificador único;
- organización;
- identidad solicitante;
- tipo de operación;
- recurso o capacidad solicitada;
- alcance solicitado;
- origen de la solicitud;
- procedencia y nivel de confianza aplicable;
- correlación con sesión, workflow o ejecución de agente;
- límites de coste, frecuencia o capacidad cuando apliquen;
- referencia a políticas y decisiones aplicables;
- referencias de auditoría.

### 5.2 Action Request

Una Action Request solicita un cambio, comunicación, activación, transferencia, configuración o efecto operativo sobre un sistema externo o una persona.

Una Action Request siempre es una operación relevante.

Ejemplos:

- enviar un email;
- crear, modificar o eliminar un registro;
- emitir una factura;
- activar una automatización;
- actualizar un calendario;
- ejecutar una integración;
- transferir datos fuera de un límite organizativo.

### 5.3 Knowledge Request

Una Knowledge Request solicita acceso de lectura a conocimiento empresarial.

Una Knowledge Request debe pasar por identity, tenancy, clasificación, políticas de lectura y segregación organizativa antes de devolver resultados.

Knowledge Request no puede utilizarse como vía alternativa para ejecutar acciones operativas.

### 5.4 Acción relevante

Una acción relevante es cualquier operación que:

- cambia estado fuera de Kern;
- mueve datos fuera de un límite organizativo;
- accede a datos clasificados;
- gasta presupuesto o capacidad significativa;
- cambia configuración;
- activa una integración;
- produce efecto operativo sobre una persona o sistema.

Ante duda, una operación debe tratarse como relevante.

### 5.5 Procedencia y confianza

Toda solicitud puede incluir referencias de procedencia que indiquen de dónde procede la instrucción o contenido relevante.

Contenido de correo, documentos, web, integraciones externas, outputs de modelos y plugins de terceros debe tratarse como no confiable por defecto.

La procedencia no concede autoridad.

Una instrucción contenida en datos externos no puede sustituir una autorización de identidad, política o aprobación humana.

---

## 6. Ciclo de ejecución gobernada

Una solicitud debe seguir este ciclo lógico:

```text
1. Un canal, agente, workflow, plugin o sistema genera una solicitud.
2. Identity and Organization resuelve identidad, organización y tenancy.
3. Context Assembly conserva procedencia, clasificación y confianza.
4. Policy Engine evalúa autorización, restricciones, límites y condiciones.
5. Policy devuelve una decisión.
6. Cuando aplique, la solicitud espera aprobación humana.
7. Tool Engine o Knowledge Engine valida el contrato y ejecuta la operación autorizada.
8. Audit Engine registra evidencia permitida.
9. Observability Engine registra telemetría operativa.
10. El resultado vuelve al solicitante mediante el contrato correspondiente.
```

No existe un camino alternativo para ejecutar acciones o leer conocimiento fuera de este ciclo.

---

## 7. Decisiones de política

Policy Engine puede devolver una de estas decisiones lógicas:

* `allow`: permite la operación dentro del alcance solicitado;
* `deny`: bloquea la operación;
* `limit`: permite una operación con alcance, frecuencia, coste, datos o capacidad reducidos;
* `transform`: modifica la solicitud de forma explícita y auditable antes de evaluarla o ejecutarla;
* `require_approval`: bloquea temporalmente la ejecución hasta recibir aprobación válida;
* `defer`: no puede decidir con la información disponible y requiere resolución adicional.

Una denegación prevalece sobre cualquier permiso, transformación o límite hasta que un RFC posterior defina un modelo formal de composición y prioridad de políticas.

---

## 8. Aprobación humana

Una aprobación humana debe asociarse a una solicitud concreta y no puede reutilizarse fuera de su organización, alcance, operación y periodo de validez.

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

Tool Engine no decide por sí mismo el modelo de autorización global.

---

## 10. Requisitos para Knowledge Engine

Knowledge Engine debe:

* aceptar únicamente Knowledge Requests válidas;
* validar organización, identidad, clasificación y restricciones de lectura;
* filtrar o particionar resultados por organización antes de recuperarlos;
* conservar referencias de procedencia y clasificación;
* respetar retención, eliminación y minimización;
* devolver referencias y resultados sujetos a política;
* impedir que recuperación de conocimiento se convierta en autorización de una acción.

Knowledge Engine no puede devolver contenido de otra organización salvo política explícita de compartición.

---

## 11. Requisitos para Context Assembly

Context Assembly debe:

* construir contexto usando únicamente datos autorizados;
* conservar referencias de procedencia, confianza y clasificación;
* evitar convertir contenido no confiable en autoridad;
* permitir que Policy Engine aumente controles cuando una solicitud derive de contenido no confiable;
* minimizar contenido sensible según políticas de acceso y retención;
* mantener referencias entre el contexto utilizado y las solicitudes derivadas cuando sea razonable.

Este RFC no afirma que la procedencia elimine por completo prompt injection.

---

## 12. Auditoría y observabilidad

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

Observability puede registrar métricas, trazas, rendimiento, degradaciones y consumo con retención y granularidad distintas de Audit.

---

## 13. Invariantes

1. Ninguna salida de modelo es autoridad por sí misma.
2. Ninguna extensión puede concederse permisos a sí misma.
3. Ningún canal valida por sí mismo identidad u organización.
4. Ningún workflow tiene un camino alternativo de ejecución.
5. Ninguna lectura de conocimiento evita tenancy y políticas de lectura.
6. Ninguna Action Request se ejecuta sin decisión de política válida.
7. Ninguna aprobación humana puede reutilizarse fuera de su alcance.
8. Toda operación relevante se trata como denegada hasta recibir una decisión explícita compatible.
9. Todo acceso y resultado debe conservar organization context o declararse como recurso de plataforma.

---

## 14. Consecuencias

Aceptar este RFC implica que futuros contratos de tools, knowledge sources, workflows, agents, channels, plugins y extensiones deben implementar o adaptarse a esta frontera gobernada.

Ninguna integración puede introducir una vía de acción o lectura que evite el contrato de ejecución gobernada.

Cualquier excepción requiere RFC explícito.

---

## 15. Preguntas abiertas

1. ¿Qué estructura exacta tendrá una Action Request y una Knowledge Request?
2. ¿Cómo se representarán formalmente procedencia, clasificación y confianza?
3. ¿Qué política de caducidad tendrán aprobaciones humanas?
4. ¿Cómo se modelarán operaciones parcialmente reversibles o compensables?
5. ¿Qué nivel de evidencia será obligatorio según tipo de acción?
6. ¿Qué mecanismos técnicos se usarán para propagar organization context entre módulos?
7. ¿Cómo se compondrán políticas de autorización, datos, límites y aprobación?
8. ¿Qué operaciones pueden ser automáticamente de bajo riesgo y bajo qué condiciones?

---

## 16. Referencias

* RFC-0000 — The Kern RFC Process
* RFC-0001 — Kern Manifesto
* RFC-0002 — Kern Logical Architecture

---

## 17. Historial de cambios

### 0.1 — 2026-06-27

Borrador inicial del contrato de ejecución gobernada de Kern.

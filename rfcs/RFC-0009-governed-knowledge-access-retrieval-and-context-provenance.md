# RFC-0009 — Governed Knowledge Access, Retrieval and Context Provenance

- **Estado:** Draft
- **Versión:** 0.1

## 1. Resumen ejecutivo

Define cómo Kern accede, recupera, transforma, selecciona y entrega información empresarial a un Turn, agente, workflow o capacidad.

Kern debe funcionar con fuentes heterogéneas por empresa. No presupone una aplicación, proveedor, formato ni mecanismo de almacenamiento concreto.

La información recuperada debe:

* pertenecer a una organización verificable;
* estar autorizada para la identidad y finalidad concretas;
* conservar procedencia, clasificación, taint y restricciones;
* poder explicarse y auditarse;
* no convertirse en autoridad por aparecer en el contexto de un modelo;
* no mezclarse entre organizaciones;
* reevaluarse si cambian permisos, política, fuente, clasificación, versión o restricciones.

## 2. Problema

Explica que una empresa puede usar sistemas distintos para facturación, CRM, correo, documentos, ERP, conocimiento interno o bases de datos.

El riesgo no depende de que una fuente sea Holded, Odoo, Gmail, SAP o un sistema propio. El riesgo aparece cuando Kern recupera datos sin saber de qué organización son, quién puede verlos, con qué finalidad se usan o qué restricciones conservan al ser resumidos, indexados, enviados a un modelo o usados como base de una acción.

## 3. Objetivos

Incluye:

* acceso gobernado a fuentes heterogéneas;
* recuperación bajo identidad, organización, finalidad y policy verificables;
* Context Assembly controlado;
* procedencia, clasificación, taint y restricciones preservadas;
* aislamiento multi-tenant;
* invalidación y reevaluación;
* uso seguro del contexto por modelos, agentes, workflows, Tools e Integrations;
* trazabilidad suficiente para explicar qué conocimiento fue usado.

## 4. No objetivos

Incluye:

* elegir ERP, CRM, correo, proveedor cloud o sistema documental;
* definir un conector concreto;
* elegir RAG, embeddings, vector database, OCR, chunking, ranking o indexación;
* imponer formatos de documentos;
* decidir UX de búsqueda o citas;
* sustituir RFC-0003 a RFC-0008.

## 5. Conceptos normativos

Define con precisión:

* `Knowledge Source`: sistema, repositorio, integración o dominio de datos que una organización autoriza a Kern a consultar. Puede ser software comercial, servicio cloud, API, base de datos, archivos, correo, sistema interno o cualquier otra fuente conectada.
* `Knowledge Resource`
* `Knowledge Access Request`
* `Knowledge Result`
* `Knowledge Context`
* `Context Assembly`
* `Provenance`
* `Classification`
* `Taint`
* `Restriction`
* `Derived Knowledge`
* `Knowledge Freshness`
* `Knowledge Snapshot`
* `Retrieval Scope`
* `Source Authority`
* `Context Consumer`
* `Knowledge Invalidation`

Incluye expresamente:

```md
El conocimiento recuperado no constituye autoridad, permiso, Decision Binding ni aprobación.

Que una información aparezca en el contexto de un modelo, agente, workflow, Tool o Integration no autoriza por sí mismo a leer recursos adicionales, ejecutar capacidades ni producir efectos externos.
```

## 6. Modelo de Knowledge Access

Establece que toda lectura parte de un `Knowledge Access Request` verificable y ligado al menos a:

* organización;
* identidad ejecutora;
* identidad delegada, cuando exista;
* Turn o ejecución correlacionada;
* fuente, recurso o clase de recurso solicitada;
* finalidad declarada;
* scopes y restricciones aplicables;
* policy y obligaciones relevantes;
* criterios de recuperación;
* límites de volumen, sensibilidad y destino;
* correlación y snapshot de ejecución aplicable.

Incluye:

```md
Una recuperación de conocimiento no puede asumir organización, identidad, scopes, finalidad, clasificación permitida ni destino de uso de forma implícita.

La falta, ambigüedad, conflicto o imposibilidad de verificar un atributo crítico debe producir deny para la lectura o reducir la recuperación a un resultado que no amplíe acceso.
```

## 7. Identidad, organización y autorización de lectura

Define que:

* todo acceso está sometido a RFC-0003, RFC-0004 y RFC-0005;
* la autorización se evalúa para la solicitud concreta, no porque un Turn ya exista;
* un canal, agente, workflow, Tool, Integration o Extension no puede declararse autorizado a leer por sí mismo;
* la delegación nunca amplía alcance;
* cambios de identidad, scopes, policy, consentimiento o clasificación invalidan recuperaciones relevantes;
* permisos de una fuente externa no sustituyen controles de Kern;
* datos recuperados usando credenciales amplias deben tratarse como mayor riesgo cuando corresponda.

## 8. Recuperación, selección y Context Assembly

Define que `Context Assembly`:

* selecciona información bajo control de Core;
* no otorga autoridad;
* conserva referencias de procedencia y restricciones de cada elemento;
* aplica límites de volumen, clasificación y relevancia;
* puede excluir resultados que no puedan atribuirse, clasificarse o verificarse;
* no mezcla resultados de organizaciones distintas;
* no oculta que un resumen o fragmento procede de una fuente restringida;
* distingue entre dato literal, dato resumido, inferencia y resultado generado por modelo.

Incluye:

```md
La recuperación no equivale a permiso de divulgación.

Un resultado puede ser accesible para una finalidad interna limitada y seguir estando restringido para ser mostrado, resumido, enviado a un modelo externo, incluido en telemetría o usado como entrada de una capacidad.
```

## 9. Procedencia, clasificación, taint y restricciones

Exige que cada `Knowledge Result` y elemento de `Knowledge Context` conserve, cuando aplique:

* organización;
* fuente;
* recurso;
* versión o identidad verificable de fuente;
* autor o sistema de origen cuando exista;
* timestamp de obtención;
* clasificación;
* procedencia;
* taint;
* restricciones de uso, destino, retención y transformación;
* política y decisión de acceso aplicables;
* correlación con Turn o ejecución;
* freshness relevante.

Incluye:

```md
Una transformación, resumen, extracción, chunking, indexación o combinación de conocimiento no puede reducir clasificación, taint, restricciones ni requisitos de autorización.

Cuando esos atributos no puedan conservarse o verificarse, el resultado derivado debe tratarse como no confiable, de mayor riesgo o no apto para el uso solicitado.
```

## 10. Transformación, resumen y datos derivados

Define que resumen, extracción, normalización, chunking, indexación, OCR, clasificación automática, inferencia o embedding producen `Derived Knowledge`.

Exige que:

* el dato derivado conserve procedencia y restricciones de sus fuentes;
* combinar fuentes conserve la restricción más estricta o falle cerrado si no se puede componer;
* una transformación no oculte origen ni elimine obligaciones;
* resultados generados por modelo se distingan de datos recuperados;
* un modelo no invente que una inferencia es un hecho contenido en una fuente;
* la salida pueda indicar incertidumbre, procedencia o límites cuando sea relevante.

## 11. Freshness, invalidación y cambios de fuente

Define que se deben invalidar o reevaluar resultados, contextos, cachés, índices, resúmenes o datos derivados cuando cambie de forma relevante:

* organización;
* identidad;
* scope;
* delegación;
* policy;
* consentimiento;
* clasificación;
* restricción;
* fuente;
* versión de recurso;
* eliminación o revocación de acceso;
* destino permitido;
* retención;
* configuración de integración;
* procedencia o taint;
* contexto de ejecución.

Incluye:

```md
Un resultado recuperado anteriormente no conserva autorización indefinida por haber sido leído una vez.

Antes de usar conocimiento en un efecto relevante, en un destino externo o en una reanudación asíncrona, Kern debe reevaluar la validez del contexto y las restricciones aplicables.
```

## 12. Contexto entregado a modelos, agentes y workflows

Establece que:

* entregar contexto a un modelo es un uso gobernado de datos;
* un modelo, agente o workflow es un `Context Consumer`, no una autoridad;
* el contexto se limita al mínimo necesario;
* Runtime distingue instrucciones, datos recuperados, datos no confiables, mensajes de usuario, memoria y resultados de herramientas;
* contenido recuperado no puede alterar reglas de seguridad, policy, identidad, scopes ni Decision Bindings;
* instrucciones dentro de documentos, correos, webs o adjuntos son contenido no confiable, nunca instrucciones de sistema;
* enviar contexto a un proveedor externo exige controles y autorización aplicables;
* memoria de agente no conserva conocimiento restringido fuera de sus reglas de retención y aislamiento.

## 13. Uso de conocimiento en capacidades y efectos gobernados

Define que:

* una Tool, Integration o Extension recibe solo conocimiento mínimo permitido;
* conocimiento recuperado no concede autorización para ejecutar un efecto;
* si conocimiento no confiable o de alto riesgo influye materialmente en una acción externa, se aplican restricciones y aprobaciones de RFC-0003, RFC-0005 y RFC-0007;
* Runtime puede vincular conocimiento material usado en una acción con correlación, Binding y evidencia correspondiente;
* una acción no puede alegar una fuente no accesible o no conservada como justificación suficiente.

## 14. Aislamiento multi-tenant, cachés e índices compartidos

Exige que:

* recursos, resultados, índices, embeddings, cachés, resúmenes, artefactos y trazas sean organization-scoped;
* cualquier recurso compartido formal demuestre aislamiento verificable por organización;
* no se reutilicen resultados, contexto, ranking, caché ni inferencias entre organizaciones;
* una fuente conectada por una organización no se convierta en fuente global;
* una Extension, proveedor, Tool o agente no pueda usar índice o caché de otra organización;
* fallos de aislamiento, clasificación o procedencia bloqueen la recuperación relevante.

## 15. Observabilidad, explicabilidad y auditoría

Exige evidencia suficiente para reconstruir:

* solicitud de conocimiento;
* organización e identidades;
* fuente y recursos consultados;
* criterios de recuperación;
* resultados seleccionados o excluidos;
* clasificación, taint y restricciones;
* transformaciones realizadas;
* contexto entregado;
* consumidor de contexto;
* destinos externos, cuando existan;
* invalidaciones y reevaluaciones;
* correlación con Turn, capability, Decision Binding y efecto cuando corresponda.

Aclara que telemetría, logs, trazas, prompts y diagnósticos son destinos de datos gobernados conforme a RFC-0006.

## 16. Dependencias con RFC-0002 a RFC-0008

Relaciona explícitamente:

* RFC-0002: Context Assembly y planos lógicos;
* RFC-0003: ejecución gobernada y procedencia;
* RFC-0004: organización, identidad, delegación y aislamiento;
* RFC-0005: policy, obligaciones, composición e invalidación;
* RFC-0006: capabilities, Extensions, telemetría y mediación;
* RFC-0007: Bindings, evidencia, efectos y resultados inciertos;
* RFC-0008: Turns, Execution Context, snapshots, reanudación y estados.

Incluye:

```md
RFC-0009 no crea una autoridad de datos ni una ruta de lectura alternativa.

Formaliza cómo Kern recupera y ensambla conocimiento bajo los controles ya definidos, conservando las propiedades necesarias para explicar, limitar y gobernar su uso posterior.
```

## 17. Invariantes

Incluye al menos:

1. Todo conocimiento recuperado pertenece a una organización verificable.
2. Todo acceso de conocimiento tiene identidad y finalidad verificables.
3. La recuperación no constituye permiso de divulgación ni autoridad de ejecución.
4. Un canal, agente, workflow, Tool, Integration o Extension no es autoridad final de lectura.
5. Conocimiento, cachés, índices y resultados no se comparten entre organizaciones.
6. Procedencia, clasificación, taint y restricciones no se reducen por transformación.
7. Contexto no verificable, ambiguo o sin procedencia suficiente falla cerrado para usos relevantes.
8. El contexto de un modelo no puede modificar identidad, policy, scopes, Decision Bindings ni reglas de Core.
9. Instrucciones dentro de conocimiento recuperado son contenido no confiable.
10. Datos derivados conservan restricciones al menos tan estrictas como sus fuentes.
11. Un resultado recuperado previamente no conserva autorización indefinida.
12. Un efecto relevante puede vincularse al conocimiento material usado cuando corresponda.
13. Telemetría, prompts, trazas y diagnósticos son destinos gobernados.
14. Una reanudación asíncrona debe reevaluar conocimiento y restricciones aplicables.
15. Ninguna lectura o Context Assembly abre una ruta alternativa de autoridad.

## 18. Consecuencias

Explica los beneficios y costes: más trazabilidad y seguridad, pero también más contexto que mantener, más invalidaciones, más decisiones explícitas y menor comodidad que una solución RAG sin controles.

## 19. Preguntas abiertas

Deja abiertas, sin decidir:

* estrategia concreta de indexación;
* formatos de documento;
* OCR;
* chunking;
* embeddings;
* ranking;
* retención concreta;
* gestión de borrado;
* interfaces de búsqueda;
* modelos de clasificación automática;
* mecanismos técnicos de provenance;
* UX para explicar fuentes y restricciones;
* implementación de cachés e invalidación.

## 20. Referencias

Incluye RFC-0002 a RFC-0008 como referencias internas.

## 21. Historial de cambios

Añade:

```md
### 0.1 — 2026-06-28

Borrador inicial. Define el contrato de acceso gobernado a conocimiento, recuperación, Context Assembly, procedencia, clasificación, datos derivados, aislamiento multi-tenant y uso seguro de contexto por agentes, modelos, workflows y capacidades.
```

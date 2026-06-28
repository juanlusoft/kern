# RFC-0009 — Governed Knowledge Access, Retrieval and Context Provenance

- **Estado:** Draft
- **Versión:** 0.2.1

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

* `Knowledge Source`: sistema, repositorio, integración o dominio de datos que una organización autoriza a Kern a consultar. Puede ser software comercial, servicio cloud, API, base de datos, archivos, correo, sistema interno o cualquier otra fuente conectada. La fuente puede aportar metadatos, pero no decide por sí sola el tratamiento final de seguridad dentro de Kern.
* `Knowledge Resource`: unidad identificable de información dentro de una fuente, con identidad o versión verificable cuando exista.
* `Knowledge Access Request`: solicitud concreta de lectura bajo organización, identidad, finalidad, alcance y restricciones verificables; no es una autorización por sí misma. La finalidad declarada debe corresponder a una finalidad gobernada y evaluable por policy. No puede ser texto libre autoafirmado por un canal, modelo, agente, workflow, Tool, Integration o Extension.
* `Knowledge Result`: resultado individual recuperado o derivado, con metadatos gobernados suficientes para decidir uso posterior.
* `Knowledge Context`: conjunto limitado de resultados preparado para un consumidor concreto; no es autoridad ni permiso.
* `Context Assembly`: proceso controlado por Core que selecciona y compone contexto sin ampliar acceso.
* `Provenance`: evidencia de origen, recurso, transformaciones, dependencias y correlaciones relevantes.
* `Classification`: sensibilidad y tratamiento requerido del conocimiento.
* `Taint`: señal de riesgo, origen no confiable, dependencia restringida o condición que debe propagarse a usos posteriores.
* `Restriction`: límite de lectura, divulgación, destino, retención, transformación, uso o efecto.
* `Derived Knowledge`: conocimiento producido a partir de una o más fuentes, incluyendo resumen, extracción, clasificación, indexación, embedding, inferencia o salida estructurada.
* `Knowledge Freshness`: vigencia y condiciones bajo las cuales un resultado puede seguir utilizándose.
* `Knowledge Snapshot`: representación durable y acotada del conocimiento material y sus metadatos para una ejecución o decisión concreta.
* `Retrieval Scope`: límite verificable de fuentes, recursos, criterios, volumen, clasificación, finalidad y destinos permitidos.
* `Source Authority`: autoridad de la fuente sobre la existencia, versión u origen de un recurso, que no sustituye la autorización de Kern para usarlo.
* `Context Consumer`: modelo, agente, workflow, Tool, Integration, Extension o componente que recibe conocimiento para una finalidad limitada; nunca autoridad final.
* `Knowledge Invalidation`: condición o proceso gobernado que vuelve no utilizable, exige reevaluar o restringe conocimiento y derivados previamente recuperados.

Incluye expresamente:

```md
El conocimiento recuperado no constituye autoridad, permiso, Decision Binding ni aprobación.

Que una información aparezca en el contexto de un modelo, agente, workflow, Tool o Integration no autoriza por sí mismo a leer recursos adicionales, ejecutar capacidades ni producir efectos externos.
```
## 6. Modelo de Knowledge Access

Establece que toda lectura parte de un `Knowledge Access Request` verificable y ligado al menos a:

* organizaci?n;
* identidad ejecutora;
* identidad delegada, cuando exista;
* Turn o ejecuci?n correlacionada;
* fuente, recurso o clase de recurso solicitada;
* finalidad declarada;
* scopes y restricciones aplicables;
* policy y obligaciones relevantes;
* criterios de recuperaci?n;
* l?mites de volumen, sensibilidad y destino;
* correlaci?n y snapshot de ejecuci?n aplicable.

La amplitud t?cnica de una credencial de una Knowledge Source nunca ampl?a el Retrieval Scope autorizado por Kern.

Todo resultado recuperado debe ser evaluado frente al Retrieval Scope autorizado del Knowledge Access Request antes de entrar en Context Assembly.

Un resultado fuera del Retrieval Scope autorizado constituye over-fetch, incluso cuando pertenezca a la misma organizaci?n, sea atribuible, est? correctamente clasificado o pueda verificarse t?cnicamente.

El over-fetch debe excluirse antes de Context Assembly. No puede retenerse, reutilizarse, indexarse, cachearse, incorporarse a memoria, ranking, dato derivado, telemetr?a, trazas, evidencia ni contexto de otro Turn.

Cuando Kern no pueda demostrar que un resultado est? dentro del Retrieval Scope autorizado, debe fallar cerrado para ese resultado.

La disponibilidad t?cnica o los permisos amplios de una fuente externa pueden limitar qu? datos puede obtener Kern, pero no ampl?an la finalidad, autorizaci?n, clasificaci?n permitida, destino ni restricciones decididas por Kern.

Incluye:

```md
Una recuperaci?n de conocimiento no puede asumir organizaci?n, identidad, scopes, finalidad, clasificaci?n permitida ni destino de uso de forma impl?cita.

La falta, ambig?edad, conflicto o imposibilidad de verificar un atributo cr?tico debe producir deny para la lectura o reducir la recuperaci?n a un resultado que no ampl?e acceso.
```

## 7. Identidad, organizaci?n y autorizaci?n de lectura

Define que:

* todo acceso est? sometido a RFC-0003, RFC-0004 y RFC-0005;
* la autorizaci?n se eval?a para la solicitud concreta, no porque un Turn ya exista;
* un canal, agente, workflow, Tool, Integration o Extension no puede declararse autorizado a leer por s? mismo;
* la delegaci?n nunca ampl?a alcance;
* cambios de identidad, scopes, policy, consentimiento o clasificaci?n invalidan recuperaciones relevantes;
* permisos de una fuente externa no sustituyen controles de Kern;
* datos recuperados usando credenciales amplias deben tratarse como mayor riesgo cuando corresponda.

## 8. Recuperaci?n, selecci?n y Context Assembly

Define que `Context Assembly`:

* selecciona informaci?n bajo control de Core;
* no otorga autoridad;
* conserva referencias de procedencia y restricciones de cada elemento;
* aplica l?mites de volumen, clasificaci?n y relevancia;
* debe excluir resultados que no puedan atribuirse, clasificarse, verificarse o demostrarse dentro del Retrieval Scope autorizado;
* no mezcla resultados de organizaciones distintas;
* no oculta que un resumen o fragmento procede de una fuente restringida;
* distingue entre dato literal, dato resumido, inferencia y resultado generado por modelo.

La recuperaci?n no equivale a permiso de divulgaci?n.

Un resultado puede ser accesible para una finalidad interna limitada y seguir estando restringido para ser mostrado, resumido, enviado a un modelo externo, incluido en telemetr?a o usado como entrada de una capacidad.

Los resultados excluidos se registran solo en la medida necesaria para auditor?a gobernada, sin convertir el contenido excluido en conocimiento reutilizable.

## 9. Procedencia, clasificaci?n, taint y restricciones

Exige que cada `Knowledge Result` y elemento de `Knowledge Context` conserve, cuando aplique:

* organizaci?n;
* fuente;
* recurso;
* versi?n o identidad verificable de fuente;
* autor o sistema de origen cuando exista;
* timestamp de obtenci?n;
* clasificaci?n;
* procedencia;
* taint;
* restricciones de uso, destino, retenci?n y transformaci?n;
* pol?tica y decisi?n de acceso aplicables;
* correlaci?n con Turn o ejecuci?n;
* freshness relevante.

Incluye:

```md
Una transformaci?n, resumen, extracci?n, chunking, indexaci?n o combinaci?n de conocimiento no puede reducir clasificaci?n, taint, restricciones ni requisitos de autorizaci?n.

Cuando esos atributos no puedan conservarse o verificarse, el resultado derivado debe tratarse como no confiable, de mayor riesgo o no apto para el uso solicitado.
```

La procedencia, clasificaci?n, taint y restricciones aplicables a un Knowledge Result o Knowledge Context deben ser establecidos, verificados, compuestos y preservados por Core o por un componente controlado por Core.

Una Knowledge Source, Tool, Integration o Extension puede aportar metadatos de origen, pero no es autoridad final para declarar, reducir, eliminar o reinterpretar procedencia, clasificaci?n, taint o restricciones dentro de Kern.

Core debe conservar la distinci?n entre metadatos declarados por una fuente y atributos de seguridad verificados o compuestos por Kern.

Una fuente, Tool, Integration o Extension no puede fijar de forma definitiva, reducir, borrar, relajar ni reinterpretar procedencia, clasificaci?n, taint, restricciones u obligaciones.

Cuando Core no pueda verificar, establecer, componer o preservar un atributo cr?tico, el resultado debe excluirse de Context Assembly o recibir un tratamiento que no ampl?e acceso, divulgaci?n ni efecto.

Ninguna transformaci?n, resumen, extracci?n, indexaci?n, embedding, combinaci?n o dato derivado puede rebajar clasificaci?n, taint, restricciones u obligaciones por el mero hecho de haberse transformado.

Este RFC no define una v?a general de desclasificaci?n, anonimizaci?n o rebaja de taint. Cualquier mecanismo futuro de ese tipo requerir? un contrato espec?fico, verificable y gobernado.

## 10. Transformaci?n, resumen y datos derivados

Define que resumen, extracci?n, normalizaci?n, chunking, indexaci?n, OCR, clasificaci?n autom?tica, inferencia o embedding producen `Derived Knowledge`.

Exige que:

* el dato derivado conserve procedencia y restricciones de sus fuentes;
* combinar fuentes conserve la restricci?n m?s estricta o falle cerrado si no se puede componer;
* una transformaci?n no oculte origen ni elimine obligaciones;
* resultados generados por modelo se distinguen de datos recuperados;
* un modelo no invente que una inferencia es un hecho contenido en una fuente;
* la salida pueda indicar incertidumbre, procedencia o l?mites cuando sea relevante.

La combinaci?n de resultados individualmente permitidos puede revelar una inferencia m?s sensible que cada elemento por separado.

Cuando la sensibilidad o restricci?n resultante no pueda componerse de forma verificable, Core debe aplicar una restricci?n m?s estricta, requerir reevaluaci?n o excluir el resultado derivado. La composici?n no puede usarse para eludir restricciones mediante agregaci?n.

## 11. Freshness, invalidaci?n y cambios de fuente

Define que se deben invalidar o reevaluar resultados, contextos, cach?s, ?ndices, res?menes o datos derivados cuando cambie de forma relevante:

* organizaci?n;
* identidad;
* scope;
* delegaci?n;
* policy;
* consentimiento;
* clasificaci?n;
* restricci?n;
* fuente;
* versi?n de recurso;
* eliminaci?n o revocaci?n de acceso;
* destino permitido;
* retenci?n;
* configuraci?n de integraci?n;
* procedencia o taint;
* contexto de ejecuci?n.

Incluye:

```md
Un resultado recuperado anteriormente no conserva autorizaci?n indefinida por haber sido le?do una vez.

Antes de usar conocimiento en un efecto relevante, en un destino externo o en una reanudaci?n as?ncrona, Kern debe reevaluar la validez del contexto y las restricciones aplicables.
```

La invalidaci?n por borrado, revocaci?n, reclasificaci?n o cambio material debe alcanzar resultados, cach?s, ?ndices, embeddings, res?menes, datos derivados y Knowledge Context a?n retenido para Turns diferidos o as?ncronos.

Mientras no se pueda demostrar que la reevaluaci?n aplicable se ha completado, ese conocimiento no puede reutilizarse para divulgaci?n, destino externo, reanudaci?n o efecto relevante.

## 12. Contexto entregado a modelos, agentes y workflows

Establece que:

* entregar contexto a un modelo es un uso gobernado de datos;
* un modelo, agente o workflow es un `Context Consumer`, no una autoridad;
* el contexto se limita al m?nimo necesario;
* Runtime distingue instrucciones, datos recuperados, datos no confiables, mensajes de usuario, memoria y resultados de herramientas;
* contenido recuperado no puede alterar reglas de seguridad, policy, identidad, scopes ni Decision Bindings;
* instrucciones dentro de documentos, correos, webs o adjuntos son contenido no confiable, nunca instrucciones de sistema;
* enviar contexto a un proveedor externo exige controles y autorizaci?n aplicables;
* memoria de agente no conserva conocimiento restringido fuera de sus reglas de retenci?n y aislamiento.

## 13. Uso de conocimiento en capacidades y efectos gobernados

Define que:

* una Tool, Integration o Extension recibe solo conocimiento m?nimo permitido;
* conocimiento recuperado no concede autorizaci?n para ejecutar un efecto;
* si conocimiento no confiable o de alto riesgo influye materialmente en una acci?n externa, se aplican restricciones y aprobaciones de RFC-0003, RFC-0005 y RFC-0007;
* cuando conocimiento recuperado o derivado justifique materialmente un efecto relevante, irreversible, externo o de alto impacto, Kern debe poder vincular el conocimiento material usado con el Turn, la decisi?n aplicable, el Decision Binding y la evidencia correspondiente;
* una acci?n no puede alegar una fuente no accesible o no conservada como justificaci?n suficiente.

## 14. Aislamiento multi-tenant, cach?s e ?ndices compartidos

Exige que:

* recursos, resultados, ?ndices, embeddings, cach?s, res?menes, artefactos y trazas sean organization-scoped;
* prompts, payloads de Context Assembly, memoria de agente y representaciones derivadas entregadas a un Context Consumer sean organization-scoped;
* cualquier recurso compartido formal demuestre aislamiento verificable por organizaci?n;
* no se reutilicen, entrenen, rankeen, cacheen ni influyan en otra organizaci?n;
* una fuente conectada por una organizaci?n no se convierta en fuente global;
* una Extension, proveedor, Tool o agente no pueda usar ?ndice o cach? de otra organizaci?n;
* fallos de aislamiento, clasificaci?n o procedencia bloqueen la recuperaci?n relevante.

Salvo mediante un mecanismo futuro expl?citamente gobernado y verificable que este RFC no define, esos activos no se reutilizan, entrenan, rankeen, cacheen ni influyen en otra organizaci?n.

## 15. Observabilidad, explicabilidad y auditor?a

Exige evidencia suficiente para reconstruir:

* solicitud de conocimiento;
* organizaci?n e identidades;
* fuente y recursos consultados;
* criterios de recuperaci?n;
* resultados seleccionados o excluidos;
* clasificaci?n, taint y restricciones;
* transformaciones realizadas;
* contexto entregado;
* consumidor de contexto;
* destinos externos, cuando existan;
* invalidaciones y reevaluaciones;
* correlaci?n con Turn, capability, Decision Binding y efecto cuando corresponda.

Aclara que telemetr?a, logs, trazas, prompts y diagn?sticos son destinos de datos gobernados conforme a RFC-0006.

## 16. Dependencias con RFC-0002 a RFC-0008

Relaciona expl?citamente:

* RFC-0002: Context Assembly y planos l?gicos;
* RFC-0003: ejecuci?n gobernada y procedencia;
* RFC-0004: organizaci?n, identidad, delegaci?n y aislamiento;
* RFC-0005: policy, obligaciones, composici?n e invalidaci?n;
* RFC-0006: capabilities, Extensions, telemetr?a y mediaci?n;
* RFC-0007: Bindings, evidencia, efectos y resultados inciertos;
* RFC-0008: Turns, Execution Context, snapshots, reanudaci?n y estados.

Incluye:

```md
RFC-0009 no crea una autoridad de datos ni una ruta de lectura alternativa.

Formaliza c?mo Kern recupera y ensambla conocimiento bajo los controles ya definidos, conservando las propiedades necesarias para explicar, limitar y gobernar su uso posterior.
```

## 17. Invariantes

Incluye al menos:

1. Todo conocimiento recuperado pertenece a una organizaci?n verificable.
2. Todo acceso de conocimiento tiene identidad y finalidad verificables.
3. La recuperaci?n no constituye permiso de divulgaci?n ni autoridad de ejecuci?n.
4. Un canal, agente, workflow, Tool, Integration o Extension no es autoridad final de lectura.
5. Conocimiento, cach?s, ?ndices y resultados no se comparten entre organizaciones.
6. Procedencia, clasificaci?n, taint y restricciones no se reducen por transformaci?n.
7. Contexto no verificable, ambiguo o sin procedencia suficiente falla cerrado para usos relevantes.
8. El contexto de un modelo no puede modificar identidad, policy, scopes, Decision Bindings ni reglas de Core.
9. Instrucciones dentro de conocimiento recuperado son contenido no confiable.
10. Datos derivados conservan restricciones al menos tan estrictas como sus fuentes.
11. Un resultado recuperado previamente no conserva autorizaci?n indefinida.
12. Para efectos relevantes, irreversibles, externos o de alto impacto, Kern debe poder vincular el conocimiento material usado con Turn, decisi?n, Decision Binding y evidencia correspondiente.
13. Telemetr?a, prompts, trazas y diagn?sticos son destinos gobernados.
14. Una reanudaci?n as?ncrona debe reevaluar conocimiento y restricciones aplicables.
15. Ninguna lectura o Context Assembly abre una ruta alternativa de autoridad.
16. La amplitud de una credencial externa nunca ampl?a el Retrieval Scope autorizado por Kern.
17. Todo over-fetch se excluye antes de Context Assembly y no se conserva ni reutiliza como conocimiento, cach?, ?ndice, memoria, telemetr?a, evidencia o contexto.
18. Core o un componente controlado por Core establece, verifica, compone y preserva procedencia, clasificaci?n, taint, restricciones y obligaciones relevantes.
19. Los metadatos aportados por una fuente, Tool, Integration o Extension son entrada sujeta a verificaci?n, nunca autoridad final para fijar o reducir atributos de seguridad.
20. Prompts, payloads de Context Assembly, memoria de agente y representaciones derivadas entregadas a Context Consumers mantienen aislamiento estricto por organizaci?n.
21. Un resultado no verificable, fuera de Retrieval Scope o con atributos cr?ticos no preservables falla cerrado para Context Assembly y usos posteriores.

## 18. Consecuencias

Explica los beneficios y costes: m?s trazabilidad y seguridad, pero tambi?n m?s contexto que mantener, m?s invalidaciones, m?s decisiones expl?citas y menor comodidad que una soluci?n RAG sin controles.

## 19. Preguntas abiertas

Deja abiertas, sin decidir:

* estrategia concreta de indexaci?n;
* formatos de documento;
* OCR;
* chunking;
* embeddings;
* ranking;
* retenci?n concreta;
* gesti?n de borrado;
* interfaces de b?squeda;
* modelos de clasificaci?n autom?tica;
* mecanismos t?cnicos de provenance;
* UX para explicar fuentes y restricciones;
* implementaci?n de cach?s e invalidaci?n.

## 20. Referencias

Incluye RFC-0002 a RFC-0008 como referencias internas.

## 21. Historial de cambios

### 0.2.1 — 2026-06-28

Corrección final previa al establecimiento del borrador. Define el ciclo de exclusión de over-fetch fuera del Retrieval Scope autorizado, establece explícitamente la frontera de verificación y composición de atributos de seguridad controlada por Core, y refuerza el aislamiento de prompts, payloads de contexto y memoria por organización.

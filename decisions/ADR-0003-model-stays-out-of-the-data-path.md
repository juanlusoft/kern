# ADR-0003 — Model Stays Out of the Data Path / Governed Model Integration

- **Estado:** Accepted
- **Fecha:** 2026-06-29
- **Decisor:** Juan Luis, con ChatGPT actuando como CTO/arquitecto
- **Contexto:** Kern Core v1 y modelo subordinado al runtime
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M5, M6

## 1. Contexto

Kern se ejecutará con un modelo local o privado.

Un ejemplo ilustrativo sería un modelo tipo Qwen3-VL sobre hardware on-prem expuesto como endpoint compatible con OpenAI, pero Qwen3-VL o cualquier modelo concreto es solo un ejemplo, no un requisito.

El modelo estará detrás del Turn Runtime, no por delante del gobierno de Kern.

Los modelos locales o abiertos pueden alucinar e inventar datos con más facilidad que modelos frontera. Incluso modelos frontera pueden equivocarse; por tanto, la arquitectura no debe confiar en el modelo como fuente de verdad.

M5 ya estableció que la respuesta final se construye solo a partir del resultado del runtime.

M6 ya estableció que todo dato leído de sistemas externos debe traer SourceEvidence.

Hace falta fijar explícitamente el papel permitido del modelo para evitar repetir los fallos del asistente actual.

## 2. Decisión

### 2.1 El modelo queda fuera del camino del dato

El modelo nunca produce, recuerda ni fabrica datos de negocio.

Ejemplos de datos de negocio:

- números
- precios
- importes
- ids
- registros
- fechas
- estados
- clientes
- presupuestos
- facturas
- totales
- IVA
- descuentos
- m²
- unidades

El modelo no es fuente de verdad para ninguno de esos datos.

### 2.2 Rol permitido del modelo

El rol del modelo se limita a:

1. interpretar la petición del usuario;
2. proponer o rellenar parámetros de una capability;
3. redactar la respuesta usando exclusivamente datos devueltos por el runtime.

El modelo puede ayudar a transformar lenguaje natural en intención o parámetros, pero no puede afirmar el resultado.

### 2.3 Datos de negocio solo desde runtime, tools y adaptadores

Todo dato de negocio debe provenir de:

- tools gobernadas
- capabilities gobernadas
- adaptadores gobernados
- operaciones deterministas gobernadas

Y debe estar respaldado por:

- SourceEvidence
- CapabilityInvocationResult tipado
- Evidence Ledger

Si el runtime no proporciona el dato, el modelo no puede inventarlo.

### 2.4 Respuesta final solo desde CapabilityInvocationResult

La respuesta final se compone solo a partir del resultado tipado del runtime.

Estados relevantes:

- executed
- not_found
- unavailable
- error
- denied
- blocked

Reglas:

- si el runtime devuelve `executed`, la respuesta puede usar solo el output del runtime;
- si devuelve `not_found`, la respuesta refleja no encontrado;
- si devuelve `unavailable`, la respuesta refleja no disponible;
- si devuelve `error`, la respuesta refleja error tipado;
- si devuelve `denied` o `blocked`, la respuesta refleja bloqueo o denegación;
- ninguno de esos estados puede completarse con datos inventados por el modelo.

### 2.5 Documentos e imágenes

El modelo tampoco es fuente autoritativa al leer documentos, PDFs o imágenes.

La extracción de datos de documentos debe venir de una capa gobernada y verificable, por ejemplo:

- capa de texto del PDF
- OCR estructurado
- parser determinista
- extracción tipada
- herramienta de visión gobernada con evidencia

El modelo puede interpretar lo ya extraído, pero la lectura libre del modelo, incluyendo modelos visuales o VL, no se toma como dato de negocio.

Si un PDF, imagen o documento contiene una factura, pedido, presupuesto o importe, el dato lo produce la extracción gobernada, no el modelo.

### 2.6 Cálculos de negocio

El modelo nunca hace cálculos sobre datos de negocio.

No puede recalcular:

- precios
- totales
- m²
- IVA
- descuentos
- conversiones de unidades
- portes
- márgenes
- cantidades

Toda aritmética de negocio la realiza una tool u operación gobernada y testeable.

El modelo solo redacta usando el resultado ya calculado.

### 2.7 Force routing permitido

El enrutado o forzado determinista de tools está permitido.

Documenta:

- force routing puede formar parte del paso “el modelo propone”;
- de hecho es recomendado al empezar con modelos locales o débiles;
- la elección de tool puede ser determinista;
- el input puede ser validado o corregido por reglas deterministas;
- lo que nunca cambia es que el dato lo trae la tool, el adaptador o el runtime, no el modelo.

### 2.8 Modelo subordinado al runtime

La regla central debe quedar explícita:

el modelo propone, el runtime dispone

El modelo se integra como componente subordinado detrás del Turn Runtime.

No tiene autoridad para:

- afirmar resultados;
- saltarse policy;
- saltarse bindings;
- saltarse approval;
- inventar outputs;
- inventar evidencias;
- recordar datos como si fueran verdad;
- completar datos faltantes;
- corregir el runtime.

## 3. Consecuencias

- Un modelo local modesto es aceptable porque la fiabilidad no depende de su honestidad sino del gobierno de Kern.
- Un modelo abierto o local puede ser útil para lenguaje natural, pero no para verdad de negocio.
- Se reduce el riesgo de alucinaciones con impacto operativo.
- Se impide repetir el fallo del asistente actual de inventar precios, facturas, presupuestos o estados.
- Se cierran explícitamente dos agujeros caros:
  - inventar el contenido de un documento;
  - equivocarse al recalcular importes.
- Habrá más trabajo en tools, parsers y calculadoras gobernadas, pero esa complejidad queda testeable y auditable.
- Las respuestas pueden ser menos “atrevidas”, pero más seguras.
- El sistema preferirá decir `not_found`, `unavailable` o `error` antes que inventar.
- La integración futura del modelo debe respetar M5 y M6.
- Los tests futuros deberán comprobar que campos afirmados por el modelo se ignoran si no vienen del runtime.
- Esta decisión refuerza:
  - M5: respuesta solo del runtime;
  - M6: SourceEvidence obligatoria;
  - RFC-0008: turn lifecycle;
  - RFC-0009: procedencia del conocimiento y del contexto;
  - RFC-0007: decision bindings y evidence.

## 4. Relation to Existing Milestones

M5 estableció workflows donde la respuesta final deriva del runtime.

M6 estableció lectura externa con SourceEvidence obligatoria.

ADR-0003 fija que el modelo nunca puede ocupar esas posiciones.

Las futuras milestones de model integration deberán insertarse detrás del Turn Runtime.

## 5. Relation to RFCs

- RFC-0008: Turn lifecycle; el modelo se integra dentro del turno gobernado.
- RFC-0009: conocimiento y contexto deben tener procedencia; el modelo no es procedencia válida para datos de negocio.
- RFC-0007: decision bindings y evidence; el modelo no sustituye bindings ni evidence.
- RFC-0006: capabilities y tools; el modelo puede proponer capabilities, pero no producir sus resultados.

## 6. Out of scope

Este ADR NO implementa:

- integración real de modelo;
- runtime de modelo;
- router de modelos;
- proveedor concreto;
- obligación de usar Qwen;
- obligación de usar endpoint compatible con OpenAI;
- visión o VL real;
- OCR real;
- parser de documentos real;
- calculadora de negocio real;
- prompts definitivos;
- política final de prompts;
- evaluación comparativa de modelos;
- guardrails de prompts como mecanismo principal de seguridad.

Este ADR solo fija:

- principio arquitectónico;
- límite de autoridad del modelo;
- posición del modelo detrás del runtime;
- prohibición de que el modelo sea fuente de datos;
- relación con tools, adaptadores y evidence.
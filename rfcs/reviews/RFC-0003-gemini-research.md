# Revisión externa de RFC-0003

- **RFC revisado:** RFC-0003 — Governed Execution Contract
- **Fuente:** Gemini
- **Fecha:** 2026-06-27
- **Estado:** Input de revisión; no representa una decisión de Kern

---
---
*Nota inicial: Este análisis técnico ha sido redactado por Gemini, modelo de inteligencia artificial de Google, actuando bajo el rol de Principal Security Architect.*

---

# Crítica de Seguridad: RFC-0003 — Governed Execution Contract

Como Principal Security Architect, mi evaluación del **RFC-0003** es que presenta una base conceptual sólida basada en *Zero Trust* y mediación forzada, pero **contiene vulnerabilidades lógicas severas en el ciclo de ejecución, el manejo de estado y la evaluación de políticas**. Si esta arquitectura se implementa tal como está descrita en un entorno real donde los agentes interactúan con ERPs, CRMs y correos electrónicos, resultará en escaladas de privilegios, *confused deputy attacks* y bypasses mediante *Indirect Prompt Injection*.

A continuación, presento la crítica estructurada y los cambios obligatorios.

---

## 1. Bypasses Posibles y Riesgos Estructurales

### A. Mutaciones encubiertas en el Knowledge Engine (Bypass de Action Request)

El RFC dice que el `Knowledge Engine` es para "lecturas". Sin embargo, en la práctica, muchas APIs de lectura tienen efectos secundarios (ej. un `GET` mal diseñado en un sistema heredado, o una consulta GraphQL de tipo `Query` que dispara un tracking o bloquea un registro). Si un agente enmascara una operación de mutación como un `Knowledge Request`, se saltará el `Tool Engine` y potencialmente la política de *Action Requests*.

### B. Confused Deputy Attack (Identidad vs. Tenancy)

El RFC exige "identidad solicitante" (Sec 5.1). Pero en un sistema de agentes, hay dos identidades operando simultáneamente: **La Identidad del Sistema/Agente** (quien ejecuta) y la **Identidad Delegada (On-Behalf-Of)** (el usuario humano que inició la sesión). Si la `Action Request` solo viaja con la identidad del Agente, una inyección de prompt puede forzar al Agente a borrar datos de otro usuario de la misma organización, ya que la política creerá que el Agente tiene permisos globales.

### C. Prompt Injection Indirecta y Fallos de Procedencia

El RFC menciona "procedencia y confianza" (Sec 5.5). La procedencia no sirve de nada si no se aplica **Taint Tracking** (rastreo de datos contaminados). Si un agente lee un correo (Knowledge Request = Untrusted) y luego usa esa información para generar un Action Request (ej. "reenviar este correo a X"), la política debe poder denegar la acción basándose en que el *payload* está manchado (tainted).

## 2. Ambigüedades en Políticas y Orden de Operaciones

### A. La vulnerabilidad de `transform`

El punto 7 indica que la política puede hacer un `transform`. Si una solicitud `A` es evaluada, se decide transformarla a `B`, y luego se ejecuta directamente `B`, **hemos roto el modelo de seguridad**. La transformación en sí misma podría ser maliciosa o alterar la semántica de la petición al punto de que `B` requeriría un `deny` o una aprobación humana, pero se aprueba automáticamente porque heredó la evaluación original.

### B. `defer` como vector de Denegación de Servicio (DoS) o Fail-Open

Si el Policy Engine devuelve `defer` ("no puede decidir", Sec 7), ¿qué hace el sistema? Si el sistema reintenta infinitamente, es un DoS. Si asume que "otro lo decidirá" y pasa al siguiente paso, es un *Fail-Open*. `defer` debe ser forzado a `deny` en la frontera de ejecución de forma determinista.

### C. TOCTOU en la Aprobación Humana (Time-Of-Check to Time-Of-Use)

La Sección 8 exige que la aprobación humana no se reutilice. Pero no protege contra que el *payload* de la petición cambie en memoria entre el momento en que el usuario hace clic en "Aprobar" y el `Tool Engine` ejecuta la acción. Un atacante (o un modelo alucinando en streaming) podría alterar el `Action Request` post-aprobación.

---

## 3. Cambios Concretos y Priorizados (Top 12)

A continuación, los cambios exigidos al RFC-0003 para mitigar estos riesgos.

| Prioridad | Sección RFC | Problema de Seguridad | Cambio Exigido (Texto / Comportamiento recomendado) |
| --- | --- | --- | --- |
| **1. CRÍTICO** | 7. Decisiones | Bypass por `transform` | **Añadir:** "Cualquier solicitud que reciba una decisión `transform` debe ser re-ingresada y re-evaluada obligatoriamente desde el paso 1 por el Policy Engine. Una petición transformada nunca pasa directamente a ejecución." |
| **2. CRÍTICO** | 8. Aprobación | Vulnerabilidad TOCTOU | **Añadir:** "Toda aprobación humana debe firmarse criptográficamente o asociarse inmutablemente al *hash* exacto del payload, alcance y contexto de la solicitud. Si el payload cambia un solo byte antes de la ejecución, la aprobación queda invalidada." |
| **3. CRÍTICO** | 5.1 Solicitud | *Confused Deputy* | **Modificar "identidad solicitante" por:** "Debe incluir explícitamente la **Identidad del Sistema (Ejecutor)** y la **Identidad Delegada (On-Behalf-Of)**. El Policy Engine evaluará la intersección de ambos permisos, aplicando el privilegio mínimo (Least Privilege)." |
| **4. CRÍTICO** | 7. Decisiones | `defer` = Riesgo Fail-Open | **Añadir:** "Una decisión `defer` no resuelta al final de la cadena de evaluación se convierte estrictamente en un `deny` temporal (Fail-Safe). Nunca se permitirá la ejecución por defecto." |
| **5. ALTO** | 6. Ciclo Ejecución | Aprobación Ciega | **Modificar Paso 6:** "Cuando aplique, la solicitud espera aprobación humana. El humano **debe visualizar el payload resultante post-transformación** y no la intención original del modelo, junto con su nivel de riesgo y datos involucrados." |
| **6. ALTO** | 11. Contexto | *Prompt Injection* | **Añadir Invariante de Taint Tracking:** "El Context Assembly debe propagar un marcador de contaminación (taint flag) si la solicitud se derivó de una lectura no confiable. Policy Engine debe usar este marcador para degradar automáticamente las acciones permitidas (ej. denegar mutaciones destructivas iniciadas por correos externos)." |
| **7. ALTO** | 5.3 Knowledge | Bypass de Action | **Añadir:** "Knowledge Engine debe garantizar, mediante configuración estricta (ej. read-only database roles, metadatos de API), que el endpoint consultado carece de efectos secundarios. Ante la duda, una consulta debe forzarse como Action Request." |
| **8. ALTO** | 7. Decisiones | Ambigüedad de `limit` | **Añadir:** "Cuando la decisión sea `limit`, Policy Engine debe inyectar los límites exactos (ej. `max_budget=$10`) directamente en el payload. Tool Engine es responsable estrictamente de abortar la ejecución si no soporta aplicar o medir dicho límite." |
| **9. MEDIO** | 12. Auditoría | Falsificación de Logs | **Añadir:** "La evidencia registrada debe incluir un *Hash* unidireccional del contenido sensible completo para garantizar no-repudio, almacenando en texto plano únicamente los metadatos de clasificación, identidad y decisión." |
| **10. MEDIO** | 8. Aprobación | Reutilización de Aprobaciones | **Añadir:** "Toda aprobación humana es de un solo uso (One-Time Use) y su token asociado debe revocarse o quemarse atómicamente en la base de datos tras el primer intento de ejecución en el Tool Engine, independientemente de si la acción tuvo éxito o falló." |
| **11. MEDIO** | 13. Invariantes | Bloqueo de Bypass de Interfaz | **Añadir Invariante:** "Ningún elemento del plano de experiencia (Experience Plane/Channels) puede renderizar o ejecutar acciones de estado locales sin emitir previamente un Action Request válido hacia el Orchestration Plane." |
| **12. BAJO** | 5.4 Acción Relevante | Ambigüedad de Clasificación | **Añadir:** "Se considerará acción relevante la lectura o transferencia de datos agrupados que superen un umbral definido por política (ej. exportación masiva), transicionando una operación de lectura pasiva (Knowledge Request) a una Action Request de extracción de datos." |

---

## Veredicto Final

**NECESITA REDISEÑO PARCIAL.**

El RFC establece una barrera lógica decente, pero fracasa en modelar la realidad asíncrona de los agentes de IA y la naturaleza mutable de las peticiones. Los conceptos de `transform` sin re-evaluación y la falta de mitigaciones contra *Time-of-Check to Time-of-Use* en las aprobaciones humanas son vulnerabilidades críticas de Nivel 0. Si se corrigen integrando los controles de identidad delegada (OBO), *taint tracking* estricto y re-evaluación de políticas, el contrato lógico será lo suficientemente robusto para pasar a una fase de diseño técnico (V0.2).
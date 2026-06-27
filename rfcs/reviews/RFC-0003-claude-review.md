# Revisión externa de RFC-0003

- **RFC revisado:** RFC-0003 — Governed Execution Contract
- **Fuente:** Claude
- **Fecha:** 2026-06-27
- **Estado:** Input de revisión; no representa una decisión de Kern

---
---
---
title: Revisión de seguridad — RFC-0003 Governed Execution Contract
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect
fecha: 2026-06-27
documento_revisado: RFC-0003 — Governed Execution Contract (v0.1)
veredicto: NECESITA REDISEÑO PARCIAL
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Es una revisión crítica, no una aprobación formal.

# Revisión de seguridad — RFC-0003 Governed Execution Contract

Es el más fuerte de la serie: los invariantes 1-8 son reales, separa lectura de acción, y es honesto al admitir que la procedencia no elimina prompt injection. Pero como **contrato de seguridad** que va a gobernar agentes tocando correo, facturas y CRM, hoy es **un contrato advisory, no enforceable**: describe el camino correcto pero no tiene los mecanismos que impiden salirse de él.

---

## 1. Bypasses posibles

- **El contrato gobierna la *solicitud*, no el *efecto*.** Una Action Request "modificar contacto X" se ejecuta vía una tool que sostiene una credencial amplia (API-key de CRM completa). Esa tool puede tocar el contacto Y porque la credencial lo permite. La sección 9 afirma "secretos y accesos mínimos" pero no hay mecanismo de confinamiento: el efector tiene más poder que la autorización. Es el bypass empresarial clásico — la política dice "enviar a X", la credencial SMTP puede enviar a cualquiera.
- **El requester rellena procedencia y confianza (5.1 línea 98, paso 1 del ciclo).** Un canal o plugin **no confiable** que genera la solicitud declara su propio "nivel de confianza". Un plugin malicioso marca contenido no confiable como confiable y todo el modelo de procedencia colapsa. La confianza la debe asignar la frontera, nunca el solicitante. **Crítico.**
- **No hay token de decisión infalsificable.** Tool Engine "ejecuta solo después de una decisión de política válida" (9) — pero ¿cómo *sabe* que la decisión es válida y no falsificada, replayed o para otra solicitud? El invariante 4 ("ningún camino alternativo") es una **política, no un mecanismo**. Sin una decisión criptográficamente ligada a esa solicitud exacta y verificada por el effector, todo el contrato es opcional para quien pueda dirigirse al Tool Engine directamente.
- **Acciones compuestas.** "Ejecutar una integración" (5.2 línea 117) es una sola Action Request que se abre en N efectos no gobernados individualmente. Bypass por agregación: una aprobación cubre cientos de sub-acciones.
- **Laundering lectura→acción.** Knowledge no ejecuta acciones (bien), pero su *output* alimenta Context Assembly → modelo → Action Request. Lees datos clasificados y luego los exfiltras vía "enviar email con [contenido clasificado]"; la política de la acción evalúa el permiso "enviar email" **sin saber que el payload contiene datos clasificados leídos hace un segundo**. No hay propagación de clasificación al payload de la acción.
- **La escotilla "recurso de plataforma" (invariante 9, línea 288).** "...o declararse como recurso de plataforma." ¿Quién lo declara? Es una salida sin límites del tenancy: un plugin que declara su recurso "platform-level" pierde el org context = cross-tenant. **Crítico.**
- **Observability como canal lateral (12).** Si registra contenido de request/response "con granularidad distinta" y menor control de acceso que Audit, se convierte en un almacén no gobernado de datos sensibles.

## 2. Ambigüedades de seguridad en los términos

- **`Action Request` vs `Knowledge Request` es semántica, no estructural.** "Transferir datos fuera de un límite organizativo" es acción (5.2), pero una Knowledge Request que devuelve datos cross-org a un agente **es** una divulgación. La dicotomía no captura "la lectura que es en sí misma una fuga".
- **"Procedencia"**: ¿origen inmediato o cadena completa? Si es inmediato, un solo salto confiable borra el taint. Debe ser transitiva. Indefinido.
- **"Confianza"**: ¿binaria o graduada? 5.5 sugiere binaria, pero la realidad necesita niveles (first-party / plugin aprobado / tercero) y, sobre todo, **quién la fija** (ver bypass arriba).
- **"Alcance"**: aparece en solicitud, aprobación y allow/limit, pero **nunca se define qué es un alcance** (¿conjunto de recursos? ¿campos? ¿tiempo?). Si el alcance es indefinido, el "no reutilizar fuera de su alcance" (8) es indecidible.
- **"transform"**: "antes de evaluarla **o** ejecutarla" (línea 182) — ¿antes o después de evaluar? Ambiguo y peligroso (ver punto 6). Y no dice si puede *ampliar* o solo *reducir*.
- **"limit"**: ¿cómo es un límite sobre una escritura (¿escritura parcial?) frente a un límite sobre una lectura (¿filtrado de resultados?)? Semántica indefinida.
- **"defer"**: "no puede decidir... requiere resolución adicional" — ¿quién resuelve? ¿default si no se resuelve? ¿timeout? Es el estado más peligroso (significa "no sé") y está sin especificar (punto 7).
- **"Acción relevante"** (5.4): mejor que en RFCs previos, pero "gasta presupuesto o capacidad **significativa**" reintroduce un umbral subjetivo por el que se escapan acciones sub-umbral.

## 3. Escalada cross-org, reuso de aprobaciones, confusión de identidad, fuga de contexto

- **Reuso de aprobación.** 8 liga la aprobación a "solicitud concreta" y "alcance aprobado", pero si el alcance es grueso ("aprobar envío de emails"), una aprobación cubre muchos envíos dentro de la ventana de validez. **Debe ligarse al hash del contenido exacto de la solicitud**, no al tipo de operación.
- **Aprobación de solicitud transformada.** Si transform ocurre tras la aprobación, el humano aprobó A y se ejecuta A'. La aprobación debe vincularse a la solicitud final post-transform. No se dice.
- **Confused deputy en el sistema externo.** El agente actúa por un usuario, pero la tool usa una cuenta de servicio. El ERP ve la cuenta de servicio → **sin atribución real en el sistema de registro** y los derechos amplios de la cuenta de servicio se vuelven el techo efectivo. El contrato verifica identidad interna de Kern, no on-behalf-of hacia el sistema externo.
- **Fuga de contexto multi-turno (TOCTOU).** Context Assembly autoriza datos en el momento de la *lectura* (11), pero un agente multi-turno acumula contexto: datos de org-A leídos en el turno 1 pueden filtrarse a una acción de alcance B en el turno 2. No hay re-evaluación de autorización en el *punto de uso*.

## 4. Orden de operaciones

El ciclo (sección 6) tiene fallos de orden:

- **Context Assembly (paso 3) antes que Policy (paso 4), pero "construye contexto usando únicamente datos autorizados" (11) — ¿autorizados por quién, si Policy aún no corrió?** Circularidad: necesitas política para autorizar el contexto, pero el contexto alimenta la política. Hay que separar la autorización de lectura por elemento de la ensambladura.
- **Audit (paso 8) ocurre DESPUÉS de la ejecución (paso 7).** Un fallo entre ejecutar y auditar **pierde el registro**, y un reintento **duplica el efecto** (doble envío de email). La auditoría de *intención* debe ser write-ahead (antes de ejecutar), con el resultado añadido después, y con idempotencia para acciones irreversibles. **Crítico para forense.**
- **Falta un paso de "binding" de decisión.** Entre la decisión (paso 5) y la ejecución (paso 7) nada liga la decisión a los bytes exactos ejecutados → TOCTOU: evaluada, mutada, ejecutada.

## 5. Prompt injection indirecta — ¿procedencia/confianza es contrato mínimo suficiente?

**No, no es suficiente.** El RFC es honesto (11 línea 254) pero la honestidad no es un control. Como contrato *mínimo* falla porque:

- La procedencia solo **permite** a Policy "aumentar controles" (11 línea 250) — es **opcional**, no obligatorio. No hay invariante: "toda acción relevante derivada de contenido no confiable, sin instrucción humana confiable, DEBE requerir aprobación o denegarse". Sin eso, la procedencia es decorativa: si la identidad del agente tiene permiso "enviar email", la inyección "envía a attacker@" pasa.
- Falta la **separación canal de instrucción / canal de datos.** El contrato autoriza por *permiso de identidad*, no por *intención confiable*. Un agente que lee una factura maliciosa puede ser dirigido a una acción permitida-pero-no-pretendida.
- Sin **límite de blast-radius por entrada no confiable**: un correo malicioso puede disparar muchas acciones.

Conclusión: procedencia + confianza es necesario pero el mínimo debe añadir **elevación obligatoria para acciones relevantes derivadas de contenido no confiable.**

## 6. transform: cambio semántico / saltar denegación

- **transform puede cambiar el significado.** No hay restricción de que sea *solo restrictivo*. Un transform que reescribe destinatario, importe o recurso es escalada, no control. **Invariante necesario: transform solo puede estrechar/redactar; nunca ampliar alcance, cambiar la identidad/destino objetivo ni cambiar la operación semántica.**
- **transform para saltar deny.** Si transform ocurre "antes de evaluarla" y puede re-disparar la evaluación, tienes un bucle de laundering: transform → re-evaluar → ahora permitido. **Deny debe ser terminal y evaluarse sobre la semántica original**; transform no puede provocar una re-evaluación que escape un deny.
- **Auditabilidad:** "auditable" pero sin requisito de registrar **ambas** formas (pre y post-transform). Necesario.

## 7. defer: fail-open, bloqueo infinito, decisión implícita

`defer` es el retorno más peligroso (significa "no sé"). Riesgos:
- **Fail-open:** si el ciclo trata "ausencia de deny" como proceder, defer → ejecución. El invariante 8 ayuda, pero **el RFC no declara explícitamente que defer es no ejecutable**. Hay que decir: defer nunca permite ejecutar; defer no resuelto = deny efectivo.
- **Bloqueo infinito / DoS:** defer sin resolver ni timeout = solicitudes atascadas. Necesita autoridad resolutora + timeout → deny.
- **Decisión implícita:** si defer enruta a un handler que auto-permite "bajo riesgo" (open Q#8), defer se vuelve un allow silencioso. Prohibirlo.
- **Sin auditoría:** un defer abandonado debe auditarse como operación denegada/abandonada.

## 8. Evidencia mínima que falta (sin almacenar datos sensibles)

La sección 12 registra "tipos" pero falta lo forense, y se puede hacer con **fingerprints, no contenido**:
- **Registro write-ahead de intención** antes de ejecutar (hoy es post-hoc).
- **Hash del payload** y **fingerprint del dato leído** — prueba "se envió *este* email exacto / se leyó *este* registro" sin guardar PII.
- **Cadena causal de procedencia** del contenido disparador (id de documento/correo + clasificación), no solo "referencias".
- **Inputs de decisión:** versión de política y atributos evaluados, para *reproducir* la decisión.
- **Hash de binding de la aprobación** (qué bytes exactos aprobó el humano).
- **Tamper-evidence:** auditoría append-only / hash-chain. Una auditoría editable no es evidencia. No se menciona.
- **Correlation id del sistema externo** (ERP/email) para forense cross-sistema, e **idempotency key**.
- **Intentos denegados, deferred y fallidos**, no solo ejecutados — los incidentes empiezan sondeando.

## 9. Qué debe ser invariante obligatorio y qué decisión futura

**Invariantes obligatorios YA (faltan o están como opcional):**
- Procedencia/confianza asignada por la frontera, **no por el requester**. (falta)
- Token de decisión infalsificable y ligado a la solicitud, verificado por el effector. (falta)
- transform solo estrecha; deny terminal sobre semántica original. (falta)
- defer nunca ejecuta; no resuelto = deny; defer auditado. (falta)
- Acción relevante derivada de no confiable → elevación **obligatoria**. (hoy opcional, 11)
- Aprobación ligada al hash de la solicitud final post-transform. (parcial, 8)
- Audit write-ahead + tamper-evident; idempotencia para irreversibles. (falta)
- Confinamiento least-privilege del effector. (afirmado sin mecanismo, 9)
- Propagación de clasificación de la lectura al payload de la acción. (falta)
- "Recurso de plataforma" requiere autoridad explícita, no auto-declaración. (falta — invariante 9 es un agujero)
- Mantener invariantes 1-8 actuales.

**Decisiones futuras razonables:**
- Composición/prioridad formal de políticas (ya diferido) — **pero la terminalidad del deny debe ser invariante ya**.
- Duración concreta de caducidad de aprobaciones (open Q#3) — pero "debe caducar" es invariante.
- Schema exacto (open Q#1), taxonomía de riesgo (open Q#8) — futuro, **pero "auto bajo riesgo" debe estar vetado por invariante para acciones cross-org o derivadas de no confiable**.
- Modelo de reversibilidad parcial (open Q#4) — futuro, pero "irreversibles requieren audit write-ahead durable" es invariante ya.

## 10. Cambios concretos (priorizados por severidad)

1. **(5.5 / 6 paso 1) Procedencia y confianza las asigna la frontera de confianza, nunca el solicitante.** Añadir invariante. Sin esto el modelo entero es auto-declarado. **CRÍTICO.**
2. **(9 / 13) Token de decisión de política infalsificable y ligado a la solicitud exacta; el effector debe rechazar toda solicitud sin decisión válida vinculada.** Convierte "ningún camino alternativo" de política en mecanismo. **CRÍTICO.**
3. **(7) Restringir transform a solo-estrechar:** prohibido ampliar alcance, cambiar destino/identidad o la operación; deny terminal sobre la solicitud original; transform no re-dispara evaluación que escape un deny. **CRÍTICO.**
4. **(7 / 6 paso 6) defer no ejecutable:** no resuelto = deny, con autoridad resolutora, timeout y auditoría obligatoria. **CRÍTICO.**
5. **(11 / 13) Elevación obligatoria (require_approval o deny) para acciones relevantes derivadas de contenido no confiable.** Convertir el "permitir que Policy aumente" en invariante duro. Es el control real de prompt injection. **CRÍTICO.**
6. **(6 / 12) Audit write-ahead de intención antes de ejecutar + auditoría tamper-evident (append-only/hash-chain) + idempotency key para irreversibles.** **CRÍTICO.**
7. **(8) Aprobación ligada al hash de la solicitud final post-transform**, no al tipo de operación; orden: aprobar tras transform, ejecutar exactamente lo aprobado. **ALTO.**
8. **(13 inv. 9) Contener la escotilla "recurso de plataforma":** declararlo requiere autoridad explícita del Control plane y queda auditado; el default es org-scoped. **ALTO.**
9. **(5.2/5.3/10) Propagación de clasificación:** la clasificación obtenida en una Knowledge Request viaja con cualquier Action Request derivada y es input de su evaluación. Cierra el laundering lectura→exfiltración. **ALTO.**
10. **(9) Confinamiento least-privilege del effector:** Tool Engine acota la credencial/efecto al alcance autorizado (credenciales por-solicitud o checks a nivel de efecto), y atribución on-behalf-of hacia el sistema externo. **ALTO.**
11. **(5.2) Acciones compuestas se descomponen en sub-solicitudes gobernadas** ("ejecutar integración" no puede ser una aprobación opaca de N efectos); límite de blast-radius por disparador no confiable. **ALTO.**
12. **(12) Definir la evidencia forense mínima como fingerprints, no contenido:** hash de payload, fingerprint del dato leído, cadena de procedencia, versión de política + inputs, hash de binding de aprobación, correlation id externo; incluir intentos denegados/deferred/fallidos. **MEDIO-ALTO.**
13. **(6 pasos 3 vs 4) Resolver el orden Context Assembly ↔ Policy:** autorización de lectura por elemento en la ensambladura y re-chequeo en el punto de uso (TOCTOU) para agentes multi-turno. **MEDIO.**
14. **(12) Prohibir que Observability almacene payloads sensibles** con menor control de acceso que Audit. **MEDIO.**
15. **(5.5 / 3) Definir "confianza" como graduada con un retículo mínimo fijo y "procedencia" como cadena transitiva** (no origen inmediato), para que un salto confiable no lave el taint. **MEDIO.**

## 11. Veredicto final

## `NECESITA REDISEÑO PARCIAL`

**Por qué no es `APTO PARA V0.2 CON CAMBIOS`:** los seis primeros cambios son CRÍTICOS y **cambian el modelo de enforcement, no la prosa**. Hoy la procedencia es auto-declarada (1), no hay decisión infalsificable que ligue política y ejecución (2) — así que "ningún camino alternativo" es un deseo, no un mecanismo —, `transform` puede escalar (3), `defer` puede quedar fail-open/colgado (4), la elevación frente a contenido no confiable es opcional (5) y la auditoría es post-hoc y editable (6). Para agentes que envían correo y mueven facturas, eso es explotable el primer día. No se arregla editando; hay que rehacer la capa de enforcement.

**Por qué no es `NO APTO`:** el marco conceptual es correcto y de los mejores de la serie — los invariantes 1-8, la separación lectura/acción, la honestidad sobre prompt injection y el ciclo gobernado son base sólida. Las correcciones son **invariantes aditivos sobre un esqueleto válido**, no un derribo.

**Lo que haría ya:** cambios 1-6 antes de aprobar. El cambio 2 (token de decisión infalsificable ligado a la solicitud) es el que sostiene todo lo demás: sin él, los otros invariantes son normas que nadie está obligado mecánicamente a respetar.

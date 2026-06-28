---
title: Revisión de seguridad — RFC-0008 Core Runtime, Turn Lifecycle and State Model v0.1
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (sistemas de agentes, control de ejecución, autorización distribuida, gestión de estado, cancelación, asincronía, aislamiento multi-tenant, efectos externos)
fecha: 2026-06-27
documento_revisado: RFC-0008 — Core Runtime, Turn Lifecycle and State Model (v0.1)
veredicto: APTO PARA V0.1 CON CAMBIOS
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.1 únicamente.

# Revisión de seguridad — RFC-0008 v0.1

Veredicto rápido: v0.1 **excepcionalmente sólido para un primer borrador** — el autor ha internalizado RFC-0002 a 0007 y es muy disciplinado en no crear autoridad nueva ("Un Turn no es una frontera de autorización", §6). **33 PASS, 2 PARTIAL, 0 FAIL.** Los dos PARTIAL convergen en un mismo punto: el **modelo de estados no integra de forma estanca el Unknown Outcome de RFC-0007**, permitiendo que un Turn alcance un veredicto terminal mientras el efecto externo sigue sin resolverse.

## Checklist

**1. Turn = unidad individual, no confundido con conversación/sesión/identidad/aprobación/Binding — `PASS`.** §5 + §6 ("Un Turn no es una conversación... sesión... identidad... aprobación... Decision Binding").

**2. Todo Turn exige organización e identidad ejecutora verificables antes de ejecutar — `PASS`.** §7 ("Antes de ejecutar... debe resolver y verificar organización, identidad ejecutora...") + fail-closed.

**3. Un canal no autoafirma organización/scopes/permisos/autoridad — `PASS`.** §7 + inv 4.

**4. Turn iniciado ≠ autorizado a leer/ejecutar — `PASS`.** §6 ("no obtiene autoridad propia por existir"; "no puede deducirse únicamente de que el Turn fue iniciado correctamente"). Excelente.

**5. Sin herencias silenciosas entre Turns — `PASS`.** §6 + inv 5 + §11.

**6. Contexto crítico ausente/no verificable/ambiguo falla cerrado — `PASS`.** §7 (ausente) + §11 (no verificable → no confiable). *Nit: "ambiguo/conflictivo" no se nombra explícitamente; cubierto por la postura general.*

**7. Distingue entrada/intención del modelo/solicitud de capacidad/autorización/ejecución/resultado observado — `PASS`.** §6 ("resultado generado, acción solicitada, acción autorizada, acción ejecutada y resultado observado") + entrada en §7.

**8. Los 12 estados definidos sin ambigüedad material — `PARTIAL`.** Defecto real: **§5 los llama "Pending Approval" y "Pending External Outcome"; §8 los llama "Waiting for Approval" y "Waiting for External Outcome".** Dos nombres para el mismo estado en el RFC cuyo trabajo es definir estados sin ambigüedad. Además, **no existe un estado de primera clase para el Unknown Outcome de RFC-0007 / reconciliación pendiente** (ver punto 12). Los demás estados se definen solo como celda de una línea en la tabla §8, no en §5.

**9. Estados terminales claros, sin salida silenciosa — `PASS`.** §8 ("no se puede salir silenciosamente de un estado terminal"; terminales con "Ninguna" transición).

**10. Denied/Failed/Cancelled/Expired/Completed con semánticas distintas — `PASS`.** §8 tabla + aclaraciones + inv 10.

**11. Turn cancelado no es prueba de que el efecto no ocurrió — `PASS`.** §8 + §10 + inv 9.

**12. Waiting for External Outcome conserva incertidumbre sin convertirla en éxito/fallo/reintento implícito — `PARTIAL`.** El *estado* preserva incertidumbre (§8 "preserva incertidumbre explícita") — bien. **Pero las *transiciones de salida* no están gateadas por evidencia de resultado de RFC-0007:** la tabla §8 permite `Waiting for External Outcome → Completed`, `→ Failed` y `→ Expired` **sin exigir Effect Outcome Evidence confirmada**. Eso permite **convertir un Unknown Outcome en un veredicto terminal sin confirmación**: un Turn podría marcarse `Completed`/`Failed`/`Expired` mientras RFC-0007 mantiene el resultado como incierto y pendiente de reconciliación. §10 dice "si el resultado es incierto, debe conservar estado explícito y evidencia", pero el modelo de estados lo contradice al permitir el salto a terminal. Es el hallazgo material del RFC.

**13. Una aprobación no reactiva ni amplía un Turn sin revalidación — `PASS`.** §8 ("una aprobación no reactiva un Turn sin revalidación aplicable") + inv 12.

**14. Ninguna transición elude Policy/Binding/Core enforcement — `PASS`.** §8 ("ningún estado habilita una ruta alternativa para saltarse policy, bindings o verificaciones") + inv 13.

**15. Un Turn síncrono no tiene vía de seguridad más débil que uno asíncrono — `PASS`.** §9 + inv 7 (todo efecto relevante pasa por RFC-0003-0007 sea cual sea el modo). *Nit: el RFC detalla las salvaguardas asíncronas (§9) pero trata la síncrona como "obviamente segura"; convendría afirmar explícitamente que los efectos síncronos usan los mismos gates de reserva/PoNR de RFC-0007 (sin fast-path interactivo).*

**16. Async/diferido no conserva autoridad por haber sido creado antes — `PASS`.** §9 + inv 8.

**17. Worker/callback/reanudación no autoafirma identidad/tenant/scopes/validez — `PASS`.** §9.

**18. Todo efecto tardío re-pasa las verificaciones de RFC-0007 — `PASS`.** §9 + inv 8.

**19. Cancelación/timeout/desconexión/cierre no continúan acción irreversible sin trazabilidad — `PASS`.** §10 ("no debe crear una vía para continuar sin control"; "la cancelación debe quedar correlacionada y auditable").

**20. Si se alcanzó el PoNR o el resultado es incierto, el Turn conserva evidencia y estado explícito — `PASS`** (por el texto de §10). *Nota: este PASS está en tensión con el PARTIAL del punto 12 — §10 manda preservar, pero la tabla §8 permite Expired/Completed; hay que reconciliar texto y máquina de estados.*

**21. Estado efímero/durable/snapshot/memoria de agente separados — `PASS`.** §5 + §11 ("la memoria... nunca debe confundirse con autoridad"; Runtime State "distinto de la memoria del modelo").

**22. Memoria/prompts/cachés/resultados/trazas/artefactos aislados por organización — `PASS`.** §11 + §15.

**23. Contexto heredado conserva procedencia/clasificación/restricciones — `PASS`.** §11 ("conserve procedencia y clasificación") + §6/§11 (no amplificar). *Nit: "taint" y obligaciones/restricciones de RFC-0005/0007 no se nombran junto a procedencia/clasificación; conviene explicitarlos.*

**24. No se reconstruye un Turn con estado que amplíe permisos/efecto — `PASS`.** §11.

**25. Tools/Integrations/Extensions no son autoridad final — `PASS`.** §12.

**26. El Runtime no convierte intención del modelo en efecto sin mediación de Core — `PASS`.** §12.

**27. Subefectos compuestos mantienen correlación y controles propios — `PASS`.** §12.

**28. Reintentos de entrega de canal/Turn/efecto se distinguen — `PASS`.** §13 ("distinguir reintento de entrega de canal, reintento de ejecución y reintento de efecto").

**29. Reintento de Turn no amplía org/identidad/capability/Integration/payload/destino/obligaciones/límites — `PASS`.** §13 + inv 12.

**30. Turn duplicado no autoriza efectos duplicados — `PASS`.** §13. *Nit: convendría ligar la idempotencia del Turn al material de idempotencia del Binding de RFC-0007 para que dos Turns duplicados en workers distintos no produzcan dos efectos.*

**31. Concurrencia entre organizaciones no comparte estado mutable ni datos — `PASS`.** §13 + §15 + inv 11.

**32. Telemetría/observabilidad/auditoría respetan RFC-0006 y correlación de RFC-0007 — `PASS`.** §14 (telemetría conforme a RFC-0006; correlación de Turn/bindings/efectos; no exponer datos cross-org). *Nota: hereda el PARTIAL no resuelto de RFC-0006 sobre telemetría como canal de exfiltración; las trazas a nivel de Turn son una superficie nueva que conviene reafirmar.*

**33. Límites y degradación segura ante agotamiento/timeout/pérdida de estado crítico — `PASS`.** §14 + §15 ("límites... observables, aplicables y fail-closed"). *Nit: definir qué hace "degradación segura" con efectos en vuelo (preservar estado durable + Unknown para efectos pasados del PoNR; solo denegar admisiones nuevas).*

**34. Coherente con RFC-0002-0007, sin autoridad nueva — `PASS`.** §16 ("no introduce una nueva autoridad ni una ruta alternativa"). Sin contradicción material; la única tensión interna es §8-tabla vs §10/RFC-0007 (punto 12).

**35. Tres riesgos residuales inevitables aun con implementación correcta:**
1. **Unknown Outcome permanente (heredado de RFC-0007).** Una fracción de Turns con efecto externo no confirmable no podrá alcanzar un terminal limpio sin reconciliación humana; el ciclo de vida hereda esa incertidumbre irreducible.
2. **Confused deputy / credencial amplia en el sistema externo** (heredado de RFC-0006/0007): el Turn gobierna el lado de Kern; el sistema externo ejecuta con derechos plenos de la cuenta de servicio.
3. **Liveness y agotamiento de recursos.** Turns en `Waiting for Approval` / `Waiting for External Outcome` / reconciliación pueden ocupar estado durable y recursos por tiempo indefinido (aprobación/reconciliación humana = espera no acotada). La degradación segura deniega trabajo nuevo, pero los Turns atascados se acumulan: residuo de operabilidad, no de seguridad.

## Correcciones concretas (priorizadas)

1. **(§8 tabla / §12) Gatear la salida de `Waiting for External Outcome`:** un Turn no puede transicionar a `Completed`/`Failed` sin Effect Outcome Evidence confirmada de RFC-0007; un Turn con resultado Unknown **no puede alcanzar `Completed` ni `Expired`**. **BLOQUEANTE** (punto 12).
2. **(§8/§5/§10) Añadir un estado de primera clase para el Unknown Outcome / reconciliación pendiente de RFC-0007** y enrutar allí los Turns con PoNR alcanzado y resultado incierto; prohibir `Expired` silencioso que descarte la obligación de reconciliación. **BLOQUEANTE** (reconcilia §10 con la tabla §8).
3. **(§5/§8) Resolver la colisión de nombres `Pending Approval`/`Pending External Outcome` (§5) vs `Waiting for Approval`/`Waiting for External Outcome` (§8):** un único nombre canónico por estado. **BLOQUEANTE** para un modelo de estados inequívoco (punto 8).
4. **(§5) Definir cada estado individualmente** (Received, Context Resolving, Ready, Running, Deferred, Completed, Denied, Cancelled, Failed, Expired), no solo como celda de tabla, para que el modelo sea normativamente inequívoco. **ALTO.**
5. **(§9/§15) Liveness/timeout + escalado** para Turns atascados en aprobación/resultado externo/reconciliación: espera acotada y escalado gobernado; evita ocupación indefinida de recursos (hereda el hueco de liveness de RFC-0007). **ALTO.**
6. **(§8) Guardas de transición de revalidación:** especificar qué transiciones (Deferred→Running, Waiting for Approval→Running, Waiting for External Outcome→Running) exigen re-verificación con estado autoritativo fresco de RFC-0007 antes de reanudar. **ALTO.**
7. **(§9/§12) Afirmar explícitamente que los efectos síncronos usan los mismos gates de reserva/PoNR/Binding de RFC-0007** — sin fast-path interactivo (punto 15). **MEDIO-ALTO.**
8. **(§5 Cancellation/§10) Definir la semántica de cancelación frente a la reserva de RFC-0007:** cancelar tras reserva pero antes del PoNR intenta cesión segura (solo si PoNR-no-alcanzado demostrable); tras el PoNR → Unknown. Cross-referenciar RFC-0007 §10. **MEDIO.**
9. **(§13) Ligar la idempotencia del Turn al material de idempotencia del Binding de RFC-0007**, para que Turns duplicados en workers distintos no produzcan efectos duplicados. **MEDIO.**
10. **(§11) El contexto heredado conserva también taint y obligaciones/restricciones de RFC-0005/0007,** no solo procedencia y clasificación. **MEDIO.**
11. **(§14) Reafirmar que las trazas/telemetría a nivel de Turn no son canal de exfiltración** ni cross-org (no solo diferir a RFC-0006; las trazas de Turn son superficie nueva). **MEDIO.**
12. **(§14/§15) Definir "degradación segura" para efectos en vuelo:** preservar estado durable + Unknown para efectos pasados del PoNR; solo denegar admisiones nuevas. **MEDIO.**
13. **(§7/§6) Fail-closed también ante contexto ambiguo o conflictivo,** no solo ausente (punto 6). **BAJO-MEDIO.**
14. **(§5/§11) El estado durable necesario para reanudar/reconciliar un Turn debe ser Core-produced/tamper-evident y aislado por organización** (atar a evidencia de RFC-0007 + aislamiento de RFC-0006). **BAJO-MEDIO.**
15. **(§8) Desambiguar fronteras `Deferred` vs `Waiting for Approval` vs `Waiting for External Outcome`** (hay solapamiento de transiciones). **BAJO.**

## Cambios bloqueantes antes de avanzar RFC-0008

- **Corrección 1** (gatear salida de Waiting for External Outcome por evidencia de resultado de RFC-0007).
- **Corrección 2** (estado de Unknown Outcome/reconciliación de primera clase; sin Expired silencioso que pierda la obligación).
- **Corrección 3** (colisión de nombres de estado).

Las dos primeras son las únicas con relevancia de **seguridad/corrección** (impiden que el Runtime declare éxito o caducidad sobre un efecto que realmente ocurrió o sigue sin resolver). La tercera es de inequivocidad del modelo. El resto (4-15) son endurecimientos para una v0.2.

## Veredicto

## `APTO PARA V0.1 CON CAMBIOS`

**Por qué APTO:** **33 PASS, 2 PARTIAL, 0 FAIL.** La estructura es correcta, coherente con RFC-0002-0007 y disciplinada en no crear autoridad nueva (§6/§16). Los dos PARTIAL (8 y 12) son **el mismo defecto visto dos veces**: el modelo de estados no integra de forma estanca el Unknown Outcome de RFC-0007, dejando que un Turn alcance un terminal (`Completed`/`Expired`) mientras el efecto externo sigue incierto — y una colisión de nombres de estado. Son **correcciones acotadas de la máquina de estados**, no rediseño.

**No es `NECESITA REDISEÑO PARCIAL`:** el esqueleto del Runtime, la resolución de contexto fail-closed, la separación de estado/memoria, el aislamiento multi-tenant y la deferencia a RFC-0003-0007 son correctos y completos; solo falta cerrar la integración del Unknown Outcome en los estados terminales.

**Lo que haría antes de avanzar:** correcciones 1-3. Con ellas, el ciclo de vida del Turn queda alineado con la garantía "segura por construcción" que RFC-0007 v0.2.1 ya estableció: ningún Turn puede declarar un resultado que el contrato de efectos no haya confirmado.

---

### Nota de la serie

RFC-0008 es la primera capa **por encima** del núcleo de seguridad (0003-0007) y demuestra que ese núcleo es usable: el Runtime coordina sin tocar la autoridad. El único riesgo nuevo que introduce es de **traducción** — mapear los estados de efecto de RFC-0007 (especialmente Unknown Outcome) a estados de Turn sin perder semántica. Cerrado eso (correcciones 1-2), los ocho RFCs forman una pila lógica coherente: proceso (0000), identidad/visión (0001/0004), arquitectura (0002), ejecución gobernada (0003/0005), extensiones (0006), binding verificable (0007) y runtime (0008). El trabajo restante es **implementación** (cripto del binding, almacén atómico de reservas/consumo con sweeper de liveness, sandboxing/attestation) y cerrar los dos RFCs que siguen en rediseño parcial (0002 y 0003).

---
title: Revisión de seguridad — RFC-0008 Core Runtime, Turn Lifecycle and State Model v0.2
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (sistemas de agentes, state machines distribuidas, autorización, cancelación, ejecución asíncrona, recovery, efectos externos inciertos)
fecha: 2026-06-27
documento_revisado: RFC-0008 — Core Runtime, Turn Lifecycle and State Model (v0.2)
veredicto: READY TO ESTABLISH RFC-0008 DRAFT
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2 únicamente.

# Revisión de seguridad — RFC-0008 v0.2

Veredicto rápido: v0.2 cierra los dos hallazgos bloqueantes de la revisión previa con un diseño limpio — **introduce `Waiting for Reconciliation`** como estado de primera clase para el Unknown Outcome de RFC-0007 y **prohíbe explícitamente cualquier terminal mientras un efecto siga incierto**. **35 PASS, 1 PARTIAL, 0 FAIL.** El único PARTIAL es un matiz de redacción (fail-closed ante contexto *ambiguo/conflictivo*, no solo ausente).

## Checklist

**1. Turn = unidad individual, no confundida — `PASS`.** §5/§6.
**2. Org + identidad ejecutora verificables antes de ejecutar — `PASS`.** §7 + fail-closed.
**3. Canal no autoafirma autoridad/tenant/scopes/permisos — `PASS`.** §7 + inv 4.
**4. Turn iniciado ≠ autoridad propia — `PASS`.** §6 ("no obtiene autoridad propia por existir").
**5. Sin herencia silenciosa entre Turns — `PASS`.** §6 + inv 5.
**6. Contexto ausente/ambiguo/conflictivo/no verificable falla cerrado — `PARTIAL`.** §7 falla cerrado ante "falte... atributo crítico" (ausente); §11 cubre "no verificable". **Pero "ambiguo" y "conflictivo" no se nombran explícitamente** — el punto pide los cuatro. Cubierto en espíritu por la postura fail-closed, no en letra. (Mi observación previa sobre esto no se incorporó.)
**7. Nombres de estado únicos y canónicos en todo el RFC — `PASS`.** §5 ya usa `Waiting for Approval`/`Waiting for External Outcome` (eliminada la colisión `Pending` de v0.1) + inv 16. Sin residuos de "Pending".
**8. Los 13 estados definidos de forma suficiente — `PASS`.** Los `Waiting*` y `Reconciliation` en §5 (ricos); el resto con significado claro en la tabla §8. *Nit: por consistencia convendría definir también Received/Context Resolving/Ready/Running/terminales en §5, no solo como celda.*
**9. Terminales sin salida silenciosa — `PASS`.** §8 + "terminales solo cuando no exista obligación pendiente de reconciliación".
**10. Denied/Failed/Cancelled/Expired/Completed distintos — `PASS`.** §8 + inv 10.
**11. Waiting for External Outcome = espera normal sin incertidumbre material declarada — `PASS`.** §5 ("la espera normal... antes de que exista incertidumbre material"). Coincide exactamente.
**12. Waiting for Reconciliation = Unknown Outcome de RFC-0007 — `PASS`.** §5 ("efecto... alcanzó o pudo alcanzar el Point of No Return y permanece en Unknown Outcome conforme a RFC-0007").
**13. No `Waiting for External Outcome → Completed/Failed/Expired` sin Effect Outcome Evidence — `PASS`.** §8 (regla explícita) + la tabla solo permite → Running, Waiting for Reconciliation, Cancelled. *Nit: la salida → Cancelled debería condicionarse explícitamente a "PoNR no alcanzado".*
**14. Unknown Outcome no llega a terminal por timeout/ausencia/desconexión/cancelación/policy — `PASS`.** §8 + §9 + §10 + inv 17/19 + "Waiting for Reconciliation no puede convertirse en éxito o fallo por política sin evidencia".
**15. Expired no borra/oculta/sustituye la obligación de reconciliación — `PASS`.** §8 ("no puede descartar, ocultar ni reemplazar un Unknown Outcome") + inv 19.
**16. Cancelled no prueba no-efecto ni elimina Waiting for Reconciliation/evidencia — `PASS`.** §8 + §10 + inv 9. *Nit: aclarar si un Turn con reconciliación pendiente puede ser Cancelled (terminal) o debe permanecer en Waiting for Reconciliation; hoy dice "conservar... o evidencia equivalente", levemente ambiguo.*
**17. Aprobación no reactiva ni amplía sin revalidación — `PASS`.** §8 + inv 21.
**18. Ninguna transición elude Policy/Binding/Core enforcement — `PASS`.** §8 + inv 13.
**19. Efectos síncronos = mismos gates que asíncronos — `PASS`.** §9 ("No existe una vía rápida interactiva que reduzca esos controles") + inv 20.
**20. Async/diferido/callback/reanudación no conserva autoridad por existir antes — `PASS`.** §9 + inv 8.
**21. Deferred/Waiting* requieren revalidación con estado autoritativo fresco antes de Running/efectos — `PASS`.** inv 21 + §9 ("revalidación conforme a RFC-0007", que hereda la frescura de RFC-0007 §8). *Nit: la palabra "fresco/autoritativo" no se ata explícitamente a la transición de reanudación a Running, solo al efecto.*
**22. Reconciliación/compensación requiere autorización aplicable, sin autoridad extra por el estado — `PASS`.** §12 ("El Turn no gana autoridad adicional por estar en Waiting for Reconciliation") + inv 18.
**23. Contexto heredado conserva procedencia/clasificación/taint/obligaciones/restricciones/correlación — `PASS`.** §11 (enumera los seis) + inv 22.
**24. No reconstrucción/reanudación que amplíe permisos/contexto/efectos — `PASS`.** §11.
**25. Tools/Integrations/Extensions no son autoridad final — `PASS`.** §12.
**26. Runtime no convierte intención del modelo en efecto sin mediación de Core — `PASS`.** §12.
**27. Efectos compuestos conservan correlación y controles individuales — `PASS`.** §12. *Nit: especificar que el Turn padre no puede Completar si un subefecto sigue en Unknown.*
**28. Turn duplicado no autoriza efectos duplicados — `PASS`.** §13 (+ defiere idempotencia de efecto a RFC-0007). *Nit: ligar explícitamente la idempotencia del Turn al material de idempotencia del Binding.*
**29. Se distinguen reintento de canal/Turn/efecto — `PASS`.** §13.
**30. Reintentos no amplían — `PASS`.** §13 + inv 12.
**31. Memoria/prompts/cachés/resultados/trazas/artefactos aislados por org — `PASS`.** §11 + §15.
**32. Telemetría/observabilidad sin canal lateral de exfiltración ni cross-tenant — `PASS`.** §14 ("no exponer contenido o metadatos de una organización a otra"; telemetría conforme a RFC-0006). *Dependencia: la mediación de telemetría intra-org sigue siendo el ítem no resuelto de RFC-0006; RFC-0008 lo defiere correctamente y añade la regla cross-tenant.*
**33. Agotamiento/pérdida de estado/caída → admisiones y efectos pendientes fallan seguros — `PASS`.** §14 ("denegar nuevas admisiones o efectos pendientes de forma segura") + §15.
**34. Si el PoNR fue o pudo ser alcanzado durante una caída, preserva evidencia durable y Unknown/Waiting for Reconciliation — `PASS`.** §14 + §15 + §10.
**35. Coherente con RFC-0002-0007, sin autoridad nueva — `PASS`.** §16 + inv. La máquina de estados ya alinea con RFC-0007 (Unknown → Waiting for Reconciliation); sin contradicción.

**36. Tres riesgos residuales inevitables aun con implementación correcta:**
1. **Unknown Outcome permanente.** Heredado de RFC-0007: una fracción de Turns quedará en `Waiting for Reconciliation` que solo cierra con resolución humana; algunos no alcanzan terminal limpio nunca.
2. **Confused deputy / credencial amplia en el sistema externo** (heredado de RFC-0006/0007): el Turn gobierna el lado de Kern; el sistema externo ejecuta con los derechos plenos de la cuenta de servicio.
3. **Liveness y acumulación de estado.** `Waiting for Reconciliation` y `Waiting for Approval` son no terminales y pueden persistir indefinidamente reteniendo estado durable; sin un sweeper/escalado acotado, los Turns atascados se acumulan. (Más el canal de exfiltración por telemetría intra-org heredado de RFC-0006.) Residuo de operabilidad, no de seguridad.

## Correcciones concretas (priorizadas)

1. **(§7/inv 15) Fail-closed explícito ante contexto ambiguo o conflictivo, no solo ausente o no verificable.** Cierra el único `PARTIAL` (punto 6). **Recomendado antes de establecer Draft.**
2. **(§8/§5 nuevo) Liveness/escalado acotado para `Waiting for Reconciliation` (y `Waiting for Approval`/`External Outcome`):** espera máxima → escalado a resolución humana gobernada; evita acumulación indefinida de Turns atascados con estado durable. **Recomendado** (punto 36).
3. **(§8 tabla) Condicionar `Waiting for External Outcome → Cancelled` a "PoNR no alcanzado";** si pudo alcanzarse, la única vía es `Waiting for Reconciliation` (alinear tabla con la prosa de §10). **MEDIO-ALTO.**
4. **(§8) Aclarar el modelo Cancelled-con-reconciliación-pendiente:** o se prohíbe `Cancelled` mientras haya reconciliación pendiente (el Turn permanece en `Waiting for Reconciliation`), o se define con precisión cómo un terminal `Cancelled` coexiste con la obligación preservada (punto 16). **MEDIO.**
5. **(§9/inv 21) Exigir estado autoritativo fresco en cada transición de reanudación a `Running`** (Deferred/Waiting* → Running), no solo antes del efecto (punto 21). **MEDIO.**
6. **(§13) Ligar la idempotencia del Turn al material de idempotencia del Binding de RFC-0007**, para que Turns duplicados en workers distintos no produzcan efectos duplicados antes del gate de efecto. **MEDIO.**
7. **(§10/§5 Cancellation) Cross-referenciar la semántica de reserva de RFC-0007 §10:** cancelar tras reserva pero antes del PoNR intenta cesión segura (solo con prueba de PoNR-no-alcanzado); tras el PoNR → `Waiting for Reconciliation`. **MEDIO.**
8. **(§14/§32) Reafirmar que las trazas/telemetría a nivel de Turn están sujetas a la mediación/clasificación de RFC-0006** (no solo a la no-exposición cross-tenant), para cerrar la superficie de exfiltración intra-org. **MEDIO.**
9. **(§5) Definir en §5 los estados restantes** (Received, Context Resolving, Ready, Running, Completed, Denied, Cancelled, Failed, Expired), no solo como celda de tabla. **BAJO-MEDIO.**
10. **(§11/§5) El estado durable de reanudación/reconciliación debe ser Core-produced/tamper-evident y aislado por org** (atar a evidencia de RFC-0007 + aislamiento de RFC-0006). **BAJO-MEDIO.**
11. **(§8) Guarda explícita: las transiciones a `Running` desde un estado de espera re-aseveran validez/no-revocación del Decision Binding por RFC-0007** (no solo "revalidación conforme a RFC-0007" genérica). **BAJO-MEDIO.**
12. **(§12) Para efectos compuestos con un subefecto en Unknown Outcome, el Turn padre no puede `Completed`** hasta resolver todos los subefectos o preservar cada Unknown como su propia reconciliación. **BAJO.**

## Cambios bloqueantes antes de establecer RFC-0008 como Draft

**Ninguno bloquea por seguridad.** Los 35 puntos de seguridad están en `PASS`; los dos hallazgos bloqueantes de la revisión previa (modelo de estados / integración del Unknown Outcome) están **resueltos** (`Waiting for Reconciliation` + reglas de §8/§9/§10 + inv 16-19). El único `PARTIAL` (fail-closed ante contexto ambiguo/conflictivo) es de redacción y no abre una ruta insegura: la postura fail-closed es pervasiva.

**Recomendados antes de establecer** (no bloqueantes): correcciones **1** (ambiguo/conflictivo fail-closed) y **2** (liveness/escalado de reconciliación). Aportan el mayor valor; el resto puede ir en una iteración posterior.

## Veredicto

## `READY TO ESTABLISH RFC-0008 DRAFT`

**Por qué:** **35 PASS, 1 PARTIAL, 0 FAIL.** v0.2 resuelve con un diseño limpio los dos bloqueantes previos: `Waiting for Reconciliation` da estado de primera clase al Unknown Outcome de RFC-0007 (§5), y un conjunto de reglas explícitas (§8 "no puede transicionar... sin Effect Outcome Evidence suficiente"; §9/§10 "ni timeout/cancelación/desconexión convierten Unknown en éxito/fallo/expiración"; inv 17-19) **impide que el Runtime declare un veredicto que el contrato de efectos no haya confirmado.** Eso era exactamente lo que faltaba para alinear el ciclo de vida del Turn con la garantía "segura por construcción" de RFC-0007 v0.2.1.

**No es `REQUIRES TARGETED CORRECTIONS`:** no queda ningún defecto de seguridad que corregir antes de establecer el Draft; el único `PARTIAL` es de redacción y las demás observaciones son endurecimientos.

**No es `NEEDS PARTIAL REDESIGN`:** la estructura es correcta, completa y coherente con RFC-0002-0007, y no introduce autoridad nueva.

**Lo que haría:** incorporar correcciones 1 y 2 en la misma iteración de establecimiento (mejoran redacción de seguridad y operabilidad) y dejar 3-12 para v0.3. RFC-0008 está listo para establecerse como Draft.

---

### Cierre de la pila

Con RFC-0008 v0.2 establecible, **la pila lógica de Kern queda completa y coherente de extremo a extremo**: proceso (0000), manifiesto/identidad (0001/0004), arquitectura (0002), ejecución gobernada y policy (0003/0005), extensiones (0006), binding verificable (0007) y runtime/ciclo de vida (0008). El Runtime no debilita ninguno de los controles inferiores y traduce fielmente el Unknown Outcome de RFC-0007 a un estado de Turn explícito.

El trabajo restante de Kern es ahora, casi por completo, **de implementación, no de diseño**: integridad criptográfica del Binding, almacén atómico de reservas/consumo con sweeper de liveness, sandboxing/attestation de RFC-0006, efectores controlados por Core, y la mediación de telemetría pendiente de RFC-0006. Los dos RFCs que seguían en rediseño parcial (0002 y 0003) son el único frente de diseño abierto; conviene revisarlos contra la pila ya estabilizada.

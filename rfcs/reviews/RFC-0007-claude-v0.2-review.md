---
title: Revisión de seguridad — RFC-0007 Decision Binding, Enforcement Evidence and Runtime Verification v0.2
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (authorization systems, transaction integrity, distributed systems, replay prevention, audit evidence, control de efectos externos)
fecha: 2026-06-27
documento_revisado: RFC-0007 — Decision Binding, Enforcement Evidence and Runtime Verification (v0.2)
veredicto: APTO PARA V0.2 CON CAMBIOS
nota: Evaluación independiente solo de v0.2.
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2 únicamente.

# Revisión de seguridad — RFC-0007 v0.2

Veredicto rápido: v0.2 **paga la deuda raíz** de la serie. Define integridad/autenticidad del Binding, verificación exclusiva por Core, reserva atómica previa al punto de no retorno, evidencia durable previa y posterior, Unknown Outcome, no-amplificación por reintento y fail-closed sobre estado autoritativo. Está a la altura correcta (exige las **propiedades** y difiere solo la **tecnología** en §15). Resultado: **25 PASS, 2 PARTIAL, 0 FAIL.**

## Checklist

**1. Prueba verificable de integridad/autenticidad bajo control de Core — `PASS`.** §5 "Binding Integrity and Authenticity": prueba emitida bajo control de Core; "una afirmación declarativa, un campo auto-reportado, un log de Extension o una respuesta no autenticada de Policy Engine no constituyen prueba suficiente."

**2. Alteración/fabricación/sustitución/reutilización detectables — `PASS`.** §5: el Verifier controlado por Core "debe detectar cualquier alteración, sustitución, fabricación o reutilización no autorizada."

**3. Binding liga los 18 elementos — `PASS`.** §6 enumera todos: org, ejecutora, delegada, delegación y restricciones, capability, implementation exacta, versión, artefacto inmutable, integration exacta, config org-scoped, payload canónico, recurso, tipo de efecto, destinos, scopes, snapshot de policy, obligaciones, aprobación, límites.

**4. No payloads con diferencia semántica / versión flotante / artefacto mutable / destino no ligado / integración genérica — `PASS`.** §6: coincidencia canónica exacta "incluyendo los elementos... que puedan alterar recurso, efecto, destino, cantidad, límite o semántica operativa" + prohibición explícita de Implementation genérica, versión flotante, artefacto mutable, Integration no ligada, destino no ligado, obligaciones no verificadas, payload distinto.

**5. Solo Core emite — `PASS`.** §7.

**6. Solo Core verifica como autoridad final, reserva, consume, deniega y emite evidencia — `PASS`.** §7: "Solo Core o un componente controlado por Core puede actuar como Binding Verifier final, validar integridad y autenticidad, comprobar su estado, reservarlo, consumirlo, decidir deny o registrar Enforcement Evidence."

**7. Tool/Integration/Extension/adapter/Publisher no validan su propio binding — `PASS`.** §7: "nunca puede verificar por sí misma un Binding como autoridad final ni decidir que sigue vigente."

**8. Verificación en tiempo de efecto comprueba integridad + vigencia/revocación/consumo/identidad/delegación/artefacto real/destino observado/obligaciones/límites/policy/precondiciones RFC-0006 — `PASS`.** §8 enumera 23 comprobaciones, incluyendo "artefacto realmente ejecutado" (11), "destinos observados y permitidos" (16) y "precondiciones de aislamiento, mediación y attestation heredadas de RFC-0006" (23).

**9. Timeout/partición/inconsistencia/ausencia de respuesta/incapacidad de frescura fallan cerrados — `PASS`.** §8: "constituyen incertidumbre de autoridad y deben resultar en deny" + inv.

**10. Reserva durable, exclusiva y atómica frente a concurrencia — `PASS`.** §5 Binding Reservation ("estado durable y atómico... derecho exclusivo... impedir que dos verificadores, workers o reintentos concurrentes ejecuten el mismo efecto") + §10 paso 2. (El primitivo concreto se difiere legítimamente en §15; la propiedad es normativa.)

**11. Reserva e Intent Evidence antes del Point of No Return — `PASS`.** §10 pasos 2-4: reserva → Intent Evidence durable → PoNR solo después.

**12. No confunde reserva/consumo/éxito/fallo — `PASS`.** §5 los define por separado; §10 los separa; §5 Outcome Evidence distingue completado/rechazado/fallido-antes-de-efecto/parcial/compensado/incierto; §10 "un Binding consumido sin evidencia de efecto no se presenta como éxito."

**13. PoNR definido y obliga a declarar su ubicación por tipo de efecto — `PASS`.** §5: "La ubicación lógica del Point of No Return debe declararse para cada tipo de efecto relevante."

**14. Unknown Outcome bloquea replay automático y éxito implícito — `PASS`.** §5: "no autoriza replay automático, nuevo intento implícito ni consumo silencioso como éxito."

**15. Binding Reconciliation no amplía alcance ni produce efectos sin nueva autorización — `PASS`.** §5: "no puede ampliar el alcance del Binding original ni emitir efectos adicionales sin autorización nueva."

**16. Reintento conserva atributos exactos y no amplía — `PASS`.** §10: conserva el mismo Binding y todos los atributos; "no puede aumentar cantidad, frecuencia, límites, alcance, destinos, scopes, delegación ni efectos."

**17. Idempotencia no es permiso genérico de replay — `PASS`.** §10 "idempotencia no equivale a autorización de replay" + idempotency key "ligada al Binding" (§6/§10).

**18. Efecto no idempotente sin control de duplicación o reconciliación segura bloquea reintento — `PASS`.** §10: "Kern debe denegar el reintento automático y requerir resolución gobernada."

**19. Compuestas con binding por subefecto o composición verificable con controles por subefecto — `PASS`.** §10: "Binding individual por subefecto o composición verificable que mantenga controles de consumo, destino, obligación y límite por subefecto."

**20. Asíncronas revalidan con estado fresco antes del efecto — `PASS`.** §9: "debe repetir la verificación de tiempo de efecto, obtener estado autoritativo fresco y crear o revalidar la reserva" + inv.

**21. Revocación/policy/credencial/integración/artefacto/lifecycle/aislamiento/mediación invalidan bindings — `PASS`.** §9 enumera ~24 disparadores incluyendo todos los citados.

**22. Evidencia previa y posterior durable, Core-produced, vinculable, no sustituible por logs de extensión — `PASS`.** §11: "emitida por Core... íntegra, autenticable, durable y vinculable al Binding, la reserva y el efecto observado. Los logs... de una Extension no sustituyen Enforcement Evidence."

**23. Evidencia posterior reconstruye el efecto observado (resultado externo/parcialidad/compensación/incertidumbre) — `PASS`.** §11 lista: resultado observado, confirmación/rechazo/timeout/incertidumbre, identificador externo, consumo final, estado parcial, compensación iniciada/completada/imposible, Unknown Outcome, resultado de reconciliación.

**24. Ausencia de Outcome Evidence tras PoNR no provoca repetición automática — `PASS`.** §11: "no autoriza considerar el efecto como inexistente ni repetirlo automáticamente."

**25. ¿Huecos de TOCTOU entre verificación, reserva y efecto? — `PARTIAL`.** El TOCTOU *evitable* (verify vs segundo worker/revocación) está cubierto por mandato: §10 "la verificación, reserva y transición hacia el Point of No Return deben impedir que una revocación, un segundo worker o un reintento concurrente produzcan un segundo efecto." **Pero no exige explícitamente que la *reserva* sea el paso atómico único que re-asevera revocación/frescura** (compare-and-swap que incluya "no revocado / no consumido / policy fresca"); hoy se manda el *resultado*, no el *mecanismo*, dejando que un diseño separe verify y reserve y pierda una revocación intermedia. El TOCTOU *irreducible* (reserva → efecto externo) está bien gestionado por PoNR/Unknown Outcome (correcto por diseño, no es defecto).

**26. ¿Huecos de partial failure (consumo sin efecto / efecto sin outcome durable / crash en reconciliación)? — `PARTIAL`.** Dos de tres bien cerrados: "consumo sin efecto no se presenta como éxito" y "efecto posiblemente producido sin evidencia final no se reintenta" (§10/§11). **El tercero —crash durante la reconciliación— no se aborda explícitamente:** la reconciliación (§5) no se exige idempotente/resumible/crash-safe, ni se garantiza que un crash a mitad deje un estado estable Unknown (nunca auto-éxito, nunca auto-replay). Está implícito por la estabilidad de Unknown Outcome, no normado.

**27. ¿Contradicciones o regresiones respecto a RFC-0003/0004/0005/0006? — `PASS`.** §12 alinea y no añade ruta de ejecución. v0.2 **restaura** destino/obligaciones/integration que la v0.1 había omitido (corrige la regresión previa). §8.23 hereda las precondiciones de RFC-0006; §9 alinea la invalidación; §7 usa "componente controlado por Core" coherente con RFC-0006. Sin contradicción.

**28. Tres riesgos residuales inevitables aun con RFC-0007 correcto:**
1. **Ventana atómica irreducible reserva → efecto externo.** Ningún protocolo hace de la reserva en Kern y el cambio de estado en el sistema externo una sola transacción atómica si el externo no ofrece 2PC. Por tanto, para una fracción de operaciones el Unknown Outcome es **permanente** y exige reconciliación humana/manual para siempre. RFC-0007 lo gestiona, no lo elimina.
2. **Confused deputy / credencial amplia en el sistema externo** (heredado de RFC-0006): el Binding gobierna el lado de Kern; el ERP ejecuta con los derechos plenos de la cuenta de servicio.
3. **Sistemas externos sin idempotencia ni outcome consultable.** Para APIs opacas/no idempotentes, RFC-0007 degrada correctamente a deny-de-reintento + reconciliación manual: una clase de operaciones reales o no se reintenta con seguridad o no puede determinar su resultado. Es un coste de operabilidad **inevitable**, no un defecto. (Y la duplicación del lado externo, fuera de la visibilidad de Kern, es indetectable.)

## Correcciones concretas (priorizadas)

1. **(§10/§5) Hacer explícito que la Binding Reservation es el paso atómico único que re-asevera revocación/frescura** (compare-and-swap que incluya no-revocado / no-consumido / policy fresca); la reserva, no el verify previo, es el gate de commit. **BLOQUEANTE** — cierra el único TOCTOU evitable (punto 25).
2. **(§5/§10) Exigir que la Binding Reconciliation sea idempotente, resumible y crash-safe:** un crash a mitad deja un Unknown Outcome estable (nunca auto-éxito, nunca auto-replay); la reconciliación no produce efecto sin nuevo Binding. **BLOQUEANTE** — cierra el partial failure de reconciliación (punto 26).
3. **(§11/§10) Definir semántica de durabilidad y orden:** Effect Intent Evidence debe estar comprometida de forma durable (write-ahead, recuperable tras fallo de proceso/host) **antes** del PoNR/intento de efecto; "durable" = sobrevive a crash, no en memoria. **BLOQUEANTE** — es la base de toda la garantía intent-antes-de-PoNR.
4. **(§5 PoNR) Para tipos de efecto cuyo PoNR no pueda acotarse/declararse** (sistema externo opaco), deny-by-default o controles reforzados; atar PoNR-no-declarable a la gestión de integración opaca de RFC-0006. **ALTO.**
5. **(§10 paso 5) Reafirmar que el intento de efecto externo lo realiza un efector/mediador controlado por Core** (per RFC-0006), de modo que reserva→consumo encuadren la llamada real y una Extension no pueda ejecutar fuera del bracket reservado. **ALTO** (no depender solo de la herencia).
6. **(§8/§9) Definir una cota de staleness para "estado autoritativo fresco"** (edad máxima / token de generación), para que "fresco" no sea interpretable entre verificadores distribuidos. **MEDIO.**
7. **(§5 Reservation) Semántica de lease/expiración para titulares caídos:** un worker que reserva y cae **antes** del PoNR debe poder ceder la reserva sin habilitar doble efecto; uno que cae **después** del PoNR resuelve a Unknown Outcome, no re-claim. **MEDIO.**
8. **(§10) En compuestas, registrar outcome por subefecto y disparar la compensación declarada por cada subefecto completado** al abortar a mitad. **MEDIO.**
9. **(§11) Vincular el correlation id externo a la reserva/idempotency key** para que la reconciliación pueda consultar el sistema externo de forma determinista. **MEDIO.**
10. **(§5 Unknown Outcome) Escalado/timeout:** un Unknown Outcome no reconciliable en una cota escala a resolución humana gobernada; nunca envejece silenciosamente a éxito o fallo. **MEDIO.**
11. **(§6) La representación canónica del payload y su canonicalización quedan protegidas por la prueba de integridad del Binding,** para que dos payloads semánticamente distintos no puedan canonicalizar al mismo valor. **MEDIO.**
12. **(§8) Precisar "destinos observados" en integraciones opacas:** donde el destino real no es observable, tratar como RFC-0006 de mayor riesgo/deny. **BAJO-MEDIO.**

## Cambios bloqueantes antes de aceptar

- **Corrección 1** (reserva = CAS atómico con revocación/frescura) — cierra el TOCTOU evitable (PARTIAL del punto 25).
- **Corrección 2** (reconciliación crash-safe e idempotente) — cierra el partial failure de reconciliación (PARTIAL del punto 26).
- **Corrección 3** (semántica de durabilidad write-ahead de la Intent Evidence) — sostiene la garantía intent-antes-de-PoNR.

Las correcciones 4-12 son endurecimientos no bloqueantes para una v0.2.1.

## Veredicto

## `APTO PARA V0.2 CON CAMBIOS`

**Por qué APTO:** sobre 27 puntos evaluables, **25 PASS y 2 PARTIAL, ningún FAIL**, y los dos PARTIAL son residuos de **explicitud de mecanismo** (reserva como CAS atómico; crash-safety de la reconciliación), no fallos estructurales. v0.2 cierra, con sección citable, todos los FAIL de la revisión previa: integridad/autenticidad del Binding (§5), verificación y evidencia exclusivas de Core (§7/§11), verificación completa en tiempo de efecto (§8), atomicidad consumo↔efecto vía reserva + PoNR + Intent Evidence (§5/§10), no-amplificación por reintento (§10), evidencia del efecto observado (§11) y fail-closed distribuido (§8). Está al **nivel de mecanismo**, no de afirmación — y §15 acota correctamente lo que se difiere (tecnología) frente a lo que no se difiere (las propiedades de seguridad).

**No es `NECESITA REDISEÑO PARCIAL`:** la estructura es correcta y completa; solo restan tres adiciones bloqueantes acotadas (1-3), de mecanismo, no de arquitectura.

**Lo que haría ya:** correcciones 1-3 antes de aceptar. Con ellas, RFC-0007 **salda la deuda raíz de toda la serie**: el Decision Binding deja de ser una afirmación y pasa a ser una autoridad íntegra, verificada por Core, reservada atómicamente y con evidencia durable del efecto.

---

### Cierre de la serie

Con RFC-0007 v0.2 (más las correcciones 1-3), la cadena RFC-0003 → 0007 pasa de **segura por contrato** a **segura por construcción**: existe por fin el mecanismo verificable del que dependían los condicionados de RFC-0004 y RFC-0005 y el "ready" de RFC-0006. §12 lo declara explícitamente ("mientras esas propiedades no puedan demostrarse... no pueden considerarse plenamente conformes"). El camino crítico restante ya no es de diseño de RFCs sino de **implementación**: el sustrato real de integridad criptográfica del Binding, el almacén atómico de reservas/consumo y el sandboxing/attestation de RFC-0006. Cuando esos existan e implementen, los siete RFCs son coherentes y construibles.

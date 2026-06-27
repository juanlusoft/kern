---
title: Revisión de seguridad — RFC-0007 Decision Binding, Enforcement Evidence and Runtime Verification v0.2.1
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (autorización distribuida, sistemas transaccionales, replay prevention, evidencia de enforcement, recuperación ante caída, efectos externos no reversibles)
fecha: 2026-06-27
documento_revisado: RFC-0007 — Decision Binding, Enforcement Evidence and Runtime Verification (v0.2.1)
veredicto: READY FOR ACCEPTANCE WITH MINOR CHANGES
nota: Evaluación independiente solo de v0.2.1.
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2.1 únicamente.

# Revisión de seguridad — RFC-0007 v0.2.1

Veredicto rápido: v0.2.1 cierra, con sección citable, los tres bloqueantes de la revisión previa (reserva como gate atómico de revalidación, reconciliación crash-safe, durabilidad recuperable de la Intent Evidence) y añade la ejecución del efecto exclusiva por Core, la cesión segura de reserva ante caída y la degradación a integración opaca. Resultado: **31 PASS, 1 PARTIAL, 0 FAIL.** El único residuo es de **liveness** (recuperación de reservas atascadas), no de seguridad.

## Checklist

**1. Integridad/autenticidad bajo control de Core — `PASS`.** §5 "Binding Integrity and Authenticity"; auto-reporte/log/respuesta no autenticada no bastan.

**2. Solo Core emite/verifica/reserva/consume/deniega/emite evidencia — `PASS`.** §7 + inv.

**3. Tool/Integration/Extension/adapter/Publisher no validan ni consumen su propio Binding — `PASS`.** §7 ("nunca puede verificar por sí misma... ni decidir que sigue vigente").

**4. Binding liga los 18 elementos exactos — `PASS`.** §6.

**5. Sin versión flotante/artefacto mutable/tenant implícito/Integration genérica/destino no ligado/variación semántica — `PASS`.** §6 (canónico "incluyendo... semántica operativa" + prohibición explícita).

**6. La reserva es el único gate de exclusividad — `PASS`.** §5 "La Binding Reservation es el único gate lógico" + inv 14.

**7. La creación de reserva revalida atómicamente integridad/revocación/expiración/consumo/policy/Implementation/Integration/artefacto/destinos/obligaciones/límites/frescura — `PASS`.** §5 lista completa "comprobar y fijar de forma atómica, frente a otros verificadores y workers concurrentes".

**8. Una verificación previa no reafirmada dentro de la reserva no autoriza el PoNR — `PASS`.** §5 ("no es suficiente para autorizar el Point of No Return") + inv. *Resuelve el bloqueante 1 de v0.2.*

**9. La reserva impide efectos duplicados por workers/reintentos/replays — `PASS`.** §5/§10.

**10. Intent Evidence durable y recuperable por Core antes del PoNR — `PASS`.** §5 + §10 paso 3.

**11. "Durable" excluye memoria/buffers no confirmados/logs de extensión — `PASS`.** §5 ("La persistencia únicamente en memoria, en buffers no confirmados o en logs auto-reportados... no satisface"). *Resuelve el bloqueante 3 de v0.2.*

**12. El efecto externo posterior a la reserva lo ejecuta solo Core o efector controlado por Core — `PASS`.** §8 + inv 20.

**13. PoNR definido y declarable por tipo de efecto — `PASS`.** §5.

**14. PoNR no declarable/acotable/verificable ⇒ degrada a integración opaca de RFC-0006 — `PASS`.** §5 ("quedar denegada por defecto... salvo excepción explícita de policy con controles reforzados") + inv 19. *(Nit editorial: el párrafo está colocado bajo el encabezado "Replay"; conviene reubicarlo.)*

**15. Unknown Outcome bloquea éxito implícito/replay automático/nuevo intento implícito — `PASS`.** §5.

**16. Caída antes del PoNR: ceder reserva solo si Core demuestra que el efecto no pudo producirse — `PASS`.** §10 + inv 16.

**17. Caída después del PoNR preserva Unknown Outcome hasta reconciliación gobernada — `PASS`.** §10 + inv 17.

**18. Reconciliation idempotente, resumible, resistente a caída — `PASS`.** §5 + inv 18. *Resuelve el bloqueante 2 de v0.2.*

**19. Crash durante reconciliación no deriva en éxito/fallo/replay/compensación/nuevo efecto — `PASS`.** §5 ("el estado debe permanecer estable como Unknown Outcome").

**20. Reconciliation no amplía alcance ni produce efecto/replay/compensación sin autorización — `PASS`.** §5.

**21. Reintento conserva exactamente Binding/org/identidades/delegación/payload/recurso/efecto/destinos/obligaciones/límites — `PASS`.** §10.

**22. Idempotencia ≠ permiso de replay — `PASS`.** §10 + inv.

**23. No idempotente sin defensa de duplicación o reconciliación segura bloquea reintento — `PASS`.** §10.

**24. Compuestos con controles por subefecto — `PASS`.** §10.

**25. Asíncronos repiten verificación, frescura y reserva antes del disparo — `PASS`.** §9.

**26. Cambios de identidad/policy/artefacto/Integration/lifecycle/credenciales/aislamiento/mediación invalidan — `PASS`.** §9 (~24 disparadores).

**27. Timeout/partición/inconsistencia/ausencia/incapacidad fallan cerrados — `PASS`.** §8 + inv.

**28. Evidencia previa y posterior durable, Core-produced, vinculable a Binding/reserva/efecto observado — `PASS`.** §11 (+ la definición RFC-wide de "durable" en §5 aplica a ambas).

**29. Ausencia de Outcome Evidence tras PoNR no habilita replay automático — `PASS`.** §11.

**30. ¿Quedan huecos materiales de TOCTOU / consumo sin efecto / efecto sin resultado durable / crash de reconciliación? — `PARTIAL`.** Los **cuatro nombrados están cerrados**: TOCTOU evitable lo cierra la reserva como gate atómico (§5/inv 14); consumo-sin-efecto no es éxito (§10); efecto-sin-resultado-durable → Unknown + no auto-repeat (§11); crash de reconciliación → Unknown estable (§5). **Pero queda un hueco material adyacente: liveness.** El RFC manda el *estado* tras una caída (Unknown + activar reconciliación) pero **no define el mecanismo de detección/timeout** que dispara la reconciliación cuando el titular de la reserva muere en silencio (reserva + intent evidence, sin outcome, sin nadie que lo note). Una operación puede quedar **atascada indefinidamente** (segura —nada auto-éxito/replay— pero parada). Es un residuo de disponibilidad/operabilidad, no de seguridad.

**31. ¿Contradicción material con RFC-0003 a 0006? — `PASS`.** §12 coherente; no añade ruta de ejecución; §8 hereda precondiciones de RFC-0006; §9 alinea invalidación; "componente controlado por Core" consistente. Sin contradicción. *(Solo el nit editorial del punto 14.)*

**32. Tres riesgos residuales inevitables aun con implementación correcta:**
1. **Ventana atómica irreducible reserva/PoNR → efecto externo.** Sin 2PC del sistema externo, una fracción de operaciones queda en **Unknown Outcome permanente** y exige reconciliación humana. Gestionado, no eliminado.
2. **Confused deputy / credencial amplia en el sistema externo** (heredado de RFC-0006): el Binding gobierna el lado de Kern; el ERP ejecuta con los derechos plenos de la cuenta de servicio.
3. **Duplicación/opacidad del lado externo.** Si el sistema externo duplica en silencio o no expone outcome consultable, Kern no puede detectarlo ni determinar la verdad; degrada con seguridad (deny-reintento + Unknown) a costa de **operabilidad**: una clase de operaciones reales no se automatiza y queda pendiente de resolución humana.

## Correcciones concretas (priorizadas)

1. **(§10/§5) Mecanismo de liveness/timeout:** un sweeper controlado por Core detecta reservas cuyo titular cayó (reserva + intent evidence, sin outcome, lease expirado) y dispara Binding Reconciliation de forma determinista; acotar el tiempo que una operación puede quedar en limbo antes de escalar. **Recomendado antes de aceptar** (operabilidad; punto 30).
2. **(§10 paso 6 / §11) Orden de la ruta de éxito:** la Outcome Evidence se compromete de forma durable **antes** de marcar el Binding como consumido-con-éxito, para que un crash entre efecto-éxito y consumo no pierda el registro de éxito (y evite reconciliación innecesaria). **Recomendado antes de aceptar.**
3. **(§5/§10) Idempotency key determinista:** la clave de idempotencia externa se deriva/fija desde el Binding, de modo que un reintento presente al sistema externo exactamente la misma clave (nunca dos claves para una misma operación lógica). **ALTO.**
4. **(§5) Semántica explícita de lease/expiración de reserva:** TTL del lease y reclaim seguro solo con prueba de PoNR-no-alcanzado; hoy existe la regla de caída pero no el primitivo de lease que implementa "ceder". **ALTO.**
5. **(§5 Unknown Outcome) Cota de escalado:** un Unknown Outcome no resuelto en una ventana definida escala a resolución humana gobernada; nunca se retiene en silencio para siempre. **MEDIO.**
6. **(§8/§5) Cota de staleness / token de generación para "frescura exigida por el riesgo",** para que "fresco" no sea interpretable entre verificadores distribuidos. **MEDIO.**
7. **(§5 editorial) Reubicar el párrafo de "PoNR no declarable → integración opaca"** fuera del encabezado "Replay" a la sección de PoNR o una propia; hoy está mal colocado y puede pasarse por alto. **MEDIO.**
8. **(§10/§11) Compuestos: Intent/Outcome Evidence por subefecto** y, al abortar a mitad, preservar Unknown/parcial por subefecto y disparar la compensación declarada por subefecto completado. **MEDIO.**
9. **(§11) Vincular el correlation id externo a la reserva/idempotency key** para que la reconciliación consulte el sistema externo de forma determinista. **MEDIO.**
10. **(§8/§13) Cross-referenciar que el efector "controlado por Core" cumple RFC-0006 §5.11** (no puede ser un mediador suministrado por la extensión). **BAJO-MEDIO.**
11. **(§9) Reafirmar la frescura fail-closed de las relecturas de la re-verificación asíncrona** (consistente con §8). **BAJO-MEDIO.**
12. **(§11) Declarar que la Outcome Evidence hereda la definición estricta de "durable" de §5** de forma explícita en la ruta posterior al efecto. **BAJO.**

## Cambios bloqueantes antes de aceptar

**Ninguno bloquea por seguridad:** los 31 puntos de seguridad están en `PASS`; el modelo es fail-closed y no hay ruta que produzca éxito implícito, replay o doble efecto.

**Recomendados antes de aceptar (no-seguridad):** corrección **1** (liveness/timeout de reservas atascadas) y corrección **2** (orden de durabilidad de la Outcome Evidence en la ruta de éxito). Cierran el único `PARTIAL` (operabilidad) y un caso de pérdida de registro de éxito. Las demás (3-12) son pulido para una v0.2.2.

## Veredicto

## `READY FOR ACCEPTANCE WITH MINOR CHANGES`

**Por qué:** **31 PASS, 1 PARTIAL, 0 FAIL**, y el único `PARTIAL` (punto 30) es un residuo de **liveness/operabilidad** —reservas que pueden quedar atascadas tras una caída silenciosa— no un fallo de seguridad: el estado permanece fail-closed (nada auto-éxito, auto-replay ni doble efecto). v0.2.1 cierra con sección citable los tres bloqueantes de la revisión anterior (reserva = gate atómico §5/inv 14; reconciliación crash-safe §5/inv 18; durabilidad recuperable de la Intent Evidence §5) y añade la ejecución del efecto exclusiva por Core (§8/inv 20), la cesión segura de reserva ante caída (§10/inv 16-17) y la degradación a integración opaca (§5/inv 19).

**No es `REQUIRES TARGETED CORRECTIONS`:** no queda ningún defecto de seguridad que corregir antes de aceptar; lo pendiente es operabilidad (liveness) y pulido.

**No es `NEEDS PARTIAL REDESIGN`:** la estructura es correcta, completa y coherente; solo restan adiciones menores.

**Lo que haría antes de aceptar:** correcciones 1 y 2 (no bloqueantes por seguridad, sí recomendables por operabilidad y por no perder registros de éxito). Con ellas, RFC-0007 está listo.

---

### Cierre de la serie

Con RFC-0007 v0.2.1, la cadena **RFC-0003 → 0007** queda **segura por construcción**, no solo por contrato: existe por fin el mecanismo verificable —Binding íntegro y autenticado, verificado y consumido solo por Core, reservado atómicamente, con evidencia durable previa y posterior y reconciliación crash-safe— del que dependían los condicionados de RFC-0004 y RFC-0005 y el "ready" de RFC-0006. §12 lo declara y ahora el texto lo sostiene.

El camino crítico restante es **de implementación, no de diseño**: integridad criptográfica real del Binding, almacén atómico de reservas/consumo con su sweeper de liveness, sandboxing/attestation de RFC-0006 y los efectores controlados por Core. El conjunto de siete RFCs es, a nivel lógico, coherente y construible.

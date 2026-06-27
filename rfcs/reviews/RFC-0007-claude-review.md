---
title: Revisión de seguridad — RFC-0007 Decision Binding, Enforcement Evidence and Runtime Verification v0.1
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (authorization systems, capability security, transaction integrity, replay prevention, distributed systems, audit evidence, ejecución de efectos externos)
fecha: 2026-06-27
documento_revisado: RFC-0007 — Decision Binding, Enforcement Evidence and Runtime Verification (v0.1)
veredicto: NECESITA REDISEÑO PARCIAL
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.1 únicamente.

# Revisión de seguridad — RFC-0007 v0.1

Contexto crítico: **este es el RFC que debía mecanizar el Decision Binding infalsificable** — la deuda raíz de RFC-0003 a 0006. El esqueleto conceptual es correcto (nombra Binding Subject, Freshness, Consumption, Effect-Time Verification, Replay, Authoritative State, Enforcement Evidence), pero es un **borrador delgado que enuncia intenciones y omite los mecanismos difíciles que son su única razón de ser**: nunca dice que el Binding sea **íntegro/autenticado** (solo "verificable"), no define la **atomicidad consumo↔efecto** ni el punto de no retorno, no cierra **TOCTOU** ni **partial failure**, y la evidencia no captura el **efecto observado**. Pensado para sistemas distribuidos con reintentos, colas y APIs no idempotentes, hoy no aguanta.

## Checklist

**1. Binding ligado a org/identidad/delegación/solicitud final/payload final/capability/implementation/versión/artefacto/integration/destino/obligación/policy — `PARTIAL`.** §6 liga solicitud, organización, identidades, scope, payload o huella, policy, expiración, revocación, consumo, procedencia, restricciones de implementación/capability, identidad de artefacto. **Faltan explícitamente: delegación, integration (config org-scoped), destino y obligaciones.** Es una **regresión frente a RFC-0006 §6.4**, que ya ligaba destinos, integration/config y obligaciones. Destino y obligaciones son lo más crítico para un efecto externo.

**2. No versiones flotantes / artefacto mutable / payload distinto / tenant implícito / identidad no verificable — `PASS`.** §6 último párrafo lo prohíbe los cinco. Nota: "payload **materialmente** distinto" es un umbral blando; debe ser coincidencia exacta de huella canónica.

**3. Solo Core o componente controlado por Core emite Binding — `PASS`.** §7 ("Solo el Core o un componente controlado por Core... Tool, Integration o Extension no pueden emitirse a sí mismos un Binding").

**4. Aprobación humana no es ejecutable sin Binding final — `PASS`.** §3 objetivo, §5 (Binding "no es... una aprobación humana"), §7 (emisión tras aprobación válida cuando aplique).

**5. Transformación restrictiva exige reevaluación y nuevo Binding del payload final — `PASS`.** §7 ("las transformaciones permitidas deben haber sido reevaluadas antes de emitir el Binding final") + §6 "payload final".

**6. Verificación en tiempo de efecto comprueba integridad/expiración/revocación/consumo/org/identidad/scope/delegación/artefacto/payload/destino/obligaciones/límites — `FAIL`.** §8 comprueba existencia/vigencia, revocación/expiración/consumo, org/identidades, scope/payload/capability/implementación, procedencia/correlación, frescura. **Faltan: integridad/autenticidad del propio Binding (¡la comprobación de infalsificabilidad!), delegación, destino, obligaciones y límites.** Una "verificación en tiempo de efecto" que **no verifica la integridad del Binding** ni las **obligaciones/destinos/límites** es incompleta justo en lo que importa. Es el fallo central del RFC.

**7. Verificación usa estado autoritativo fresco cuando revocación/lifecycle/policy puedan haber cambiado — `PARTIAL`.** §8 pide "estado maestro... fresco", pero §5 Authoritative State cubre org/identidad/revocación/delegación/consumo y **no policy ni lifecycle/artefacto**; no define cota de frescura (staleness) ni condiciona explícitamente a "cuando policy/lifecycle puedan haber cambiado".

**8. Indisponibilidad/incertidumbre/timeout/inconsistencia de la fuente de autoridad falla cerrada — `PARTIAL`.** §9/§13 ("cualquier duda... fallo cerrado / deny") cubre la incertidumbre, pero **no nombra timeout, partición ni inconsistencia** — los modos de fallo distribuidos exactos del contexto hostil. "Duda" es vago para un sistema distribuido.

**9. Una Tool/Integration/Extension no puede verificar por sí misma un Binding como autoridad final — `FAIL`.** §7 les prohíbe **emitir**, pero el RFC **nunca exige que el Binding Verifier sea Core/controlado por Core**. §5 define "Binding Verifier" sin atarlo a Core, y §8 asigna la verificación a "**el ejecutor**" — que podría ser la extensión. RFC-0006 decía que la verificación es del Core; aquí no se reafirma. Hueco crítico.

**10. Se evita replay y doble consumo con concurrencia — `PARTIAL`.** §10 enuncia el objetivo ("solo el primero puede consumirlo... los posteriores fallan cerrado") pero **no especifica el mecanismo atómico** (compare-and-swap/lease sobre el estado de consumo). Enuncia la meta, no el primitivo; en distribuido, dos workers leen "no consumido" y ambos siguen.

**11. Consumo suficientemente atómico respecto al punto de no retorno — `FAIL`.** Es el problema distribuido más difícil y **no se aborda**. No se define el orden consumo↔efecto: consumir-antes (riesgo: consumido pero el efecto falló → operación perdida) vs efecto-antes (riesgo: efecto hecho, crash antes de consumir → replay re-ejecuta). Para APIs externas no idempotentes es EL problema y no hay outbox/intent transaccional.

**12. Idempotencia no permite reutilización/replay no autorizado — `PARTIAL`.** §10 exige idempotencia para reintentables, pero **no liga la clave de idempotencia al Binding** ni impide su reutilización para replay.

**13. Los reintentos no amplían alcance/efecto/destino/límites/cantidad — `FAIL`.** **No se aborda.** Nada exige que un reintento reutilice el mismo scope/destino/cantidad/límites ni prohíbe amplificar (reintentar una transferencia no debe duplicarla). Riesgo central de API no idempotente, ausente.

**14. Subefectos compuestos con bindings individuales o composición verificable — `PARTIAL`.** §5 menciona "lote gobernado concreto" pero **no define** cómo un Binding de lote gobierna cada subefecto (consumo y checks de destino/límite por subefecto). Es un gesto, no un contrato. RFC-0006 §8 sí lo tenía.

**15. Efectos asíncronos revalidan antes de ejecutar y no sobreviven por haber sido emitidos antes — `PARTIAL`.** §9 (expira por invalidación) y §5 (Freshness) lo implican, pero **no exige explícitamente la re-verificación pre-disparo por Core con estado fresco** que RFC-0006 §8 sí mandaba. Un binding emitido-pero-no-disparado no debería tener autoridad en pie; no se dice.

**16. Revocación/cambio de artefacto/cambio de integración/cambio de política/pérdida de precondiciones invalidan bindings — `PARTIAL`.** §9 usa el cajón de sastre "invalidación del contexto de referencia"; **no enumera** los disparadores, así que el enforcement es ambiguo. RFC-0006 los enumeraba.

**17. Evidencia producida por Core, no sustituible por logs auto-reportados de una Extension — `FAIL`.** §11 lista el contenido de la evidencia pero **nunca dice quién la produce** ni que sea Core-generada y **tamper-evident**. Para el RFC *de evidencia*, no especificar que la evidencia es del Core y no falsificable por la extensión es una omisión nuclear.

**18. La evidencia reconstruye el efecto observado, no solo la intención — `FAIL`.** §11 captura binding-id, huella de payload, solicitud, org/identidades, decisión, tiempos, resultado de checks, consumo/rechazo, correlación. **Todo es intención + verificación; no hay campo para el efecto externo realizado** (correlation/transaction id externo, resultado, estado parcial/compensado). §14 dice que marca el punto donde la autorización "se convierte en efecto", pero la evidencia no registra ese efecto.

**19. ¿Huecos de TOCTOU entre verificar, consumir y producir el efecto? — `FAIL` (sí, hay huecos).** §8 verifica con estado fresco, pero **nada re-comprueba entre la verificación y el efecto**, ni hace atómicos verify+consume+effect. Revocación que ocurre tras el verify y antes del efecto no se detecta. Hueco TOCTOU material, sin tratar.

**20. ¿Huecos de partial failure / efecto completado pero evidencia no persistida / consumo marcado sin efecto? — `FAIL` (sí, hay huecos).** **No se aborda.** §11 tiene "estado de consumo" pero ningún tratamiento de: efecto hecho y fallo al escribir evidencia; consumo marcado y efecto no producido; efecto producido y consumo no persistido. Es el corazón de la integridad transaccional distribuida y está ausente.

**21. ¿Contradicción/ambigüedad material con RFC-0003 a 0006? — `PARTIAL` (ambigüedad, no contradicción dura).** §12 no añade ruta de ejecución (bien). Pero **es más débil que RFC-0006**: omite destino/obligaciones/integration del bind (RFC-0006 §6.4 los ligaba) y asigna la verificación a "el ejecutor" (RFC-0006 decía Core). Eso crea **ambigüedad material** sobre si obligaciones/destinos quedan ligados y sobre quién verifica.

**22. Riesgos residuales inevitables aun con un Binding correcto:**
1. **APIs externas no idempotentes / no transaccionales.** Si el sistema externo no ofrece clave de idempotencia ni outbox, la atomicidad consumo↔efecto es irresoluble: un crash entre efecto y consumo o **duplica** (reintento) o **pierde** la operación. Un Binding correcto no arregla un sistema externo no transaccional.
2. **Confused deputy / credencial amplia en el sistema externo** (heredado de RFC-0006): el Binding restringe el lado de Kern; el ERP sigue ejecutando con los derechos plenos de la cuenta de servicio.
3. **Frescura vs disponibilidad (CAP).** Verificar revocación perfectamente fresca en cada efecto exige lectura síncrona del estado maestro; bajo partición hay que elegir deny (perder disponibilidad). Un Binding correcto no escapa a CAP: o frescura o disponibilidad, no ambas.

## Cambios concretos (priorizados)

1. **(§5/§6/§8) Especificar que el Binding es íntegro y autenticable (infalsificable):** porta una prueba de integridad/autenticidad generada por Core y el verificador la comprueba **antes que nada**. Es la razón de ser del RFC y hoy "verificable" no equivale a "íntegro/autenticado". **BLOQUEANTE.**
2. **(§6/§8) Añadir al bind y a la verificación: delegación, integration (config org-scoped), destino(s), obligaciones y límites.** Cierra la regresión frente a RFC-0006 §6.4. **BLOQUEANTE.**
3. **(§5/§8) Atar el Binding Verifier a Core/componente controlado por Core;** definir "el ejecutor" como enforcement point controlado por Core; una Tool/Integration/Extension nunca es el verificador final. **BLOQUEANTE.**
4. **(§10/§11 nuevo) Definir la atomicidad consumo↔efecto y el punto de no retorno:** patrón outbox / intent transaccional — registro durable de consumo+intención **antes** del efecto, clave de idempotencia externa **derivada del Binding**, reconciliación posterior; especificar qué pasa si el efecto tiene éxito pero falla la escritura de consumo/evidencia y viceversa. **BLOQUEANTE.**
5. **(§8 nuevo) Cerrar TOCTOU:** el paso de consumo re-asevera atómicamente frescura (compare-and-swap sobre estado de consumo+revocación) en el momento del consumo, no solo en el verify; verify+consume+effect quedan ligados. **BLOQUEANTE.**
6. **(§11) La evidencia es Core-producida y tamper-evident; los logs auto-reportados de una Extension no la sustituyen;** declarar integridad/no-repudio de la evidencia. **BLOQUEANTE.**
7. **(§13 nuevo) Invariante de no-amplificación por reintento:** un reintento reutiliza el mismo Binding, misma clave de idempotencia, mismo scope/destino/cantidad/límites; nunca incrementa cantidad/límites ni cambia destino; efectos no idempotentes sin primitiva externa de idempotencia = deny-by-default. **BLOQUEANTE.**
8. **(§11) La evidencia captura el efecto externo observado** (correlation/transaction id externo, resultado, estado parcial/compensado), no solo intención+verificación; alinear con write-ahead + outcome-append de RFC-0003. **ALTO.**
9. **(§7/§8) Definir "estado autoritativo fresco" con cota de staleness** y exigir lectura fresca de revocación **y** versión de policy **y** lifecycle/artefacto cuando puedan haber cambiado; nombrar timeout/partición/inconsistencia como condiciones de fail-closed. **ALTO.**
10. **(§5/§10) Definir el mecanismo atómico de consumo único** (compare-and-swap / lease), no solo "solo el primero"; comportamiento ante crash de worker a mitad de consumo (expiración de lease / re-claim idempotente). **ALTO.**
11. **(§6/§5) Sustituir "payload materialmente distinto" por coincidencia exacta de huella canónica;** definir la canonicalización para que "material" no sea explotable. **MEDIO-ALTO.**
12. **(§5/§6 nuevo) Bindings compuestos:** definir cómo un Binding de lote gobierna cada subefecto (consumo + checks de destino/límite por subefecto) o exige composición atómica verificable. **MEDIO.**
13. **(§8/§9) Re-verificación pre-disparo de asíncronos por Core con estado fresco;** un binding emitido-pero-no-disparado no tiene autoridad en pie. **MEDIO.**
14. **(§9) Enumerar los disparadores de invalidación** (revocación, cambio de artefacto, cambio de integración, cambio de versión de policy, pérdida de precondiciones de RFC-0006) en vez del cajón de sastre. **MEDIO.**
15. **(§12) Declarar la dependencia de conformidad:** este RFC solo entrega sus garantías si existen el mecanismo de integridad/autenticidad (cambio 1) y el verificador controlado por Core (cambio 3); hasta entonces, las garantías dependientes de binding de RFC-0003 a 0006 siguen siendo advisory. **MEDIO.**

## Cambios bloqueantes antes de aceptar

**1, 2, 3, 4, 5, 6, 7.** Sin ellos el RFC no cumple su función:
- **1** (integridad/infalsificabilidad) — es literalmente la razón de existir del documento y hoy no está.
- **3** (verificador = Core) y **6** (evidencia = Core) — sin ellos la verificación y la evidencia son auto-policiadas por código no confiable.
- **2** (ligar destino/obligaciones/límites/delegación/integration) — sin ellos el Binding autoriza menos de lo que RFC-0005/0006 exigen comprobar.
- **4, 5, 7** (atomicidad consumo↔efecto, TOCTOU, no-amplificación por reintento) — sin ellos, en distribuido con APIs no idempotentes, el sistema duplica o pierde efectos y permite replay.

Los cambios 8-15 son endurecimientos importantes pero no bloqueantes para una v0.2.

## Veredicto

## `NECESITA REDISEÑO PARCIAL`

**Por qué no es `APTO PARA V0.1 CON CAMBIOS`:** sobre los 20 puntos verificables, **6 son `FAIL` y 8 `PARTIAL`**, y los `FAIL` caen justo en los mecanismos que son la razón de ser del RFC — integridad/infalsificabilidad del Binding (6), verificación en tiempo de efecto completa (6), verificador atado a Core (9), atomicidad consumo↔efecto (11), no-amplificación por reintento (13), evidencia Core-producida (17), evidencia del efecto observado (18), TOCTOU (19) y partial failure (20). No es "ajustar y añadir invariantes": falta **el núcleo mecánico** (integridad, consumo atómico vs punto de no retorno, TOCTOU, outbox/partial-failure, evidencia del efecto). Eso es rediseño de la sustancia de las secciones difíciles.

**Por qué no es `NO APTO`:** el esqueleto conceptual y la nomenclatura son correctos y coherentes con la serie (Binding Subject, Freshness, Consumption, Effect-Time Verification, Replay, Authoritative State, Enforcement Evidence). No hay que tirarlo; hay que **rellenarlo con los mecanismos duros**. Las intenciones (fail-closed, single-consumption, sin efecto sin Binding) son las correctas.

**Lo que haría ya:** cambios 1-7 antes de cualquier aceptación. El cambio 1 es el que cierra la deuda raíz de toda la serie: **mientras el Binding no sea íntegro/autenticado y verificado por Core, los condicionados de RFC-0004/0005 y el "ready" de RFC-0006 siguen siendo advisory.** Este RFC es el lugar donde esa deuda se paga o no se paga; v0.1 todavía no la paga.

---

### Nota de cierre de la serie

RFC-0007 era el documento destinado a saldar la deuda raíz que arrastran RFC-0004 (`apto condicionado`), RFC-0005 (`apto condicionado`) y RFC-0006 (`ready con cambios`): **el Decision Binding infalsificable, verificado por Core, con consumo atómico y evidencia del efecto.** v0.1 nombra correctamente el problema pero aún no lo resuelve. Hasta que RFC-0007 alcance algo equivalente a lo que RFC-0006 logró en su v0.2.1 —mecanismo, no afirmación—, **la cadena entera sigue siendo segura *por contrato* pero no *por construcción*.** El camino crítico de Kern pasa por esta v0.2 de RFC-0007.

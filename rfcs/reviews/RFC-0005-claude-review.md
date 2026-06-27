---
title: Revisión de seguridad — RFC-0005 Policy Evaluation and Decision Model
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (policy engines, autorización distribuida, multi-tenancy, enforcement points, seguridad de agentes, control de acceso fail-closed)
fecha: 2026-06-27
documento_revisado: RFC-0005 — Policy Evaluation and Decision Model (v0.1)
veredicto: APTO PARA V0.2 CON CAMBIOS (condicionado)
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Es una crítica técnica, no una aprobación formal.

# Revisión de seguridad — RFC-0005 Policy Evaluation and Decision Model

Es el RFC más completo de la serie: 18 invariantes, postura fail-closed explícita, separación provisional/ejecutable bien hecha, transform solo-restrictivo, obligación-o-deny, revalidación. El modelo es sólido y neutral de formato. Pero como motor de políticas que gobierna CRM/ERP/comunicaciones con credenciales de servicio amplias, le quedan **huecos críticos de completitud semántica de composición y de integridad de contexto** — no solo de prosa.

## 1. Bypasses de composición

- **La composición es monótona en *restricciones* pero no fija la autorización como conjuntiva.** 5.6 dice "deny prevalece", "las restricciones compatibles se acumulan", "ninguna política amplía autoridad". Todo trata restricciones. Pero **dos `allow` de ámbitos distintos no se restringen entre sí**: nada exige que **todas** las políticas de autorización aplicables permitan (semántica AND). Sin "la autorización es conjuntiva por capa; un allow es necesario-no-suficiente", se cuela **allow-por-cualquier-coincidencia** = ampliación accidental. Es el bypass central de composición.
- **Sin suelo de riesgo por defecto.** La política de riesgo (5.3) es aditiva: si un tenant no configura ninguna, las operaciones derivadas de no confiable / cross-org / credencial amplia **no reciben elevación**. La infra-configuración = infra-protección silenciosa. Falta una línea base obligatoria independiente de la config del tenant.
- **Ausencia de categoría = ¿pase?** El paso 4 evalúa "autorización, datos, operación, riesgo y aprobación", pero si una categoría no tiene política que coincida, no se dice si es "pass" o "deny". Si es pass, la ruta lectura→exfiltración de RFC-0003 sobrevive: autorización permite (identidad OK) mientras la política de datos, ausente, no opina. Debe: cada categoría cuyos atributos disparadores estén presentes (p. ej. dato clasificado) produce allow/obligación explícito, o la op deniega.

## 2. Precedencia (deny/allow/limit/transform/require_approval/defer)

- **`defer` infra-especificado frente a `allow`.** 5.6.5 lo trata solo para "restricciones incompatibles". Pero un `defer` por *contexto faltante* en una política entre varias `allow` debe **dominar y bloquear**. No se declara "cualquier `defer` aplicable bloquea, con independencia de otros allow".
- **Interleaving transform/require_approval sin fijar.** Pasos 7 (transform→reeval) y 8 (require_approval→provisional) son secuenciales pero no se ancla que **la aprobación recae sobre la solicitud final ya transformada**. Ambigüedad → el humano aprueba A y ejecuta A'.
- **`limit` + `transform` no conmutativos.** Restricciones que tocan el mismo campo (transform redacta destinatarios; limit cuenta destinatarios) pueden dar un neto menos restrictivo según el orden. Falta: las restricciones se componen al **ínfimo (intersección), orden-independiente**; si no es computable → deny.
- **Múltiples `transform` sin terminación.** Transforms encadenados + reevaluación (inv. 8) sin cota de iteraciones → posible bucle/livelock o reapertura de ruta. Falta cota → deny ante no convergencia.

## 3. Policy laundering

- **Transform→reevaluación como lavado.** El paso 7 crea solicitud derivada y "requiere reevaluación". Si la derivada (más restrictiva) coincide ahora con una `allow` más permisiva que la original (que coincidía con un deny), has lavado un deny en allow al estrecharte hacia un nicho permitido. La inv. 4 ("deny terminal") es terminal *para esa solicitud*; la derivada se evalúa fresca. **La derivada debe heredar todos los deny del padre; transform nunca escapa un deny.** Es el agujero de laundering, agravado por la reevaluación explícita.
- **Obligación como lavado.** "Exigir redacción" (5.5) puede convertir un deny de datos ("no revelar clasificado") en allow condicional. El modelo **no distingue deny absoluto de deny condicional** → cualquier deny podría neutralizarse con una obligación. Falta: los deny son absolutos por defecto; solo políticas explícitamente condicionales se satisfacen con obligaciones.
- **Compartición cross-org como vía sancionada de ampliación.** Es el único allow que ensancha. La sección 5.6 no la sitúa en la composición ni exige autoridad de ambas orgs (RFC-0004). Una sharing policy mal configurada es el vector de laundering cross-tenant.

## 4. Obligaciones no aplicables

- **¿Quién decide que una obligación es verificable?** Inv. 7 deniega si "no aplicable o no verificable", pero **el enforcement point se autoevalúa** y tiene incentivo a decir "sí puedo". Falta: obligaciones de un **catálogo tipado del Core**; el enforcement point **declara** qué tipos soporta; lo no soportado → deny (no auto-atestación).
- **Aceptación parcial.** Nada impide que Tool Engine aplique el límite de importe e ignore la redacción. Falta: **enforcement atómico de todas las obligaciones (all-or-nothing)** con confirmación positiva por obligación en auditoría; parcial = abortar.
- **Operaciones compuestas / largas.** Una Action Request que se abre en N efectos ("ejecutar integración"): ¿el límite "máx €1000" es por efecto o agregado? No hay **contabilidad agregada autoritativa**. Un límite de frecuencia/presupuesto sin estado agregado es decorativo. Falta: obligaciones cuantitativas requieren un punto de contabilidad autoritativo; las compuestas se descomponen y el límite aplica al agregado.
- **Obligaciones "después" sobre efectos irreversibles.** 5.5 admite "antes, durante o después". Una obligación verificada tras un efecto irreversible no es un gate. Falta: **las obligaciones-gate de efectos irreversibles son pre-efecto.**

## 5. Riesgos de contexto

- **Integridad/atestación de atributos.** Inv. 2 deniega ante contexto incompleto (fuerte), pero los atributos de seguridad (taint, clasificación, riesgo de integración) los computan otros (Context Assembly, Knowledge). Si están envenenados, Policy "permite" fielmente sobre entradas corruptas. Falta: **cada atributo crítico de seguridad lleva procedencia del productor; los auto-reportados/no atestados se rechazan** (atado a RFC-0003 #1).
- **Taint/clasificación incompletos = ¿limpio?** Si el taint no se propagó del todo, la política de riesgo infra-reacciona. Falta: **taint/clasificación ausente ⇒ tratar como no confiable / máxima clasificación** (fail-closed), no como limpio.
- **El gate de "operación relevante" puede inanizarse.** Inv. 2 deniega contexto incompleto *"para operaciones relevantes"*. Pero si faltan justo los atributos que marcarían la relevancia, la op puede juzgarse no relevante y **escapar al deny**. Circular. Falta: **atributos críticos ausentes fuerzan relevancia fail-closed.**
- **Frescura de revocación.** 5.2 incluye estado de revocación; 5.8 revalida ante cambios. Pero si Policy lee revocación cacheada, una identidad recién revocada pasa. Debe leerse de la fuente autoritativa en decisión y **re-leerse fresca en el efecto** (ver punto 6).

## 6. Evaluación distribuida

- **"Periodo de validez" (5.4) + invalidación diferida = ventana fail-open por construcción.** El periodo de validez es un TTL de caché. La inv. 13 invalida ante cambios, pero la propagación se difiere (Q#9). Entre el cambio y la propagación, una decisión dentro de validez ejecuta sobre base obsoleta. Falta: **los efectos irreversibles exigen lectura autoritativa fresca (revocación, versión de política) en el momento del efecto; el periodo de validez por sí solo nunca autoriza un efecto irreversible.**
- **Rollback / versión de política divergente.** La decisión registra "políticas y versiones consideradas" (bien), pero el enforcement point (paso 11) puede correr otra versión. Si hubo rollback entre decisión y efecto, el binding podría autorizar lo que la versión vigente deniega. Falta: el enforcement revalida contra la versión vigente, o el binding fija versión y un rollback invalida bindings pendientes.
- **Tool con reglas locales / credencial amplia.** Inv. 18 ("ninguna vía alternativa") es una regla; el *mecanismo* depende del binding infalsificable de RFC-0003. Y el problema real no es una "política local" sino que la tool con credencial amplia solo necesita ser invocada (hueco de confinamiento de RFC-0004 #3).

## 7. Provisional → aprobación → Decision Binding → efecto

Es el área mejor blindada (5.7, inv. 10-12, paso 10). Huecos restantes:
- **require_approval→provisional→aprobación→ejecutable** depende del binding a la solicitud exacta final (hueco RFC-0003). Sin mecanizar, provisional+aprobación puede emitir binding para otro payload.
- **Resolución de `defer`.** No se dice que solo Policy (reevaluación con nuevo contexto) puede resolver un defer. Hay que vetar que cualquier otro componente convierta un defer en ejecutable.
- **Validez caducada antes de la aprobación.** Si la aprobación llega tras expirar el periodo de validez del provisional, debe reevaluarse, no ejecutar. No se dice.

## 8. Multi-tenancy / cross-org / providers compartidos / extensiones / credenciales amplias

- **Providers/runtimes compartidos:** bien que el riesgo de "recurso compartido" sea atributo de contexto (5.2) y disparador de riesgo (5.3) — Policy *puede* elevar. Pero **Policy no puede verificar** que el provider honró el aislamiento; esa obligación es probablemente no atestable → deny (correcto), pero el RFC debe hacer **visible esa consecuencia** (si no, los equipos fingirán "verificable").
- **Cross-org:** falta regla explícita de que el allow cross-org exige **autoridad conjuntiva de ambas orgs**; ninguna política de un solo ámbito autoriza cross-org.
- **Credencial externa amplia (inv. 17):** "exigir on-behalf-of *cuando esté disponible*" (5.5) es una escotilla blanda: si no está disponible, la credencial amplia corre sin confinar. Falta: **si el confinamiento/on-behalf-of no está disponible para un efecto externo relevante ⇒ require_approval o deny**, nunca proceder en silencio. Conviene un tipo de obligación de catálogo "confinar credencial al scope".

## 9. Invariantes ahora vs futuro

**Presentes y fuertes:** inv. 1-18 (completitud de contexto, fail-closed ante incompleto, Policy no ejecuta, deny terminal, sin ampliación de autoridad, obligaciones solo restringen, obligación no verificable bloquea, transform restrictivo+reeval, aprobación no crea autoridad, provisional no ejecutable, ningún componente la convierte, binding requerido, revalidación ante cambios, op larga reevalúa, indeterminable→no ejecuta, sin razonamiento del modelo como autoridad, credencial amplia ≠ autoridad global, sin vía alternativa). Conjunto genuinamente completo.

**Faltan como invariante (añadir ahora):**
- Autorización **conjuntiva** por capa (allow necesario-no-suficiente).
- Cualquier `defer` aplicable bloquea; solo Policy resuelve un defer.
- La solicitud derivada **hereda todos los deny** del padre; transform nunca escapa un deny; iteraciones acotadas.
- Deny **absoluto por defecto**; solo políticas condicionales se satisfacen con obligaciones.
- Enforcement de obligaciones **atómico** (all-or-nothing) con confirmación por obligación.
- Obligaciones-gate de irreversibles **pre-efecto**; obligaciones cuantitativas con **contabilidad agregada autoritativa**.
- Atributos críticos con **procedencia del productor**; auto-reportados rechazados; taint/clasificación ausente = no confiable/máx clasificación; críticos ausentes fuerzan relevancia fail-closed.
- Efectos irreversibles: **lectura autoritativa fresca** en el efecto; el periodo de validez nunca autoriza un irreversible por sí solo.
- Cada categoría aplicable produce allow/obligación explícito; ausencia de categoría ≠ pase.
- Cross-org exige autoridad conjuntiva de ambas orgs.

**Razonable diferir:** sintaxis/motor/lenguaje de políticas, RBAC/ABAC/ReBAC, orden formal entre ámbitos, taxonomía de riesgo, *contenido* del catálogo de obligaciones (pero la **existencia** de un catálogo tipado debe ser invariante), versionado/rollback, consistencia distribuida, caché, UI, simulación, explicabilidad.

## 10. Cambios concretos (priorizados por severidad)

1. **(5.6 / inv.) Autorización conjuntiva por capa:** toda política de autorización aplicable debe permitir; un allow es necesario-no-suficiente; solo las restricciones se acumulan. **CRÍTICO** — sin esto, allow-por-cualquier-coincidencia amplía autoridad.
2. **(5.6 / paso 7 / inv. 8) La solicitud derivada hereda todos los deny del padre; transform nunca enruta a una política más permisiva que escape un deny;** iteraciones acotadas, no convergencia = deny. **CRÍTICO** — laundering.
3. **(5.5 / 5.6 / inv.) Distinguir deny absoluto de condicional; obligaciones solo satisfacen políticas explícitamente condicionales.** Enforcement de obligaciones atómico (all-or-nothing) con confirmación por obligación; parcial = abortar. **CRÍTICO.**
4. **(5.2 / 5.3 / inv.) Atributos críticos con procedencia del productor, rechazo de auto-reportados; taint/clasificación ausente ⇒ no confiable/máx clasificación; críticos ausentes ⇒ relevancia fail-closed.** **CRÍTICO** — contexto envenenado o inanido derrota el motor.
5. **(5.4 / 5.8 / paso 11 / inv.) Efectos irreversibles: lectura autoritativa fresca (revocación, versión de política) en el efecto; el periodo de validez por sí solo nunca autoriza un irreversible.** **CRÍTICO** — validez + invalidación diferida es fail-open por construcción.
6. **(5.6 / inv.) Cualquier `defer` aplicable bloquea con independencia de otros allow; solo Policy (reevaluación) resuelve un defer.** **ALTO.**
7. **(5.3 / paso 4 / inv.) Cada categoría aplicable produce allow/obligación explícito cuando sus atributos disparadores están presentes; ausencia de categoría ≠ pase** (en especial datos con contenido clasificado). **ALTO.**
8. **(5.6 / inv.) Suelo de riesgo por defecto independiente de la config del tenant:** operaciones derivadas de no confiable, cross-org y de credencial amplia ⇒ elevación obligatoria (aprobación o deny) aun sin políticas de riesgo configuradas. **ALTO.**
9. **(5.5 / inv. 7) Obligaciones de un catálogo tipado del Core; los enforcement points declaran tipos soportados; lo no soportado ⇒ deny.** Obligaciones cuantitativas con contabilidad agregada; compuestas aplican el límite al agregado. **ALTO.**
10. **(5.6 / RFC-0004) Allow cross-org exige autoridad conjuntiva de ambas orgs; ninguna política de un solo ámbito autoriza cross-org;** situarlo en el orden de composición. **ALTO.**
11. **(pasos 7-8 / inv. 9) Fijar orden: transform resuelve a la solicitud final antes de la aprobación; la aprobación liga la solicitud exacta post-transform;** validez caducada antes de aprobar ⇒ reevaluar. **MEDIO-ALTO.**
12. **(5.6 / inv.) Las restricciones se componen al ínfimo (intersección), orden-independiente; si no es computable ⇒ deny.** **MEDIO.**
13. **(5.5 / §8) Obligaciones-gate de efectos irreversibles deben ser pre-efecto;** las post-efecto no son gate de autorización. **MEDIO.**
14. **(§7 / 5.5) Sustituir "on-behalf-of cuando esté disponible":** si el confinamiento/on-behalf-of no está disponible para un efecto externo relevante ⇒ require_approval o deny, nunca proceder en silencio. **MEDIO.**
15. **(5.7 / inv. 12 / dependencia) Declarar la dependencia dura: Decision Bindings infalsificables y ligados a identidad+solicitud exacta (RFC-0003);** sin ello, inv. 10-12/18 son advisory. **MEDIO.**

## 11. Veredicto final

## `APTO PARA V0.2 CON CAMBIOS` — condicionado

**Por qué APTO (y no rediseño):** como en RFC-0004, la **estructura es correcta** — categorías de política, postura fail-closed, separación provisional/ejecutable, transform restrictivo, obligación-o-deny, 18 invariantes. Los arreglos son **añadir invariantes y fijar la semántica de composición/contexto**, no reestructurar. El modelo ya tiene la forma adecuada; falta clavar la semántica de composición y la integridad de contexto.

**Condiciones de bloqueo para v0.2** (sin ellas baja a `NECESITA REDISEÑO PARCIAL`):
- Cambios **1-5 bloqueantes**: autorización conjuntiva (1), herencia de deny en transform (2), deny absoluto + obligaciones atómicas (3), atestación/fail-closed de contexto (4), lectura fresca en efectos irreversibles (5).
- **Dependencia externa dura:** el binding infalsificable de RFC-0003 (y el confinamiento del efector de RFC-0004). Sin ellos, inv. 10-12/18 son advisory y el modelo pasa a `NECESITA REDISEÑO PARCIAL`.

**Lo que haría ya:** cambios 1-5 antes de aprobar v0.2. El núcleo es el cambio 1 (autorización conjuntiva): sin él, toda la composición fail-closed se apoya en una semántica de autorización que permite ampliación por coincidencia. Con 1-5 cerrados y la dependencia del binding resuelta, RFC-0002→0005 forman un núcleo de seguridad honesto y coherente.

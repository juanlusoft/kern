---
title: Revisión de seguridad — RFC-0006 Capability, Tool and Extension Contract v0.2.1
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (plugin security, supply chain, sandboxing, APIs empresariales, delegated authz, multi-tenancy, ejecución de código no confiable)
fecha: 2026-06-27
documento_revisado: RFC-0006 — Capability, Tool and Extension Contract (v0.2.1)
veredicto: READY FOR ACCEPTANCE WITH MINOR CHANGES
nota: Evaluación solo de v0.2.1. Las revisiones previas se usan únicamente para verificar que sus hallazgos están realmente resueltos en este texto.
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2.1 únicamente.

# Revisión de seguridad — RFC-0006 v0.2.1

Veredicto rápido: v0.2.1 **resuelve materialmente** los 15 hallazgos de la revisión anterior, verificables uno a uno en el texto. Queda **un hueco real** (canales secundarios / telemetría) y riesgos residuales inherentes. Checklist hostil:

## Checklist

**1. Taxonomía sin rutas ambiguas — `PASS`** (con nota). Implementation ya es término normativo (5.9); adapter plegado como detalle interno sin ruta autónoma (5.3, 5.4); colisión "provider" resuelta (5.5). *Nota:* 5.3 aún dice que una Integration conecta "una Tool **o** Capability" y no declara explícitamente que los efectos de una Integration son mediados por Core como los de una Tool (5.2); se deduce de 6.6/6.9/10 pero no está en su definición. No deja ruta de ejecución no gobernada; es pulido.

**2. Capability ≠ token Object-Capability — `PASS`.** 5.1 explícito ("no es un token de Object-Capability security... no... objeto o token infalsificable de autoridad") + inv. 1.

**3. "Componente controlado por Core" estricto y no auto-declarable — `PASS`.** 5.11: cinco condiciones acumulativas (no es código de la Extension/Publisher; identidad/lifecycle validados por Core; sus decisiones no las puede influir una Extension; produce evidencia verificable; auditable/invalidable) + "una Tool, Integration, Extension, adapter o Extension Publisher no puede declararse por sí mismo componente controlado por Core" + inv. 21.

**4. Tool/Integration/Extension nunca son puntos de decisión de autorización — `PASS`.** 5.10: "no puede emitir allow, resolver defer, validar... binding, aprobar... excepción ni decidir que una obligación ha quedado satisfecha" + inv. 7.

**5. Core controla binding/obligaciones/mediación/custodia de credenciales — `PASS`.** 5.10, 5.11, inv. 6.

**6. Precondiciones bloqueantes para código no confiable — `PASS`.** 6 (párrafo tras paso 10) + §11 + inv. 22 + §14 ("las precondiciones... no quedan abiertas en este RFC", "no... degradarse a buenas prácticas opcionales"). Aislamiento, mediación, identidad de artefacto en runtime y confinamiento de credenciales son gates, no recomendaciones.

**7. Sin precondiciones, no hay ejecución relevante ni acceso a red/secretos/credenciales/almacenamiento/callbacks/colas/procesos — `PASS`.** 6 y §11: "no puede activarse para operaciones relevantes ni recibir acceso a sistemas externos, secretos, credenciales amplias, red, almacenamiento, callbacks, colas o procesos" + inv. 22.

**8. Implementación/versión/artefacto/config org-scoped ligados a Policy y Decision Binding — `PASS`.** 6.2-6.4, 5.9, inv. 4/11.

**9. Core verifica en el momento del efecto que el artefacto ejecutado == artefacto autorizado — `PASS`.** 6: "Antes de un efecto externo, irreversible, compuesto, asíncrono o relevante, Core o un componente controlado por Core debe verificar que la Implementation efectivamente ejecutada coincide... Una verificación realizada solo durante Capability Resolution no es suficiente... La evidencia... debe formar parte de la trazabilidad." (Su cumplimiento depende del sustrato de attestation, que ya es precondición bloqueante.)

**10. El mapeo (implementación, versión, artefacto) no depende unilateralmente del Publisher — `PASS`.** 6: "debe anclarse en Core o en una raíz de confianza validada por Core, no en una declaración unilateral del Extension Publisher."

**11. Manifest incompleto/falso/bajo-riesgo no permite efecto real no mediado — `PASS`.** 5.6 (incompleto/ambiguo/no verificable = no instalable/activable/resolvible), 6 paso 10 (efecto/destino/subefecto no declarado bloquea), 6 párrafo final (Core no confía en el manifest; mediación real) + inv. 20.

**12. Sin efectos externos/Tool→Tool/Tool→Integration/red/colas/callbacks/secretos fuera de frontera gobernada — `PASS`.** 6.6-6.9, inv. 8/9/19.

**13. Clasificación/procedencia/taint asignados/verificados por Core; la extensión no puede rebajarlos/borrarlos — `PASS`.** 7: "asignados o verificados por una frontera... controlada por Core. Una Tool, Integration o Extension no puede elevar la confianza, reducir clasificación, eliminar taint..." + inv. 10/23. (Resuelve el principal hallazgo previo de taint auto-reportado.)

**14. Logs/métricas/trazas/telemetría no crean vía secundaria de exfiltración — `PARTIAL`.** 7 lo **prohíbe** ("los logs, la telemetría, las métricas, las trazas y los canales secundarios no pueden convertirse en una vía de exfiltración") y 10 los hace org-scoped, **pero no hay contrato de mediación** para ese canal: a diferencia de los efectos (modelo de mediación completo), la telemetría tiene una sola frase prohibitiva. Para código no confiable que **emite** logs/métricas, hace falta que el sink sea controlado por Core y consciente de clasificación, o que la emisión de telemetría sea un efecto mediado sujeto a taint/destino. El org-scoping no impide exfiltración por **contenido** (datos clasificados en una línea de log legible por un atacante en esa org, o un sink que egresa) ni canales encubiertos. Es el único hueco real que queda.

**15. Credencial amplia nunca llega a la extensión; sin credencial acotada, mediador Core obligatorio — `PASS`.** 10: "la credencial debe permanecer exclusivamente bajo custodia de Core... no puede recibir esa credencial, ni completa ni disfrazada como material limitado... solo puede solicitar una operación a un mediador controlado por Core" + inv. 24.

**16. Riesgo residual de credencial amplia / integración opaca se eleva, no se trata como plenamente gobernado — `PASS`.** 10: "la mediación reduce el blast radius... pero no elimina... el riesgo residual... debe clasificarse como de mayor riesgo y requerir deny o controles reforzados... Nunca puede tratarse como plenamente gobernada por defecto."

**17. Compuestas exigen subefectos gobernados o atomicidad/idempotencia/compensación verificables — `PASS`.** 8 + inv. 17.

**18. Sin esas garantías, compuesta/irreversible deny-by-default — `PASS`.** 8: "debe denegarse por defecto hasta que exista un contrato de compensación aceptado" + inv. 27.

**19. Asíncronas reevalúan auth/revocación/policy/destinos/obligaciones antes del disparo, desde Core — `PASS`.** 8: "Todo recheck previo al disparo... debe ejecutarse por Core o un componente controlado por Core usando fuentes autoritativas y actuales... Una Extension no puede autoevaluar que un binding asíncrono sigue vigente" + inv. 16.

**20. Callbacks/webhooks entrantes no se autoatribuyen tenant/identidad/autoridad — `PASS`.** 8: "debe autenticarse y asociarse a una organización, Integration y contexto gobernado mediante mecanismos verificados por Core. La organización, identidad, destino o contexto declarados por el callback no son evidencia suficiente" + inv. 25.

**21. Extensión multi-tenant no filtra estado en concurrencia — `PASS`.** 10: "debe impedir acceso cruzado incluso durante ejecuciones concurrentes. No puede depender de memoria global mutable, pools no vinculados a organización, variables de entorno compartidas, caches con claves incompletas ni estados de proceso reutilizables... Core debe poder verificar... estado mutable... aislado por organización o por invocación." (Cumplimiento dependiente del sustrato de aislamiento, ya precondición bloqueante.)

**22. Versiones vulnerables/revocadas no reactivables por excepción — `PASS`.** 9: "vulnerable o revocada no puede reactivarse, seleccionarse, instalarse ni ejecutarse mediante excepción de policy"; "rollback hacia una versión vulnerable o revocada debe ser denegado" + inv. 26. (Solo deprecada/retirada-por-compatibilidad admite excepción auditada.)

**23. Sin contradicción material con RFC-0003/0004/0005 — `PASS`.** §11 declara dependencias coherentes; donde diverge, RFC-0006 es **más estricto** (taint estampado por Core vs. el atributo auto-reportado que señalé en RFC-0005), no contradictorio. *Salvedad:* no es contradicción del texto, pero RFC-0006 **presupone** garantías que aguas arriba aún no están mecanizadas como invariante — el Decision Binding infalsificable ligado a la solicitud (hallazgo abierto en mi revisión de RFC-0003). Es deuda de dependencia, declarada en §11, no contradicción.

**24. Tres riesgos residuales/inevitables aun con este RFC:**
1. **Confused deputy en el sistema externo.** Mientras una API solo exponga credenciales de servicio amplias, el mediador del Core actúa con derechos plenos frente al ERP/CRM: la mediación **reduce** el blast radius (destinos/efectos ligados al binding) pero el sistema externo sigue viendo la cuenta de servicio y sus derechos son el techo real. El propio 10 lo admite. Inevitable sin on-behalf-of/tokens acotados del lado externo.
2. **Dependencia de un sustrato que aún no existe.** Todas las garantías para código no confiable (no-efectos-ambientales, verificación de artefacto en runtime, aislamiento concurrente) son **contractuales**, no efectivas, hasta que existan e implementen aislamiento/sandboxing (Q#3/#8) y attestation (Q#5), **y** hasta que RFC-0003 mecanice el binding infalsificable. Hoy son invariantes correctos sostenidos por un sustrato pendiente.
3. **Exfiltración semántica y canales encubiertos.** Aun con taint estampado por Core y efectos mediados, una extensión autorizada para un efecto legítimo puede **codificar datos dentro de un destino/payload autorizado** (esteganografía, canal encubierto), o filtrar por temporización/recursos/telemetría. La propagación de taint y los límites de destino reducen pero no eliminan la exfiltración a través de canales legítimamente autorizados (ligado al `PARTIAL` del punto 14).

---

## Correcciones concretas (priorizadas)

1. **(7 / 10 / nueva) Contrato de mediación de telemetría:** logs/métricas/trazas emitidos por extensiones pasan por un sink controlado por Core y consciente de clasificación; la emisión de telemetría es un efecto mediado sujeto a taint/destino; el org-scoping por sí solo no basta contra exfiltración por contenido ni canales encubiertos. **[Resuelve el único `PARTIAL`] — bloqueante.**
2. **(§11 / dependencia) Convertir la dependencia de RFC-0003 en gate de conformidad explícito:** las garantías de RFC-0006 son nulas salvo que RFC-0003 mecanice el Decision Binding infalsificable ligado a la solicitud. Hoy se referencia; debe ser condición de aceptación. **Bloqueante (cross-RFC).**
3. **(24 / §10) Reconocer y acotar canales encubiertos/laterales:** efectos derivados de lecturas sensibles llevan límites de blast-radius/tasa y monitorización de anomalías, porque un destino autorizado puede portar exfiltración semántica.
4. **(5.3) Declarar explícitamente que los efectos externos de una Integration son mediados por Core** (igual que una Tool), cerrando la mediación hoy solo implícita.
5. **(6 / 9) Precisar qué exige operativamente "la Implementation efectivamente ejecutada coincide"** (identidad medida/attestation en runtime) y atarlo a inv. 22, para que no se lea como una comprobación blanda de referencia.
6. **(5.6) Validación positiva declarado-vs-real:** el riesgo/efectos declarados en el manifest se re-derivan/validan contra la superficie de efecto observada de la implementación, no solo se comprueba completitud (completitud ≠ veracidad).
7. **(8) Fijar la exigencia de frescura autoritativa del recheck asíncrono** (lectura fresca, no snapshot), alineado con la misma observación hecha a RFC-0005.
8. **(10 / Q#10) Sacar las integraciones opacas de "pregunta abierta" a estado gated definido** (deny por defecto + excepción de control reforzado), como ya se hizo con las precondiciones.

## Cambios bloqueantes antes de aceptar

- **Corrección 1** (mediación de telemetría / canal secundario) — es el único `PARTIAL` y un canal real de exfiltración para código no confiable.
- **Corrección 2** (gate de conformidad sobre el binding infalsificable de RFC-0003) — sin él, todo el contrato es advisory en la práctica.

El resto (3-8) son endurecimientos no bloqueantes que pueden entrar en la misma iteración o en v0.2.2.

## Veredicto

## `READY FOR ACCEPTANCE WITH MINOR CHANGES`

23 de 24 puntos en `PASS`, 1 en `PARTIAL`. v0.2.1 cierra de forma verificable —citando sección— los 15 hallazgos previos: "componente controlado por Core" definido y no auto-declarable (5.11), extensiones nunca deciden autorización (5.10), precondiciones bloqueantes no degradables (6/§11/§14), verificación de artefacto en el momento del efecto (6), raíz de confianza del mapeo artefacto fuera del Publisher (6), taint estampado por Core (7), credencial amplia con mediador-Core obligatorio (10), callbacks no auto-atribuibles (8), aislamiento concurrente multi-tenant (10) y versiones vulnerables/revocadas no excepcionables (9).

No es "needs partial redesign" ni "requires targeted corrections" amplias: la estructura es correcta y completa, y solo restan **dos cambios bloqueantes acotados** (mediación de telemetría y el gate de dependencia sobre RFC-0003). Con esos dos, el RFC es aceptable. Los riesgos residuales del punto 24 son **inherentes** (credenciales amplias del mundo real, sustrato pendiente, canales encubiertos) y están honestamente reconocidos en el propio texto, no son defectos del contrato.

**Salvedad de honestidad:** "aceptable" describe el **documento**. La seguridad **efectiva** frente a extensiones no confiables no existe hasta que el sustrato (aislamiento, attestation) y el binding infalsificable de RFC-0003 estén implementados. El RFC ya lo dice; conviene que la decisión de aceptación lo registre como condición de despliegue, no solo de redacción.

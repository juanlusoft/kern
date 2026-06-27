---
title: Revisión de seguridad — RFC-0006 Capability, Tool and Extension Contract v0.2
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (plugin security, supply chain, API integrations, delegated authz, multi-tenancy, control de efectos externos)
fecha: 2026-06-27
documento_revisado: RFC-0006 — Capability, Tool and Extension Contract (v0.2)
veredicto: APTO PARA V0.2 CON CAMBIOS (condicionado)
nota: Evaluación solo de v0.2. No reutiliza conclusiones de la revisión de v0.1.
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2 únicamente. No revisa v0.1 ni asume nada sobre ella.

# Revisión de seguridad — RFC-0006 v0.2

Evaluación hostil del texto actual. Conclusión rápida: **v0.2 es un documento sustancialmente distinto y mucho más sólido.** La taxonomía ya no es circular, la frontera de enforcement es del Core, los efectos ambientales se niegan, el manifest deja de ser fuente de confianza, la resolución queda ligada a la implementación exacta y el binding, la identidad de artefacto es inmutable, los efectos asíncronos se gobiernan y las credenciales las custodia el Core. Lo que sigue es lo que **aún** rompe, leído con hostilidad.

## 1. Taxonomía (precisa / no circular)

Mayormente resuelta y bien. Residuos:
- **"Adapter" queda fuera de la taxonomía.** 5.3 define Integration como "configuración **y adaptador**"; 5.4 dice que una Extension puede aportar "Tools, Integrations, manifests **o adaptadores**". Un adapter es a la vez parte de una Integration y un entregable independiente de una Extension. Si el adapter es lo que realmente habla con el sistema externo y no es ni Tool (mediada por Core) ni Integration (config org-scoped), es una **cuarta categoría no gobernada** = posible ruta de efecto. Hay que plegar "adapter" como detalle de implementación de una Tool/Integration, nunca entregable de primera clase.
- **"Implementation" es el objeto que carga el binding (6.2, 6.4, inv. 4, inv. 11) y no está definido normativamente en §5.** Capability Resolution "selecciona una implementation", y todo el binding depende de ella, pero no es término normativo. Definirla (artefacto concreto que realiza una capability, con identidad inmutable verificable).

## 2. ¿Capability ≠ token Object-Capability?

**Sí, inequívoco.** 5.1 lo dice explícitamente ("no es un token de Object-Capability security... no es un objeto o token infalsificable de autoridad") y la inv. 1 lo refuerza. Esta pregunta queda cerrada. Sin objeción.

## 3. ¿Core controla de verdad enforcement / validación de bindings / mediación / custodia de credenciales?

Lo *afirma* (5.9, inv. 6/7) y es la dirección correcta. Pero hay **un término de carga sin definir que filtra toda la frontera**:
- **"o a componentes controlados por Core" / "frontera controlada por Core"** (5.9, 6.7, 10) — **¿qué es un "componente controlado por Core"?** No se define. Un publisher puede argumentar que su mediador/adaptador in-process es "controlado por Core". Sin criterio (corre en el dominio de confianza del Core, no es código suministrado por la extensión, atestado, sin influencia de la extensión sobre sus decisiones), **toda la frontera de enforcement/mediación/credenciales se cuela por esta frase.** Es el hueco más importante que queda.
- **inv. 7 dice "no puede ser su *único* enforcement point"; 5.4 "su *propio* punto de enforcement".** "Único"/"propio" admite que la extensión sea *uno de varios* puntos de enforcement → todavía puede tomar decisiones locales de allow. Debe ser: una extensión/tool/integration **nunca es un punto de decisión de autorización**; solicita, el Core decide.

## 4. ¿Una Tool/Integration/Extension puede aún producir un efecto por ruta no mediada?

A nivel de **contrato**, las rutas lógicas están cerradas (6.6-6.9, inv. 8/9/19): sin autoridad ambiental a red, almacenamiento, procesos, secretos, colas, callbacks; toda llamada re-entra por la frontera gobernada; efecto/destino/subefecto no declarado bloquea. Correcto.
- Pero **el enforcement es una afirmación lógica, no un mecanismo.** ¿Qué *impide* que código de extensión con acceso a red abra un socket? Eso es sandboxing/aislamiento, **diferido a open Q#3 y #8**. Hasta que exista ese sustrato, inv. 8/9/19 se sostienen por **buena voluntad de la extensión**. El contrato es correcto; su cumplimiento depende de un RFC que no existe. §11 declara dependencias de RFC-0003/4/5 pero **no marca la dependencia del aislamiento/sandboxing como precondición bloqueante** para correr código no confiable.
- El "componente controlado por Core" otra vez: si el mediador vive dentro de la extensión, la ruta es no mediada en la práctica.

## 5. ¿El manifest puede seguir mintiendo y qué frontera lo frena?

Bien tratado: el manifest es entrada, no fuente de confianza (6, párrafo final + inv. 20), y "efecto no declarado / destino no autorizado / subefecto no gobernado debe bloquear" (6.10). Una mentira por **infra-declaración** (dice solo-lectura, escribe) la frena la mediación de efectos: la escritura no declarada choca contra el Core y se bloquea. Correcto **para el tipo/destino del efecto.**
- **Pero solo funciona si el Core puede *observar* el efecto real para compararlo.** La mentira peligrosa no siempre es el tipo/destino: es el **contenido/intención** dentro de un efecto autorizado ("enviar correo al cliente" con datos robados en el cuerpo; escritura a CRM a destino permitido con payload malicioso). Ahí el control previsto es la propagación de taint/clasificación (7, inv. 10) — pero **¿quién la aplica?** Si la aplica la salida de la capability (la extensión), es falsificable: una extensión maliciosa **quita o re-etiqueta** el taint de los datos que leyó. El taint debe estamparlo **la frontera de lectura del Core**, no la extensión. (Mismo defecto que señalé en RFC-0005 sobre atributos de seguridad auto-reportados.)
- Para integraciones opacas (open Q#10 admite que existen), el Core puede no ver el destino real → la protección contra mentira degrada al caso opaco, que está diferido.

## 6. ¿Implementación exacta / versión / artefacto / config org-scoped ligadas a autorización y Decision Binding?

**Sí, explícito y fuerte** (6.2, 6.4, 5.8, inv. 4, inv. 11). El binding liga capability + implementación concreta + versión + identidad verificable de artefacto + integration/config org-scoped + org + identidad + solicitud + efectos + destinos + obligaciones + snapshot de policy. Excelente.
- Residuo: 6.4 liga en el **momento de la decisión**, pero no exige que el enforcement point **verifique en el momento del efecto** que la implementación en ejecución coincide con la identidad de artefacto ligada (attestation en runtime). Sin esa comprobación, un swap entre decisión y efecto (TOCTOU) no se detecta. Depende de attestation (open Q#5); declararlo.

## 7. ¿Huecos de sustitución / update silencioso / downgrade / rollback / mismo identificador?

Bien cerrados (7 y 9): (id, versión) → contenido inmutable; cambio de contenido = cambio de implementación → reevaluación (inv. 12); deprecada/revocada/vulnerable/retirada no se reactiva salvo excepción de policy (inv. 18); rollback = cambio de lifecycle → reevaluación. Buen trabajo.
- **Pero la "excepción explícita de policy" mete a *vulnerable* y *revocada* en el mismo saco que *deprecada* (9).** Una versión **vulnerable o revocada** no debería ser excepcionable en absoluto; solo deprecada/retirada-por-compatibilidad debería poder excepcionarse. Hoy una vulnerabilidad conocida puede reactivarse "con aprobación".
- **¿Quién certifica el mapeo (id, versión) → hash y la identidad de artefacto?** Si lo asevera el Extension Publisher o un registry controlado por el publisher, el publisher **miente sobre su propia identidad de artefacto** (cadena de suministro). La identidad de artefacto debe estar enraizada en Core/attestation, no aseverada por el publisher.

## 8. ¿Credenciales externas amplias confinadas por operación o mediadas por Core?

Fuerte (10, inv. 13): el Core custodia; la extensión recibe solo "material limitado a la operación" **o** invoca un mediador del Core; la credencial amplia nunca es ambiental; sin confinamiento verificable → deny/require_approval.
- **Hueco para el modelo de amenaza exacto:** para un sistema que **solo expone credenciales de servicio amplias**, no existe "material limitado a la operación" que entregar. La única vía segura es "invoca un mediador del Core". Pero el RFC deja "recibe material limitado" como **opción** — imposible para esas APIs — así que una implementación perezosa **entrega la credencial amplia diciendo que es "limitada"**. Hay que **mandar mediador-Core-obligatorio**: cuando el sistema externo solo expone credenciales amplias, la credencial **permanece en el mediador del Core y la extensión nunca la recibe**; la opción "material limitado" no está disponible.
- **El mediador del Core sigue usando la credencial amplia en el sistema externo** → el confused deputy en el ERP persiste (todo aparece como la cuenta de servicio; sus derechos son el techo real). El Core limita destino/efecto del lado de Kern, pero un fallo del mediador o un modelo de destinos incompleto deja la credencial amplia capaz de más. Declarar explícitamente: la mediación **reduce pero no elimina** el blast-radius de la credencial amplia; se prefiere autorización externa por-operación (on-behalf-of/tokens scoped) donde el sistema lo soporte, y donde no (integración opaca, open Q#10) hay riesgo residual que debe **aflorarse, limitarse en blast-radius y elevarse**.

## 9. ¿Compuestas / parciales / irreversibles / asíncronas / diferidas gobernadas antes de cada efecto real?

Comprehensivo y fuerte (8, inv. 8/16/17): subefectos declarados y gobernados individualmente **o** demostrar atomicidad/idempotencia/compensación verificables, si no deny; re-chequeo asíncrono de autorización/revocación/policy/destinos/obligaciones antes del disparo; no sobrevive a la invalidación del binding; parcial no se disfraza de éxito; registro de hechos/pendientes/compensados/no-compensables; no continúa tras deny/revocación/fallo de obligación.
- Residuos:
  - **¿Quién demuestra y verifica** atomicidad/idempotencia/compensación? Para sistemas externos sin rollback (open Q#11 lo admite), no puede demostrarse → por 8, la compuesta **debe denegarse**. Es el fail-closed correcto, pero implica que **gran parte de operaciones reales de ERP/facturación son deny-by-default** hasta que exista el modelo de compensación. Hay que **aflorar esa consecuencia** para que los equipos no falseen "verificable".
  - **El re-chequeo asíncrono "antes del disparo"** debe ser **lectura autoritativa fresca** (revocación, versión de policy), no snapshot — y ejecutado por **Core / mediador controlado por Core**, no auto-chequeado por el handler de webhook de la extensión. "El sistema debe comprobar de nuevo" debe leerse "el Core", o el re-chequeo es auto-policiado.

## 10. ¿La salida de lectura propaga clasificación / procedencia / taint?

Lo declara (7 + inv. 10). **El hueco es de nuevo quién lo estampa:** si lo aplica la salida de la capability (extensión), es auto-reportado y falsificable; debe estamparlo la **frontera de lectura del Core**. Y el "cuando aplique" de la inv. 10 es un suavizante por el que una extensión declara que "no aplica". Quitar el softener para atributos de seguridad y enraizar el estampado en Core.

## 11. ¿Multi-tenancy cubre credenciales / configs / cachés / logs / colas / callbacks / lifecycle?

Sí, lista exhaustiva org-scoped (10), incluyendo colas, callbacks, artefactos de ejecución y lifecycle. Lo mejor del documento. Residuos:
- **Código/proceso de extensión compartido sirviendo a varias orgs.** 10 prohíbe *reutilizar* memoria/contexto/secretos cross-org (bien), pero **no exige aislamiento de proceso/memoria entre solicitudes concurrentes** de una instancia multi-tenant. La fuga real de plugins está en globals compartidos, pools mal keyed, colisiones de caché. "No reutilizar" no es "no co-residir": datos co-residentes + un bug de keying = fuga. Exigir aislamiento por-solicitud (sin estado mutable cross-tenant) o proceso-por-tenant para extensiones con estado.
- **Callbacks/webhooks entrantes:** un endpoint de webhook es alcanzable por atacantes (cualquiera hace POST). 10 los declara org-scoped, pero **la atribución de org del callback entrante no puede confiar en lo que el callback afirma** — debe autenticarse y vincularse a org por el Core (principio "el canal no se autovalida" de RFC-0004 aplicado a callbacks). No está dicho.

## 12. Reglas que siguen siendo aspiracionales (falta contrato)

El RFC es ahora **honesto** sobre la mayoría vía open questions 10-14 (compensación, integraciones opacas, observación de subefectos, aprobación anti-rollback, evolución asíncrona artefacto/manifest). Lo que sigue siendo aspiración:
- **"Componente controlado por Core"** sin definir → toda la frontera (5.9/6.7/10) es aspiracional hasta definirlo.
- **No-efectos-ambientales (inv. 8/9/19)** contingente de aislamiento/sandboxing inexistente (Q#3/#8) → aspiracional; **el modelo de amenaza "extensión no confiable" no se cumple solo con este contrato.**
- **Estampado de taint (inv. 10)** aspiracional si lo aplica la extensión.
- **Verificación de identidad de artefacto en el momento del efecto** aspiracional sin attestation (Q#5).
- **Atomicidad/compensación de compuestas** aspiracional sin el modelo de compensación (Q#11) → deny-by-default mientras tanto.
- **Raíz de confianza de (id, versión) → hash** aspiracional si la asevera el publisher.

El salto de madurez es real: lo que falta son **precondiciones bloqueantes del modelo de amenaza** (código no confiable + credenciales amplias), no reestructuración. El RFC debería tratarlas como *gates*, no como preguntas abiertas.

## 13. Cambios concretos (priorizados por severidad)

1. **(5.9 / nueva def.) Definir "componente controlado por Core"** con criterio duro (corre en el dominio de confianza del Core, no es código de la extensión, atestado, sin influencia de la extensión sobre sus decisiones). Sin esto, toda la frontera de enforcement/mediación/credenciales se filtra. **CRÍTICO.**
2. **(7 / inv. 10 / 6) Taint, clasificación y procedencia los estampa la frontera de lectura del Core, no la salida de la capability/extensión; quitar "cuando aplique" para atributos de seguridad;** una extensión no puede fijar ni quitar su propio taint. **CRÍTICO** — si no, inv. 10 es auto-reportado.
3. **(§11 / open Q#3,#8,#5) Promover aislamiento/sandboxing (Q3/Q8), attestation de artefacto (Q5) y primitivas de mediación de credenciales a precondiciones BLOQUEANTES:** hasta que existan, las extensiones no pueden correr como no confiables ni habilitarse integraciones de credencial amplia. **CRÍTICO** — hoy inv. 8/9/13/19 dependen de la buena voluntad de la extensión.
4. **(10) Para sistemas que solo exponen credenciales amplias, mediador-Core obligatorio:** la credencial permanece en el mediador del Core y la extensión nunca la recibe; la opción "material limitado" no está disponible para ese caso. **ALTO** — cierra el "digo que es limitada" en el modelo de amenaza exacto.
5. **(6.4 / inv. 11) El enforcement point verifica en el momento del efecto que la implementación en ejecución coincide con la identidad de artefacto ligada** (attestation en runtime), no solo en la resolución. **ALTO** — cierra el TOCTOU artefacto decisión→efecto.
6. **(5.4 / inv. 7) Endurecer "único/propio enforcement point" a "nunca es un punto de decisión de autorización":** la extensión solicita, el Core decide. **ALTO** — "único" admite co-enforcement / allow local.
7. **(9 / open Q#13) Separar vulnerable/revocada de deprecada/retirada:** vulnerable y revocada **no son excepcionables**; solo deprecada/retirada-por-compatibilidad admite excepción. **ALTO.**
8. **(7) La identidad de artefacto y el mapeo (id, versión) → hash se enraízan en Core/attestation, no los asevera el Extension Publisher** ni un registry controlado por él. **ALTO** — cadena de suministro.
9. **(10) Callbacks/webhooks entrantes autenticados y su org la verifica el Core;** la org/identidad que el callback afirma es no confiable. **ALTO** — async entrante es alcanzable por atacante.
10. **(8) El re-chequeo asíncrono pre-disparo lo ejecuta Core / mediador controlado por Core con lectura autoritativa fresca** (revocación, versión de policy), no auto-chequeo de la extensión ni snapshot. **MEDIO-ALTO.**
11. **(10) Aislamiento por-solicitud (sin estado mutable cross-tenant) para extensiones multi-org, o proceso-por-tenant para extensiones con estado;** "no reutilizar memoria" debe significar "no co-residir con bug de keying". **MEDIO.**
12. **(5.3/5.4) Plegar "adapter" en la taxonomía:** detalle de implementación de una Tool/Integration, nunca entregable independiente no gobernado. **MEDIO.**
13. **(§5 nueva) Definir "Implementation" como término normativo** (artefacto concreto que realiza una capability, con identidad inmutable verificable), por ser el objeto del binding. **MEDIO.**
14. **(8 / open Q#11) Aflorar la consecuencia operativa:** sistemas externos sin atomicidad/idempotencia/compensación demostrables son deny-by-default para efectos compuestos/irreversibles hasta que exista el modelo de compensación. **MEDIO.**
15. **(10 / open Q#10) Acotar las integraciones opacas:** donde el Core no puede observar destino/efecto real, hay riesgo residual de confused deputy que debe aflorarse, limitarse en blast-radius, elevarse a aprobación y nunca tratarse como plenamente gobernado. **MEDIO.**

## 14. Veredicto final

## `APTO PARA V0.2 CON CAMBIOS` — condicionado

**Por qué APTO (y no rediseño):** v0.2 resolvió los problemas estructurales que harían inviable la versión anterior — taxonomía desambiguada y no circular, Capability ≠ token Object-Capability (explícito), frontera de enforcement del Core, no-efectos-ambientales, manifest no confiable, resolución ligada a implementación exacta + binding, identidad de artefacto inmutable, async gobernado, custodia de credenciales por Core, tenancy exhaustivo, 20 invariantes. **La estructura es correcta y el contrato tiene dientes en casi todo.** Lo que queda son *tightenings*: definir un término de carga ("componente controlado por Core"), enraizar el taint en el Core en vez de auto-reportarlo, endurecer escotillas ("único" enforcement point, "material limitado" para credenciales amplias, excepción de versión vulnerable, auth de callbacks) y verificar el artefacto en el momento del efecto. Nada de eso es reestructurar.

**Condición de seguridad (importante):** la garantía de seguridad **para extensiones no confiables** es **condicional** a que las primitivas diferidas —aislamiento/sandboxing (Q#3/#8), attestation (Q#5) y mediación de credenciales— se traten como **precondiciones bloqueantes**, no como preguntas abiertas. Mientras no existan, los invariantes 8/9/13/19 se cumplen por buena voluntad de la extensión, y el modelo de amenaza declarado (código no confiable + credenciales de servicio amplias) **no está cubierto solo por este contrato.** Con los cambios 1-4 y esa condición explícita, RFC-0006 pasa de ser una declaración de intenciones a un contrato construible.

**Lo que haría ya:** cambios 1-4 antes de aprobar v0.2, y reclasificar Q#3/#5/#8 como dependencias bloqueantes. El núcleo es el cambio 1 (definir "componente controlado por Core"): es el término del que cuelga toda la frontera, y sin definirlo el resto del documento descansa sobre una palabra elástica.

---

### Nota sobre la serie

v0.2 confirma que la deuda raíz es transversal y mecánica, no documental: los tres mecanismos que sostienen a RFC-0004, 0005 y 0006 siguen siendo —
1. **Decision Binding infalsificable** ligado a identidad+solicitud (RFC-0003),
2. **Confinamiento/mediación de credenciales y efectos por el Core** (RFC-0006 ya lo *contrata*; falta el sustrato de aislamiento/attestation),
3. **Autorización conjuntiva + estampado de taint por el Core** (RFC-0005 / RFC-0006).

RFC-0006 v0.2 es el primero que **contrata** correctamente el punto 2; lo que le falta es que el sustrato (aislamiento, attestation) exista y que "componente controlado por Core" esté definido. El camino crítico sigue siendo mecanizar esos tres, no escribir más RFCs.

# Revisión externa de RFC-0002

- **RFC revisado:** RFC-0002 — Kern Logical Architecture
- **Fuente:** Claude
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---He leÃ­do el RFC-0002 completo. Es claramente el mejor de los tres: tiene huesos reales (fronteras de confianza, "el agente propone / la tool ejecuta", el provider que no promete equivalencia conductual). Pero como pieza que va a gobernar ejecuciÃ³n sobre ERP, correo y CRM durante diez aÃ±os, tiene **un error de modelo en la raÃ­z y al menos tres bypasses de seguridad concretos**. No es aprobable tal cual.

---

## 1. Dependencias circulares y direcciones mal definidas

El fallo fundacional estÃ¡ en el diagrama de la secciÃ³n 5. Dibujas cuatro planos en cascada vertical: Experience â†’ Orchestration â†’ **Control** â†’ Execution. Eso convierte al Control Plane en una **capa intermedia**, cuando Policy, Identity, Audit y Registry son **transversales** (cross-cutting), no una capa.

Consecuencias directas:

- **Tool Engine vive en Execution (lÃ­nea 117) pero debe invocar Policy y Audit, que estÃ¡n en Control.** Es decir, Execution depende *hacia arriba* de Control. El flujo de la secciÃ³n 8 lo confirma: paso 8 (Tool Engine) â†’ paso 9 (Policy Engine). Las flechas del diagrama solo van hacia abajo. El modelo se contradice a sÃ­ mismo.
- **Extension Lifecycle (Control) instala providers, runtimes y tools, que son Execution.** Control â†’ Execution hacia abajo. Sumado a lo anterior, tienes **acoplamiento bidireccional Control â†” Execution = ciclo a nivel de plano.**
- **Context Assembly (Orchestration) consume Knowledge (Execution) y Registry (Control).** La cascada limpia del diagrama no se sostiene: Orchestration depende de Execution saltÃ¡ndose Control.
- **Knowledge Engine (Execution) debe aplicar polÃ­ticas org (Control)** â†’ otra dependencia ascendente.

El problema raÃ­z: el documento **confunde "capa" (direcciÃ³n de dependencia) con "categorÃ­a" (tipo de responsabilidad)**. Control no es una capa por la que se pasa; es un conjunto de contratos que todos consultan.

## 2. Motores a fusionar, dividir o renombrar

- **AI Provider Engine (7.8) y Runtime Engine (7.9) se solapan y colapsan en el caso remoto.** Ambos gestionan capabilities, lÃ­mites, disponibilidad. Para vLLM local: runtime = servidor, provider = contrato. Para Anthropic/OpenAI: el API **es** provider y runtime a la vez. Tal como estÃ¡n, pelearÃ¡n por "capabilities" y "limits". Renombrar y delimitar: Provider = contrato lÃ³gico de interacciÃ³n con el modelo; Runtime = sustrato fÃ­sico de ejecuciÃ³n; y declarar que en proveedores hosted el Runtime es un adaptador opaco.
- **Registry and Capability Engine (7.3) mezcla catÃ¡logo pasivo con selecciÃ³n activa.** "El sistema debe seleccionar componentes por capacidades" es **orquestaciÃ³n**, no registro. Un registry que decide se convierte en imÃ¡n de control-flow. Separar Registry (estado) de Capability Resolution (decisiÃ³n, junto a Orchestration).
- **Audit and Observability (7.11) son dos cosas con requisitos opuestos.** Audit = append-only, tamper-evident, retenciÃ³n legal, acceso restringido. Observability = telemetrÃ­a muestreable y lossy. Fusionarlas hace que o sobre-asegures mÃ©tricas o **infra-asegures la auditorÃ­a**. DivÃ­delas.
- **Context Assembly, Execution Coordination, Session Lifecycle (lÃ­neas 105-106) y Configuration (lÃ­nea 112) aparecen en el diagrama y NO se definen en la secciÃ³n 7.** Context Assembly es ademÃ¡s el motor mÃ¡s crÃ­tico de seguridad (ver punto 4) y tiene cero contrato. DefÃ­nelos o elimÃ­nalos.
- **Agent Engine vs Workflow Engine** comparten estado, resultados, aprobaciones y ejecuciÃ³n sin substrato comÃºn definido â†’ dos caminos de ejecuciÃ³n que pueden divergir en postura de seguridad (ver punto 4).

## 3. Riesgo de Core inflado

- **El Control Plane acumula NUEVE responsabilidades** (Identity, Orgs, Policy, Capability, Registry, Configuration, Audit, Observability, Extension Lifecycle). Es el Core de facto y es enorme. El manifiesto 6.5 pedÃ­a Core pequeÃ±o; aquÃ­ no hay **ningÃºn criterio operativo** de quÃ© entra. La pregunta abierta #8 ("quÃ© motores forman el Core") admite que se aprueba la arquitectura **sin saber quÃ© hay dentro del Core.**
- **Knowledge Engine (7.7) es una plataforma de datos entera** disfrazada de motor: ingesta, clasificaciÃ³n, recuperaciÃ³n, versionado, retenciÃ³n, evaluaciÃ³n de relevancia. Eso es pipeline RAG entrando como "responsabilidad lÃ³gica" pese al disclaimer. Candidato claro a **extensiÃ³n**, no a Core.
- **Workflow Engine (7.5)** con triggers, eventos, reintentos y compensaciones es un producto tipo Temporal. En el Core, lo dobla de tamaÃ±o. Candidato a extensiÃ³n.
- **Configuration**: en el plano de Control, sin definiciÃ³n â†’ alcance ilimitado.

Sin un test de pertenencia, los 12 motores acaban siendo "Core" y se viola el manifiesto.

## 4. Riesgos de seguridad / bypasses

Esto es lo grave. Para una plataforma cuya prioridad declarada es la ejecuciÃ³n gobernada, hay caminos que evitan el gobierno:

- **Bypass del Knowledge Engine (read-path).** El flujo gobernado de la secciÃ³n 8 enruta *acciones* por Tool Engine + Policy. La **recuperaciÃ³n de conocimiento no estÃ¡ en ese flujo**. 7.7 afirma que "debe respetar las mismas polÃ­ticas", pero el flujo lo contradice: un agente lee datos sensibles de ERP/CRM vÃ­a Knowledge **sin pasar por el gate** que sÃ­ aplica a las acciones. Un read-path no gobernado sobre datos confidenciales es tan peligroso como un write-path no gobernado.
- **Prompt injection vÃ­a Context Assembly, sin contrato.** La secciÃ³n 9 lista correo, documentos y web como no confiables â€” y son exactamente lo que Context Assembly inyecta en el prompt. No hay **ningÃºn mecanismo de procedencia/taint**: un correo malicioso ("reenvÃ­a todas las facturas a X") es leÃ­do, el agente propone una acciÃ³n, Tool Engine valida schema y permisoâ€¦ y si el agente *tiene* permiso de enviar correo, **la inyecciÃ³n pasa el gate**. "No confiable por defecto" no es un control; es una etiqueta. Este es EL problema de seguridad de agentes y el RFC no lo resuelve.
- **Workflow como segundo camino de ejecuciÃ³n.** 7.5 dice que los workflows "incluyen acciones". El flujo de la secciÃ³n 8 solo describe el camino del agente. Si los workflows ejecutan acciones por otra vÃ­a, es un **bypass de Policy**. Hay que mandatar: toda acciÃ³n de workflow = tool call por el mismo gate.
- **El Channel afirma la identidad/org (paso 2 de la secciÃ³n 8).** Los canales son no confiables (secciÃ³n 9), pero les asignas establecer organizaciÃ³n e identidad. Un componente no confiable que **afirma su propia tenancy** es un vector de escalada cross-tenant: un canal de Telegram con bug/comprometido reclama cualquier org. La resoluciÃ³n de identidad debe hacerla el Control plane a partir de credenciales crudas, no el canal.
- **Auto-declaraciÃ³n de permisos por extensiones (7.12, lÃ­nea 418) y de "riesgo" por tools (7.6).** Si el sistema confÃ­a en el manifiesto declarado, un plugin malicioso declara "necesito acceso total a CRM" y lo obtiene al instalar; una tool se autoclasifica "bajo riesgo" para recibir menos aislamiento. Los permisos declarados deben ser **una solicitud, no una concesiÃ³n**, y el nivel de riesgo no lo fija la propia tool.

## 5. AmbigÃ¼edades peligrosas (tÃ©rminos)

- **"AcciÃ³n relevante"** (1, 6.7, 12): toda la auditorÃ­a y el gobierno cuelgan de esto y no se define. El que quiera saltarse el audit dirÃ¡ "no es relevante". Mismo agujero que el RFC-0000.
- **"PolÃ­tica"**: el Policy Engine hace autorizaciÃ³n + lÃ­mites de coste + restricciones de datos + enrutado de aprobaciones. Tres modelos de evaluaciÃ³n distintos bajo una palabra. Y no hay **orden de evaluaciÃ³n ni resoluciÃ³n de conflictos** (Â¿transform antes o despuÃ©s de deny? Â¿quÃ© gana si dos polÃ­ticas chocan?). Indeterminista.
- **"Capability"**: se usa para features de modelo (tool calling, contexto largo), para estados de disponibilidad, y para "aislamiento" y "aprobaciÃ³n humana" (lÃ­neas 214-215) â€” que **no son capacidades de modelo**, son propiedades de seguridad/polÃ­tica. Category error que envenena la negociaciÃ³n de capacidades.
- **"Tool" vs "plugin" vs "extension" vs "integraciÃ³n"**: 7.12 dice que una extensiÃ³n "implementa provider, runtime, tool, plugin, channelâ€¦". Entonces Â¿un plugin es una extensiÃ³n que implementa una tool? La taxonomÃ­a es recursiva y sin fronteras. Importa porque define permisos y aislamiento.
- **"Registro"**: significa Registry (catÃ¡logo, 7.3) y a la vez log de auditorÃ­a (7.11). Misma palabra, dos subsistemas opuestos. GenerarÃ¡ confusiÃ³n real en los contratos.
- **"Runtime"**: "el entorno que ejecuta modelos" pero tambiÃ©n "un servicio remoto" (lÃ­nea 343) â†’ un API remoto es un runtime, y entonces se solapa con Provider.
- **"Aislamiento proporcional al riesgo"**: sin niveles de aislamiento definidos ni quÃ© se aÃ­sla (Â¿proceso? Â¿red? Â¿datos? Â¿tenant?).

## 6. Multiempresa y segregaciÃ³n

- **La tenancy vive en un solo motor (Identity/Org, 7.1), pero debe aplicarla TODO motor.** Knowledge debe filtrar por org, Registry debe acotar componentes por org, Audit debe segregar, los resultados de tools no pueden filtrar cross-org. El RFC menciona "segregaciÃ³n organizativa" una vez (secciÃ³n 9) sin mecanismo. Tenancy como tarea de un motor = fuga cross-tenant esperando a ocurrir.
- **Recursos compartidos.** Registry registra providers/runtimes/models: Â¿son compartidos entre orgs o por-org? Si un runtime/modelo es compartido, Â¿la inferencia de la org A se filtra a la B vÃ­a cachÃ©/contexto compartido? Sin respuesta.
- **Knowledge cross-tenant.** Los vector stores filtran entre tenants si no se particionan. No hay requisito de particiÃ³n por org.
- **Sin jerarquÃ­a de organizaciones** (departamentos, filiales, delegaciÃ³n) â€” algo que toda empresa pide.

## 7. EvoluciÃ³n: versionado, compatibilidad, estado, migraciÃ³n, observabilidad

- **"Contratos versionados" se afirma (3.2) pero no hay esquema de versionado, polÃ­tica de compatibilidad ni de deprecaciÃ³n.** Mismo hueco que el manifiesto. La pregunta abierta #7 lo confirma sin resolver.
- **Estado de agentes: mandato sin especificaciÃ³n.** 7.4 y la secciÃ³n 10 exigen estado migrable/restaurable; la pregunta abierta #6 admite que **no se sabe cÃ³mo representar el estado transferible**. La evoluciÃ³n del esquema de memoria/estado entre versiones (y entre cambios de modelo/provider) es el problema mÃ¡s difÃ­cil a diez aÃ±os y estÃ¡ como pregunta abierta, no como contrato.
- **EvoluciÃ³n del esquema de capabilities y de eventos de workflow**: sin historia de forward-compat. Cuando emerja una modalidad nueva, Â¿quÃ© pasa con los contratos viejos?
- **MigraciÃ³n entre cambios de contrato del Core en instalaciones con estado persistido**: la secciÃ³n 11 habla de topologÃ­as de despliegue, no de migraciÃ³n de versiÃ³n con estado vivo.

## 8. Arquitectura correcta vs lista de deseos sin contrato

**Arquitectura lÃ³gica correcta (consÃ©rvala):**
- Las cuatro fronteras de confianza (secciÃ³n 9) â€” direcciÃ³n correcta.
- "El agente propone, no ejecuta" (6.2, 7.4, 8) â€” correcto y central.
- Tool Engine como Ãºnica frontera de acciÃ³n externa (7.6) â€” correcto *si* se cierran los caminos de Knowledge y Workflow.
- Provider que no promete equivalencia conductual (7.8) â€” honesto.
- "Las extensiones dependen del Core, no al revÃ©s" (6.5) â€” intenciÃ³n correcta.
- SoberanÃ­a de datos / la org posee el estado (10) â€” direcciÃ³n correcta.

**Lista de deseos sin contrato (caja con etiqueta):**
- Context Assembly, Execution Coordination, Session Lifecycle, Configuration â€” nombrados, sin definiciÃ³n.
- Modelo de capabilities y negociaciÃ³n â€” diferido (open Q#2).
- Aislamiento/sandboxing â€” diferido (open Q#4).
- Modelo de permisos â€” diferido (open Q#5).
- Estado transferible de agente â€” diferido (open Q#6).
- QuÃ© motores son Core â€” diferido (open Q#8).
- Modelo de evaluaciÃ³n de polÃ­ticas â€” sin contrato.
- Versionado/compatibilidad â€” afirmado, indefinido.

Aproximadamente la mitad es delimitaciÃ³n lÃ³gica sÃ³lida; la otra mitad es caja etiquetada pendiente de contrato. Eso serÃ­a aceptable para un RFC de arquitectura *lÃ³gica* **si fuera honesto sobre lo diferido** â€” y en parte lo es vÃ­a preguntas abiertas. El problema: las preguntas abiertas #3, #4 y #5 son **decisiones de seguridad de carga** (aprobaciones por defecto, aislamiento, modelo de permisos). Es decir, la postura de seguridad estÃ¡ indefinida mientras se vende "ejecuciÃ³n gobernada" como prioridad.

## 9. Cambios concretos (priorizados por impacto)

1. **(Sec 5 y 6) Redibujar Control como plano transversal, no como capa intermedia.** Regla Ãºnica: todo plano depende de los contratos del Control plane; el Control plane no depende de ninguno. Elimina el ciclo Controlâ†”Execution. *MÃ¡ximo impacto.*
2. **(Sec 7 nuevo + 8/9) Definir Context Assembly como motor con contrato de procedencia/taint:** etiquetar trusted/untrusted y propagar el taint hasta Tool Engine para que Policy exija aprobaciÃ³n en acciones derivadas de entrada no confiable. Cierra prompt-injection â†’ acciÃ³n.
3. **(Sec 7.7 y 8) Meter la recuperaciÃ³n de conocimiento en el flujo gobernado** con gate de Policy sobre la *lectura*. Cierra el bypass del read-path de datos sensibles.
4. **(Sec 7.10 y 8 paso 2) Mover la resoluciÃ³n de identidad/org del Channel al Control Plane.** El canal aporta credenciales; Identity resuelve la tenancy. Cierra escalada cross-tenant.
5. **(Sec 7.5 y 8) Mandatar que toda acciÃ³n de Workflow pase por Tool Engine + Policy**, declarando explÃ­citamente que no hay segundo camino de ejecuciÃ³n.
6. **(Sec 1, 6.7, 12) Definir "acciÃ³n relevante"** con criterio fail-closed (toda operaciÃ³n que cambie estado externo, mueva datos fuera de un lÃ­mite org o gaste presupuesto; si hay duda, es relevante).
7. **(Sec 7.8/7.9) Delimitar Provider vs Runtime** y declarar el Runtime opaco/nulo para proveedores hosted; el provider declara capabilities, el runtime confirma disponibilidad.
8. **(Sec 7.3) Separar Registry (catÃ¡logo) de Capability Resolution (selecciÃ³n)** y sacar "aislamiento" y "aprobaciÃ³n humana" de la lista de capabilities â€” son propiedades de polÃ­tica, no de modelo.
9. **(Sec 7.11) Dividir Audit de Observability** por requisitos de integridad, acceso y retenciÃ³n.
10. **(Sec 7, transversal) Hacer la tenancy un contexto obligatorio en todos los motores**; aÃ±adir particiÃ³n por org en Knowledge y aislamiento de recursos compartidos (modelos/runtimes/cachÃ©s) entre orgs.
11. **(Sec 7.2) Desambiguar "Policy"**: separar autorizaciÃ³n, gobernanza de recursos y restricciÃ³n de datos; y definir orden de evaluaciÃ³n y resoluciÃ³n de conflictos.
12. **(Sec 7.12 y 9) Permisos declarados = solicitud, no concesiÃ³n**; nombrar la autoridad que aprueba (Operator + Policy) y quiÃ©n fija el nivel de riesgo de una tool (no la tool).
13. **(Sec 3.2 / 7.12 nuevo) Definir contrato de versionado y compatibilidad** (semver de contratos, ventana de retrocompat, polÃ­tica de deprecaciÃ³n), no solo afirmar "contratos versionados".
14. **(Sec 5 / open Q#8) AÃ±adir el criterio operativo de pertenencia al Core** y marcar quÃ© motores son Core v1 vs extensiÃ³n (candidatos a extensiÃ³n: Workflow, Knowledge, Channel).
15. **(Sec 7, lÃ­neas 105-106) Definir o eliminar Context Assembly, Execution Coordination, Session Lifecycle y Configuration.** Lo no definido es alcance ilimitado.

## 10. Veredicto final

# `NECESITA REDISEÃ‘O PARCIAL`

**Por quÃ© no es `APTO PARA V0.2 CON CAMBIOS`:** el modelo de planos/dependencias estÃ¡ invertido (Control debe ser transversal, no capa) y hay **tres bypasses de gobierno concretos** (read-path de Knowledge, action-path de Workflow, identidad afirmada por el Channel) mÃ¡s el agujero de prompt-injection en Context Assembly. Para una plataforma cuya prioridad declarada es ejecutar acciones gobernadas sobre ERP/correo/CRM, esto no se arregla editando prosa: hay que rehacer el modelo de dependencias y el flujo de gobierno (cambios 1-5). No es ediciÃ³n, es rediseÃ±o.

**Por quÃ© no es `NO APTO`:** los huesos son correctos y rescatables â€” fronteras de confianza, "agente propone / tool ejecuta", honestidad del provider, "extensiones dependen del Core". No hay que tirarlo; hay que reparar el esqueleto direccional y cerrar los caminos de bypass, y entonces sÃ­ va a v0.2.

**Lo que harÃ­a ya:** cambios 1-5 antes que nada (modelo direccional + los cuatro bypasses). Son los que separan "infraestructura gobernada" de "demo que parece gobernada hasta el primer correo malicioso".

Â¿Te preparo el rediseÃ±o del diagrama de planos con Control como transversal (cambio 1) y el contrato de taint de Context Assembly (cambio 2)? Son los dos que desbloquean el resto.

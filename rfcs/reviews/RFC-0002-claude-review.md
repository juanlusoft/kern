# Revisión externa de RFC-0002

- **RFC revisado:** RFC-0002 — Kern Logical Architecture
- **Fuente:** Claude
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---He leído el RFC-0002 completo. Es claramente el mejor de los tres: tiene huesos reales (fronteras de confianza, "el agente propone / la tool ejecuta", el provider que no promete equivalencia conductual). Pero como pieza que va a gobernar ejecución sobre ERP, correo y CRM durante diez años, tiene **un error de modelo en la raíz y al menos tres bypasses de seguridad concretos**. No es aprobable tal cual.

---

## 1. Dependencias circulares y direcciones mal definidas

El fallo fundacional está en el diagrama de la sección 5. Dibujas cuatro planos en cascada vertical: Experience → Orchestration → **Control** → Execution. Eso convierte al Control Plane en una **capa intermedia**, cuando Policy, Identity, Audit y Registry son **transversales** (cross-cutting), no una capa.

Consecuencias directas:

- **Tool Engine vive en Execution (línea 117) pero debe invocar Policy y Audit, que están en Control.** Es decir, Execution depende *hacia arriba* de Control. El flujo de la sección 8 lo confirma: paso 8 (Tool Engine) → paso 9 (Policy Engine). Las flechas del diagrama solo van hacia abajo. El modelo se contradice a sí mismo.
- **Extension Lifecycle (Control) instala providers, runtimes y tools, que son Execution.** Control → Execution hacia abajo. Sumado a lo anterior, tienes **acoplamiento bidireccional Control ↔ Execution = ciclo a nivel de plano.**
- **Context Assembly (Orchestration) consume Knowledge (Execution) y Registry (Control).** La cascada limpia del diagrama no se sostiene: Orchestration depende de Execution saltándose Control.
- **Knowledge Engine (Execution) debe aplicar políticas org (Control)** → otra dependencia ascendente.

El problema raíz: el documento **confunde "capa" (dirección de dependencia) con "categoría" (tipo de responsabilidad)**. Control no es una capa por la que se pasa; es un conjunto de contratos que todos consultan.

## 2. Motores a fusionar, dividir o renombrar

- **AI Provider Engine (7.8) y Runtime Engine (7.9) se solapan y colapsan en el caso remoto.** Ambos gestionan capabilities, límites, disponibilidad. Para vLLM local: runtime = servidor, provider = contrato. Para Anthropic/OpenAI: el API **es** provider y runtime a la vez. Tal como están, pelearán por "capabilities" y "limits". Renombrar y delimitar: Provider = contrato lógico de interacción con el modelo; Runtime = sustrato físico de ejecución; y declarar que en proveedores hosted el Runtime es un adaptador opaco.
- **Registry and Capability Engine (7.3) mezcla catálogo pasivo con selección activa.** "El sistema debe seleccionar componentes por capacidades" es **orquestación**, no registro. Un registry que decide se convierte en imán de control-flow. Separar Registry (estado) de Capability Resolution (decisión, junto a Orchestration).
- **Audit and Observability (7.11) son dos cosas con requisitos opuestos.** Audit = append-only, tamper-evident, retención legal, acceso restringido. Observability = telemetría muestreable y lossy. Fusionarlas hace que o sobre-asegures métricas o **infra-asegures la auditoría**. Divídelas.
- **Context Assembly, Execution Coordination, Session Lifecycle (líneas 105-106) y Configuration (línea 112) aparecen en el diagrama y NO se definen en la sección 7.** Context Assembly es además el motor más crítico de seguridad (ver punto 4) y tiene cero contrato. Defínelos o elimínalos.
- **Agent Engine vs Workflow Engine** comparten estado, resultados, aprobaciones y ejecución sin substrato común definido → dos caminos de ejecución que pueden divergir en postura de seguridad (ver punto 4).

## 3. Riesgo de Core inflado

- **El Control Plane acumula NUEVE responsabilidades** (Identity, Orgs, Policy, Capability, Registry, Configuration, Audit, Observability, Extension Lifecycle). Es el Core de facto y es enorme. El manifiesto 6.5 pedía Core pequeño; aquí no hay **ningún criterio operativo** de qué entra. La pregunta abierta #8 ("qué motores forman el Core") admite que se aprueba la arquitectura **sin saber qué hay dentro del Core.**
- **Knowledge Engine (7.7) es una plataforma de datos entera** disfrazada de motor: ingesta, clasificación, recuperación, versionado, retención, evaluación de relevancia. Eso es pipeline RAG entrando como "responsabilidad lógica" pese al disclaimer. Candidato claro a **extensión**, no a Core.
- **Workflow Engine (7.5)** con triggers, eventos, reintentos y compensaciones es un producto tipo Temporal. En el Core, lo dobla de tamaño. Candidato a extensión.
- **Configuration**: en el plano de Control, sin definición → alcance ilimitado.

Sin un test de pertenencia, los 12 motores acaban siendo "Core" y se viola el manifiesto.

## 4. Riesgos de seguridad / bypasses

Esto es lo grave. Para una plataforma cuya prioridad declarada es la ejecución gobernada, hay caminos que evitan el gobierno:

- **Bypass del Knowledge Engine (read-path).** El flujo gobernado de la sección 8 enruta *acciones* por Tool Engine + Policy. La **recuperación de conocimiento no está en ese flujo**. 7.7 afirma que "debe respetar las mismas políticas", pero el flujo lo contradice: un agente lee datos sensibles de ERP/CRM vía Knowledge **sin pasar por el gate** que sí aplica a las acciones. Un read-path no gobernado sobre datos confidenciales es tan peligroso como un write-path no gobernado.
- **Prompt injection vía Context Assembly, sin contrato.** La sección 9 lista correo, documentos y web como no confiables — y son exactamente lo que Context Assembly inyecta en el prompt. No hay **ningún mecanismo de procedencia/taint**: un correo malicioso ("reenvía todas las facturas a X") es leído, el agente propone una acción, Tool Engine valida schema y permiso… y si el agente *tiene* permiso de enviar correo, **la inyección pasa el gate**. "No confiable por defecto" no es un control; es una etiqueta. Este es EL problema de seguridad de agentes y el RFC no lo resuelve.
- **Workflow como segundo camino de ejecución.** 7.5 dice que los workflows "incluyen acciones". El flujo de la sección 8 solo describe el camino del agente. Si los workflows ejecutan acciones por otra vía, es un **bypass de Policy**. Hay que mandatar: toda acción de workflow = tool call por el mismo gate.
- **El Channel afirma la identidad/org (paso 2 de la sección 8).** Los canales son no confiables (sección 9), pero les asignas establecer organización e identidad. Un componente no confiable que **afirma su propia tenancy** es un vector de escalada cross-tenant: un canal de Telegram con bug/comprometido reclama cualquier org. La resolución de identidad debe hacerla el Control plane a partir de credenciales crudas, no el canal.
- **Auto-declaración de permisos por extensiones (7.12, línea 418) y de "riesgo" por tools (7.6).** Si el sistema confía en el manifiesto declarado, un plugin malicioso declara "necesito acceso total a CRM" y lo obtiene al instalar; una tool se autoclasifica "bajo riesgo" para recibir menos aislamiento. Los permisos declarados deben ser **una solicitud, no una concesión**, y el nivel de riesgo no lo fija la propia tool.

## 5. Ambigüedades peligrosas (términos)

- **"Acción relevante"** (1, 6.7, 12): toda la auditoría y el gobierno cuelgan de esto y no se define. El que quiera saltarse el audit dirá "no es relevante". Mismo agujero que el RFC-0000.
- **"Política"**: el Policy Engine hace autorización + límites de coste + restricciones de datos + enrutado de aprobaciones. Tres modelos de evaluación distintos bajo una palabra. Y no hay **orden de evaluación ni resolución de conflictos** (¿transform antes o después de deny? ¿qué gana si dos políticas chocan?). Indeterminista.
- **"Capability"**: se usa para features de modelo (tool calling, contexto largo), para estados de disponibilidad, y para "aislamiento" y "aprobación humana" (líneas 214-215) — que **no son capacidades de modelo**, son propiedades de seguridad/política. Category error que envenena la negociación de capacidades.
- **"Tool" vs "plugin" vs "extension" vs "integración"**: 7.12 dice que una extensión "implementa provider, runtime, tool, plugin, channel…". Entonces ¿un plugin es una extensión que implementa una tool? La taxonomía es recursiva y sin fronteras. Importa porque define permisos y aislamiento.
- **"Registro"**: significa Registry (catálogo, 7.3) y a la vez log de auditoría (7.11). Misma palabra, dos subsistemas opuestos. Generará confusión real en los contratos.
- **"Runtime"**: "el entorno que ejecuta modelos" pero también "un servicio remoto" (línea 343) → un API remoto es un runtime, y entonces se solapa con Provider.
- **"Aislamiento proporcional al riesgo"**: sin niveles de aislamiento definidos ni qué se aísla (¿proceso? ¿red? ¿datos? ¿tenant?).

## 6. Multiempresa y segregación

- **La tenancy vive en un solo motor (Identity/Org, 7.1), pero debe aplicarla TODO motor.** Knowledge debe filtrar por org, Registry debe acotar componentes por org, Audit debe segregar, los resultados de tools no pueden filtrar cross-org. El RFC menciona "segregación organizativa" una vez (sección 9) sin mecanismo. Tenancy como tarea de un motor = fuga cross-tenant esperando a ocurrir.
- **Recursos compartidos.** Registry registra providers/runtimes/models: ¿son compartidos entre orgs o por-org? Si un runtime/modelo es compartido, ¿la inferencia de la org A se filtra a la B vía caché/contexto compartido? Sin respuesta.
- **Knowledge cross-tenant.** Los vector stores filtran entre tenants si no se particionan. No hay requisito de partición por org.
- **Sin jerarquía de organizaciones** (departamentos, filiales, delegación) — algo que toda empresa pide.

## 7. Evolución: versionado, compatibilidad, estado, migración, observabilidad

- **"Contratos versionados" se afirma (3.2) pero no hay esquema de versionado, política de compatibilidad ni de deprecación.** Mismo hueco que el manifiesto. La pregunta abierta #7 lo confirma sin resolver.
- **Estado de agentes: mandato sin especificación.** 7.4 y la sección 10 exigen estado migrable/restaurable; la pregunta abierta #6 admite que **no se sabe cómo representar el estado transferible**. La evolución del esquema de memoria/estado entre versiones (y entre cambios de modelo/provider) es el problema más difícil a diez años y está como pregunta abierta, no como contrato.
- **Evolución del esquema de capabilities y de eventos de workflow**: sin historia de forward-compat. Cuando emerja una modalidad nueva, ¿qué pasa con los contratos viejos?
- **Migración entre cambios de contrato del Core en instalaciones con estado persistido**: la sección 11 habla de topologías de despliegue, no de migración de versión con estado vivo.

## 8. Arquitectura correcta vs lista de deseos sin contrato

**Arquitectura lógica correcta (consérvala):**
- Las cuatro fronteras de confianza (sección 9) — dirección correcta.
- "El agente propone, no ejecuta" (6.2, 7.4, 8) — correcto y central.
- Tool Engine como única frontera de acción externa (7.6) — correcto *si* se cierran los caminos de Knowledge y Workflow.
- Provider que no promete equivalencia conductual (7.8) — honesto.
- "Las extensiones dependen del Core, no al revés" (6.5) — intención correcta.
- Soberanía de datos / la org posee el estado (10) — dirección correcta.

**Lista de deseos sin contrato (caja con etiqueta):**
- Context Assembly, Execution Coordination, Session Lifecycle, Configuration — nombrados, sin definición.
- Modelo de capabilities y negociación — diferido (open Q#2).
- Aislamiento/sandboxing — diferido (open Q#4).
- Modelo de permisos — diferido (open Q#5).
- Estado transferible de agente — diferido (open Q#6).
- Qué motores son Core — diferido (open Q#8).
- Modelo de evaluación de políticas — sin contrato.
- Versionado/compatibilidad — afirmado, indefinido.

Aproximadamente la mitad es delimitación lógica sólida; la otra mitad es caja etiquetada pendiente de contrato. Eso sería aceptable para un RFC de arquitectura *lógica* **si fuera honesto sobre lo diferido** — y en parte lo es vía preguntas abiertas. El problema: las preguntas abiertas #3, #4 y #5 son **decisiones de seguridad de carga** (aprobaciones por defecto, aislamiento, modelo de permisos). Es decir, la postura de seguridad está indefinida mientras se vende "ejecución gobernada" como prioridad.

## 9. Cambios concretos (priorizados por impacto)

1. **(Sec 5 y 6) Redibujar Control como plano transversal, no como capa intermedia.** Regla única: todo plano depende de los contratos del Control plane; el Control plane no depende de ninguno. Elimina el ciclo Control↔Execution. *Máximo impacto.*
2. **(Sec 7 nuevo + 8/9) Definir Context Assembly como motor con contrato de procedencia/taint:** etiquetar trusted/untrusted y propagar el taint hasta Tool Engine para que Policy exija aprobación en acciones derivadas de entrada no confiable. Cierra prompt-injection → acción.
3. **(Sec 7.7 y 8) Meter la recuperación de conocimiento en el flujo gobernado** con gate de Policy sobre la *lectura*. Cierra el bypass del read-path de datos sensibles.
4. **(Sec 7.10 y 8 paso 2) Mover la resolución de identidad/org del Channel al Control Plane.** El canal aporta credenciales; Identity resuelve la tenancy. Cierra escalada cross-tenant.
5. **(Sec 7.5 y 8) Mandatar que toda acción de Workflow pase por Tool Engine + Policy**, declarando explícitamente que no hay segundo camino de ejecución.
6. **(Sec 1, 6.7, 12) Definir "acción relevante"** con criterio fail-closed (toda operación que cambie estado externo, mueva datos fuera de un límite org o gaste presupuesto; si hay duda, es relevante).
7. **(Sec 7.8/7.9) Delimitar Provider vs Runtime** y declarar el Runtime opaco/nulo para proveedores hosted; el provider declara capabilities, el runtime confirma disponibilidad.
8. **(Sec 7.3) Separar Registry (catálogo) de Capability Resolution (selección)** y sacar "aislamiento" y "aprobación humana" de la lista de capabilities — son propiedades de política, no de modelo.
9. **(Sec 7.11) Dividir Audit de Observability** por requisitos de integridad, acceso y retención.
10. **(Sec 7, transversal) Hacer la tenancy un contexto obligatorio en todos los motores**; añadir partición por org en Knowledge y aislamiento de recursos compartidos (modelos/runtimes/cachés) entre orgs.
11. **(Sec 7.2) Desambiguar "Policy"**: separar autorización, gobernanza de recursos y restricción de datos; y definir orden de evaluación y resolución de conflictos.
12. **(Sec 7.12 y 9) Permisos declarados = solicitud, no concesión**; nombrar la autoridad que aprueba (Operator + Policy) y quién fija el nivel de riesgo de una tool (no la tool).
13. **(Sec 3.2 / 7.12 nuevo) Definir contrato de versionado y compatibilidad** (semver de contratos, ventana de retrocompat, política de deprecación), no solo afirmar "contratos versionados".
14. **(Sec 5 / open Q#8) Añadir el criterio operativo de pertenencia al Core** y marcar qué motores son Core v1 vs extensión (candidatos a extensión: Workflow, Knowledge, Channel).
15. **(Sec 7, líneas 105-106) Definir o eliminar Context Assembly, Execution Coordination, Session Lifecycle y Configuration.** Lo no definido es alcance ilimitado.

## 10. Veredicto final

# `NECESITA REDISEÑO PARCIAL`

**Por qué no es `APTO PARA V0.2 CON CAMBIOS`:** el modelo de planos/dependencias está invertido (Control debe ser transversal, no capa) y hay **tres bypasses de gobierno concretos** (read-path de Knowledge, action-path de Workflow, identidad afirmada por el Channel) más el agujero de prompt-injection en Context Assembly. Para una plataforma cuya prioridad declarada es ejecutar acciones gobernadas sobre ERP/correo/CRM, esto no se arregla editando prosa: hay que rehacer el modelo de dependencias y el flujo de gobierno (cambios 1-5). No es edición, es rediseño.

**Por qué no es `NO APTO`:** los huesos son correctos y rescatables — fronteras de confianza, "agente propone / tool ejecuta", honestidad del provider, "extensiones dependen del Core". No hay que tirarlo; hay que reparar el esqueleto direccional y cerrar los caminos de bypass, y entonces sí va a v0.2.

**Lo que haría ya:** cambios 1-5 antes que nada (modelo direccional + los cuatro bypasses). Son los que separan "infraestructura gobernada" de "demo que parece gobernada hasta el primer correo malicioso".

¿Te preparo el rediseño del diagrama de planos con Control como transversal (cambio 1) y el contrato de taint de Context Assembly (cambio 2)? Son los dos que desbloquean el resto.

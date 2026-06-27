---
title: Revisión de seguridad — RFC-0006 Capability, Tool and Extension Contract
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (plataformas de extensiones, plugin security, capability systems, API integrations, delegated authz, multi-tenancy, enforcement de efectos externos)
fecha: 2026-06-27
documento_revisado: RFC-0006 — Capability, Tool and Extension Contract (v0.1)
veredicto: NECESITA REDISEÑO PARCIAL
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Es una crítica técnica hostil, no una aprobación formal.

# Revisión de seguridad — RFC-0006 Capability, Tool and Extension Contract

Aviso de entrada: **este es el RFC más débil del tramo 0003-0006.** Es una lista de 12 invariantes correctos en intención pero **sin contrato detrás**. Donde RFC-0004 y RFC-0005 ganaron el "apto condicionado" porque tenían estructura real (tipos de identidad, categorías de decisión, reglas de composición), RFC-0006 **afirma** ("una extensión no puede auto-concederse autoridad", "una capability no puede ocultar subefectos", "credenciales amplias no son permisos globales") sin un solo mecanismo que lo imponga. Y es precisamente el RFC que gobierna la superficie más peligrosa: **código de terceros no confiable que sostiene credenciales de servicio amplias contra CRM/ERP/correo/facturación.**

## 1. Confusión de fronteras

- **Definiciones circulares.** 5.2: "una integration es una capability **o** una implementación que conecta...". Una integration es ¿descripción o implementación? Eso colapsa la distinción capability(descripción)/tool(implementación) sobre la que se apoya todo el RFC. ¿Cuándo algo es tool y cuándo integration? Ambas implementan capabilities; ambas pueden tocar sistemas externos (es el propósito del Tool Engine). Frontera indefinida → gobernanza indefinida.
- **Colisión de "provider" entre RFCs.** Aquí provider = "fuente que suministra implementación/artefacto" (proveedor de extensiones). En RFC-0002 provider = fuente de inferencia (AI Provider Engine). **Misma palabra, dos significados distintos** en documentos de seguridad encadenados. "Provider autorizado" significa cosas distintas según el RFC: confusión peligrosa garantizada.
- **Enforcement point genérico (5.4)** "la frontera donde Kern verifica...". ¿Cada tool es su propio enforcement point? Si sí, la tool se controla a sí misma (conflicto de interés). El RFC **no dice que el enforcement point sea propiedad del Core**, no de la extensión. Es el fallo raíz: si una extensión puede ser su propio punto de enforcement, los 12 invariantes son autocontrolados.
- **Registry ↔ resolution ↔ autorización sin vincular.** Separa registry (publica) de resolution (selecciona) (inv. 11, bien, heredado de RFC-0002), pero **nunca dice que estar en el registry ≠ disponible ≠ autorizado**. Publicar podría leerse como hacer resolvable.

## 2. Auto-concesión de autoridad / scope / consentimiento / credenciales

- **El manifest es auto-atestado y nadie verifica.** 5.3 el manifest "declara necesidades, riesgos, límites". Si una extensión declara "riesgo: bajo, efectos: solo-lectura" pero su tool escribe, **nada lo detecta**. No hay requisito de verificación independiente de efectos declarados vs reales. Es EL agujero de plugin security: manifest auto-declarado de bajo riesgo → infra-gateado → efectos amplios reales.
- **Consentimiento sin definir.** "La activación no implica consentimiento permanente" (7) y updates "nuevo consentimiento cuando corresponda" (6.3, 8). Pero **¿quién consiente, a qué scope, ligado cómo?** No se define el consentimiento como ligado a efectos declarados ni que enumere subefectos/destinos reales. Persiste el consentimiento general en la instalación que ya marqué en RFC-0004.
- **Sin contrato de credenciales.** 5.2 "una credencial externa no es capability ni autoridad" (bien) pero el RFC **no dice cómo una tool obtiene/sostiene credenciales externas ni quién las acota**. El confinamiento del efector (huecos de RFC-0004 #3 y RFC-0005 #14) **debería vivir aquí** —las tools/integrations son justo lo que sostiene la credencial amplia de CRM/ERP— y está completamente ausente.
- **Requisitos de capability auto-declarados.** 6.1 la capability declara "requisitos de identidad, scopes y delegación". Una capability hostil declara requisitos mínimos para pasar policy y su implementación hace más. Declaración ≠ enforcement.

## 3. Tool ocultando múltiples efectos bajo una capability inocua

- 6.2 + inv. 9 "no puede ocultar subefectos" + "las compuestas deben declarar sus subefectos" son **afirmaciones sin mecanismo de detección.** Una capability "leer ficha de cliente" que además dispara un webhook, envía un correo o llama a otra tool: ¿cómo lo sabe Kern? Confía en la auto-declaración honesta. Para terceros no confiables (el modelo de amenaza), la auto-declaración no vale nada.
- El control correcto **no es "declara tus subefectos"** sino **"no puedes producir un efecto que no esté mediado"**: la capability no tiene capacidad ambiental de salir a la red ni de invocar otra capability; todo efecto externo y toda invocación tool→tool re-entra al ciclo gobernado con su propio binding. Tal como está, inv. 6 ("ninguna ruta alternativa") es aspiración, no mecanismo.

## 4. Efectos compuestos / externos / irreversibles / asíncronos

- **Compuestos:** 6.3 exige binding para "efecto externo o irreversible" en singular. Un compuesto de 10 efectos externos bajo un binding = el agujero de agregación/ejecución parcial. Falta: cada subefecto gobernable liga individualmente, o el compuesto es atómico con idempotencia + compensación obligatorias.
- **Asíncronos: ausentes por completo.** Una tool que encola un job, programa un envío o registra un webhook produce efectos **después** de la validez del binding, fuera del ciclo, quizá tras una revocación. No hay contrato: los efectos asíncronos deben arrastrar un binding vigente, re-chequear revocación+policy en el momento de disparo y ser cancelables ante revocación. Para ERP/mensajería (intensivos en async) es un agujero enorme. 6.1 menciona "idempotencia, correlación... cuando correspondan" y nada del ciclo async.
- **Parcial/irreversible:** "idempotencia cuando correspondan" la hace opcional. Para efectos irreversibles debe ser **obligatoria**, con contrato de compensación; si no, un compuesto se completa a medias sin rollback.

## 5. Actualizaciones sin reconsentimiento

- inv. 7 + 6.3 + 8: updates que cambian "permisos, riesgo, efectos, datos o destinos" exigen reevaluación/consentimiento. Buena lista, pero **¿quién detecta el cambio?** El manifest se auto-declara: un update que cambia el comportamiento real manteniendo el manifest declarado idéntico **evade el disparador**. Falta: la identidad de la extensión se liga a un artefacto verificable y **cualquier cambio de artefacto** (no solo del manifest declarado) dispara reevaluación. (Open Q#5 difiere firma/attestation, pero el *invariante* de identidad ligada a contenido debe estar aquí, o inv. 7 es inaplicable.)
- **Downgrade/rollback: sin tratar.** Nada impide volver a una versión anterior vulnerable o degradar para evadir una política que solo la versión nueva honraba. 7 menciona "compatibilidad" y "deprecación" pero no hay anti-rollback.
- **Mismo identificador, otra implementación** (el caso peligroso): 6.1 exige "identificador estable" + "versión", pero nada liga el identificador a un artefacto verificable. Se mantiene el ID estable y la cadena de versión mientras se cambia la implementación → consumidores y policy creen que es lo mismo confiable. Falta: (identificador, versión) → hash de contenido inmutable; republicar el mismo par con contenido distinto se rechaza.

## 6. Capability laundering

- **Lectura que exfiltra:** 6.1 tipo "lectura" se trata como bajo riesgo, pero su *salida* es el vector de exfiltración. No se propaga clasificación/taint de la salida de una capability de lectura a la gobernanza posterior.
- **Escritura que llama a otras tools:** sin control de invocación ambiental (punto 3).
- **Integration que delega fuera de scope:** las integrations viven aquí y no hay contrato de confinamiento de la credencial externa → confused deputy en el sistema externo.
- **Resolution como lavado:** 5.3 resolution "selecciona qué capability, versión, implementación o configuración". Si resolution puede elegir **otra implementación** que la consentida/evaluada, consientes a la capability X (impl A) y resolution cambia a impl B en runtime. Falta: la implementación concreta resuelta forma parte del contexto de decisión y queda **ligada**; resolution no puede sustituir post-autorización.

## 7. Manifests ambiguos, permisos implícitos, versiones, downgrade, registradas-no-autorizadas

- **Manifest ambiguo:** no hay "manifest incompleto/ambiguo = no instalable/no resolvable" (el equivalente al "scope ambiguo = deny" de RFC-0005). Debe fallar cerrado.
- **Permisos implícitos:** el peligro es una capability de contrato estrecho cuya **credencial** es amplia — el permiso implícito está en la credencial, no en el manifest. Sin tratar.
- **Registrada pero no autorizada:** falta declarar explícitamente que registry ≠ autorizado ≠ resolvable, y que cada resolution es policy-gated por org/solicitud.
- **Downgrade/rollback/incompatibilidad:** tratado débilmente; sin anti-rollback ni content-binding.

## 8. Multi-tenancy

- inv. 10 "recursos compartidos requieren aislamiento verificable" es **una sola línea**, afirmada, sin mecanismo — y es donde más contrato hace falta, porque las extensiones son justo la superficie de **código compartido, credencial compartida, caché compartida**. Falta declarar: una extensión habilitada para org A no puede servir a B; config/credenciales por-org; cachés/resultados/logs con org context que no se filtran; un proceso de extensión multi-tenant impone aislamiento por solicitud y no persiste contenido de org; los bundles llevan org context. Comparado con RFC-0004/0005, RFC-0006 es delgado donde más importa.

## 9. Credenciales externas amplias / proveedores compartidos

- inv. 8 "credenciales amplias no son permisos globales": afirmada, **cero mecanismo**. Este RFC posee la superficie de integración/credencial y no aporta contrato de confinamiento, credenciales por-tenant, on-behalf-of, ni "el efecto de la tool está confinado por debajo del poder de su credencial". Es la omisión más flagrante: el propósito de RFC-0006 son integraciones a CRM/ERP/correo que solo exponen credenciales de servicio amplias, y no hay contrato para eso. Se delega implícitamente a "RFC-0003/0004/0005 lo resuelven" — pero esos difirieron el *mecanismo* y **aquí es donde debe ligarse al contrato de tool/integration.**
- **Proveedores compartidos:** inv. 10 otra vez; sin aislamiento de canal lateral/caché/métrica a nivel de extensión.

## 10. Qué debe quedar obligatoriamente en Core vs extensión

El RFC apenas lo aborda. **Deben ser Core (no propiedad de extensión):**
- **Enforcement points y mediación de efectos** — una extensión no puede ser su propio enforcement point; todo efecto externo atraviesa un efector del Core que aplica binding+obligaciones.
- **Custodia y acotado de credenciales** — el Core sostiene las credenciales externas; las tools reciben solo credenciales confinadas por-operación, nunca la credencial amplia cruda.
- **Capability resolution y registry** — gobernanza del Core.
- **Validación de manifest y attestation de artefacto** — Core.
- **Propagación y aislamiento de contexto de tenancy** — Core.

El RFC no traza esta línea; deja enforcement/credencial/efecto como responsabilidades ambiguas. Ese es el fallo central: si las extensiones pueden poseer cualquiera de esas, todos los invariantes son auto-policiados.

## 11. Cambios concretos (priorizados por severidad)

1. **(5.4 / inv. 6) Enforcement points y mediación de efectos son del Core; una extensión/tool nunca es su propio enforcement point y no tiene capacidad ambiental de producir un efecto externo** — todo efecto atraviesa un efector del Core que aplica binding + obligaciones. **CRÍTICO** — sin esto los 12 invariantes son autocontrolados.
2. **(5.2 / 6.x nuevo) Contrato de confinamiento de credenciales:** el Core sostiene las credenciales externas; la tool recibe solo una credencial confinada por-operación (o token on-behalf-of), nunca la credencial de servicio amplia; si el confinamiento no está disponible ⇒ deny/require_approval. **CRÍTICO** — este RFC posee la superficie de credencial amplia y hoy tiene cero mecanismo.
3. **(6.2 / inv. 9) Sustituir "declara tus subefectos" por "ningún efecto no mediado es posible":** la capability/tool no tiene autoridad ambiental para salir a la red ni invocar otra capability; toda llamada externa y toda invocación tool→tool re-entra al ciclo gobernado con su propio binding. **CRÍTICO** — la auto-declaración no vale para código no confiable.
4. **(6.1 / 5.3 / inv. 7) Ligar la identidad de implementación a un artefacto verificable:** (identificador, versión) → attestation de contenido inmutable; el mismo par con contenido distinto se rechaza; cualquier cambio de artefacto dispara reevaluación/reconsentimiento, no solo el cambio de manifest declarado. **CRÍTICO** — cierra el swap con mismo-ID y el update silencioso.
5. **(nuevo / 6.3) Contrato de efectos asíncronos/diferidos:** los efectos que disparan tras el ciclo inicial (encolados, programados, webhook/callback) arrastran un binding vigente, re-chequean revocación+policy en el disparo y son cancelables ante revocación/suspensión; ningún efecto async fuera de un binding vivo. **CRÍTICO** — clase entera de efectos hoy no gobernada.
6. **(5.3 / resolution) Ligar la implementación concreta resuelta a la decisión:** resolution no puede sustituir implementación/versión/config tras la autorización; el binding nombra la implementación exacta resuelta. **ALTO** — cierra el laundering por resolution.
7. **(6.3 / compuestos) Efectos compuestos/irreversibles:** cada subefecto gobernable liga individualmente, o el compuesto es atómico con idempotencia + compensación; idempotencia **obligatoria** para irreversibles (quitar "cuando correspondan"). **ALTO.**
8. **(5.1 / 6.1) Propagar clasificación/taint desde la salida de una capability:** una capability de "lectura" propaga clasificación/taint a la gobernanza posterior; el tipo "lectura" no es automáticamente bajo riesgo. **ALTO** — lectura→exfiltración.
9. **(10 / inv. 10) Convertir el tenancy de una línea en contrato real:** config/credenciales/cachés/resultados/logs por-org; extensión de org A no sirve a B; procesos multi-tenant con aislamiento por solicitud y no persistencia; bundles con org context. **ALTO.**
10. **(5.2 / 5.3 / terminología) Desambiguar la taxonomía:** corregir "integration = capability o implementación" (elegir una); definir frontera tool vs integration; resolver la colisión de "provider" con RFC-0002 (renombrar uno). **ALTO** — el propósito mismo del RFC es la taxonomía y es circular.
11. **(5.3 / 7) Registro ≠ autorización ≠ resolvable:** declarar que estar en el registry no confiere disponibilidad; cada resolution es policy-gated por org/solicitud; existen capabilities registradas-pero-no-autorizadas. **MEDIO-ALTO.**
12. **(manifest / inv. 2) Manifest completo y no ambiguo para ser instalable/resolvable;** incompleto/ambiguo falla cerrado; riesgo/efectos declarados se verifican contra el comportamiento observado, no se confían. **MEDIO.**
13. **(7) Anti-rollback/downgrade:** una versión deprecada/superada/vulnerable no puede activarse para nuevo consentimiento; los downgrades exigen reautorización explícita y son policy-gated. **MEDIO.**
14. **(6.1) El manifest/capability declara destinos externos y objetivos de egreso de datos, que se ligan y se comprueban por obligación;** destino no declarado = deny. **MEDIO** — los destinos están en la lista de disparadores de update (6.3) pero nunca se exige declararlos de antemano.
15. **(8 / dependencia) Declarar la dependencia dura de RFC-0003 (binding infalsificable) + RFC-0004 (confinamiento del efector) + RFC-0005 (autorización conjuntiva);** sin ellos, inv. 4/6/8 son advisory. **MEDIO.**

## 12. Veredicto final

## `NECESITA REDISEÑO PARCIAL`

**Por qué es un paso atrás respecto a RFC-0004/0005 (que fueron "apto condicionado"):** allí los huecos eran *tightenings* sobre una estructura correcta. Aquí los huecos son **estructurales**: la taxonomía que este RFC existe para definir es **circular** (capability/tool/integration/provider) y colisiona con RFC-0002 ("provider"); y el documento **no aporta los contratos que es su razón de ser** —confinamiento de credenciales, mediación de efectos, efectos asíncronos, binding de resolution, identidad ligada a artefacto, tenancy de extensiones—. En su lugar **repite invariantes de otros RFCs como aspiración.** Para la superficie más peligrosa del sistema (código de terceros con credenciales de servicio amplias contra CRM/ERP/correo/facturación), eso no es construible con seguridad.

**Por qué no es `NO APTO`:** los objetivos y la *intención* de los 12 invariantes son correctos y coherentes con la serie; la separación registry/resolution y "capability ≠ autoridad / manifest ≠ permiso" son buenos cimientos. No hay que tirarlo; hay que **rehacerlo para que aporte contrato, no solo afirmaciones.**

**Lo que haría ya:** cambios **1-5 son rediseño, no edición** — propiedad del enforcement/efectos por el Core (1), confinamiento de credenciales (2), no-ambient-effects (3), identidad ligada a artefacto (4) y contrato de efectos asíncronos (5). Sin esos cinco, RFC-0006 es una declaración de buenas intenciones sobre la parte del sistema que más mecanismo necesita.

---

### Nota transversal de la serie

El patrón es claro: **RFC-0002 (rediseño) → 0003 (rediseño) → 0004 (apto condicionado) → 0005 (apto condicionado) → 0006 (rediseño parcial).** Los cuatro últimos comparten **la misma deuda raíz**: tres mecanismos que se afirman pero nunca se construyen y de los que todo lo demás depende —
1. **Decision Binding infalsificable y ligado a identidad+solicitud exacta** (debe cerrarlo RFC-0003),
2. **Confinamiento del efector / credencial por-operación** (RFC-0004 lo enuncia, RFC-0006 debe contratarlo),
3. **Autorización conjuntiva + mediación de todo efecto por el Core** (RFC-0005 / RFC-0006).

Mientras esos tres sigan como invariantes-aspiración, los "apto condicionado" de 0004 y 0005 y el rediseño de 0006 son **el mismo problema visto desde tres capas.** El camino crítico no son más RFCs: es mecanizar esos tres y volver a evaluar 0004-0006 contra el mecanismo real.

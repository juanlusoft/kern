# Revisión externa de RFC-0001

- **RFC revisado:** RFC-0001 — Kern Manifesto
- **Fuente:** Claude
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---

Voy directo. El manifiesto está mejor escrito que el RFC-0000, pero un manifiesto que suena bien y promete lo imposible es más peligroso que uno mediocre: porque nadie lo discute hasta que el producto choca contra la física. Aquí está lo que romperá.

---

## 1. Promesas demasiado fuertes o insostenibles

- **"Cambiar de modelo sin rehacer sus integraciones" (5) es la mentira de carga del documento.** Un contrato estable te garantiza que la *interfaz* no cambia. No te garantiza nada sobre el *comportamiento*: ventana de contexto, formato de tool-calling, sensibilidad al prompt, calidad de razonamiento, modo de salida estructurada. Cambiar un modelo frontera por un modelo local de 7B mantiene el contrato y **rompe el producto**. Abstracción de capacidad ≠ equivalencia conductual. Prometer cero rework es técnicamente falso.

- **"Cambiar de hardware sin rehacer su plataforma" + "empezar localmente y crecer" (5, 8) ignora el suelo de capacidad.** La sección 8 admite que la primera etapa corre en hardware local limitado. Un modelo que cabe en una caja local no es el mismo que necesitas a escala enterprise. Estás prometiendo que una sola arquitectura cubre desde una Raspberry-class hasta datacenter sin cambio de identidad. Ese straddle es la trampa clásica: o el diseño local te lastra a escala, o el diseño enterprise no corre en local.

- **"Auditar qué modelo tomó una decisión" (2) sugiere explicabilidad que los LLM no dan.** Puedes registrar *qué modelo se ejecutó y con qué entrada/salida*. No puedes auditar *por qué decidió*. La frase, tal cual, promete trazabilidad de razonamiento que no existe.

- **Métrica de éxito (11): adoptar "una nueva generación de modelos sin obligar a rehacer agentes, workflows ni procesos."** Las generaciones nuevas casi siempre exigen re-prompting y re-evaluación. Prometer cero rework como criterio de éxito hace que el manifiesto fracase por definición.

- **"Kern debe seguir siendo útil cuando todo lo demás cambie" (1)** es infalsable. No es una promesa, es un deseo. No puede guiar decisiones porque nada la contradice.

## 2. Marketing vacío o indistinguible

Prueba ácida: sustituye "Kern" por cualquier competidor (Dify, LangChain Platform, un producto enterprise de turno) y mira si el texto sigue siendo cierto. En estos puntos lo es — es decir, no dicen nada:

- **Sección 1 y 3:** "infraestructura estable para ejecutar, gobernar, integrar y evolucionar modelos, agentes, herramientas y automatizaciones." Lo dice todo el mundo. La lista de 11 cosas que "conecta y gobierna" (3) describe a cualquier plataforma de IA empresarial.
- **3: "usar la inteligencia adecuada para cada tarea"** — buzzword sin mecanismo.
- **6.3: "la estabilidad es más valiosa que la novedad"** — todos lo dicen, nadie lo puede verificar. ¿Quién define "moda" vs "valor real"? Infalsable.
- **6.7: "la inteligencia sin control no es infraestructura empresarial"** — eslogan, no principio.
- **6.10: "Kern debe sobrevivir a sus primeras decisiones"** — frase bonita que no añade nada sobre 6.2.

Ninguno de estos es *falso*; el problema es que no *distinguen* a Kern ni *constriñen* ninguna decisión futura. Un principio que no descarta nada no es un principio.

## 3. Contradicciones entre principios

- **Independencia tecnológica (6.2) ↔ Simplicidad / Core pequeño (6.5, 6.9).** La independencia real de proveedor/runtime/hardware **se paga en capas de abstracción, adaptadores y negociación de capacidades**: complejidad. No puedes ser máximamente simple y máximamente independiente a la vez. El manifiesto pide ambas sin reconocer el impuesto.

- **Privacidad / local-first (6.1, 8) ↔ "inteligencia avanzada" y capacidades (1, 6.4).** Las capacidades frontera (contexto largo, razonamiento top, visión) viven en modelos que a menudo **no corren en hardware privado/local**. Privacidad y capacidad están en tensión directa, y el manifiesto promete las dos sin admitir el trade-off ni declarar de qué lado cae Kern.

- **Extensibilidad (6.6) ↔ Seguridad/compatibilidad/aislamiento (6.6, 6.7).** Cada punto de extensión amplía la superficie de ataque y de incompatibilidad. Decir que la extensibilidad "no puede comprometer" seguridad ni compatibilidad es desear que la tensión no exista. Existe, y hay que decidir cómo se arbitra.

- **Capacidades, no marcas (6.4) ↔ realidad de features propietarias.** Algunas capacidades solo existen en un proveedor (un modo concreto de structured output, una API de visión específica). Un contrato marca-agnóstico o baja al mínimo común denominador (pierde valor) o filtra especificidades de marca (rompe 6.4). El manifiesto no reconoce que la abstracción de capacidad *gotea*.

- **Estabilidad (6.3) ↔ evolución/independencia (6.2, 5).** Para seguir independiente tienes que adoptar continuamente nuevos proveedores/protocolos (blanco móvil); para ser estable resistes el cambio. ¿Quién gana cuando emerge un nuevo estándar dominante de tool-calling? El texto no lo resuelve.

- **Core pequeño (6.5) ↔ Gobernabilidad total (6.7).** Identidad, permisos, auditoría y políticas son justo lo transversal que tiende a vivir **en** el Core y a crecer sin parar. 6.7 empuja hacia dentro lo que 6.5 quiere mantener fuera.

## 4. Principios ausentes que explotan a 5 años

- **Versionado y evolución de contratos.** El manifiesto repite "contratos estables/explícitos" pero **no hay un solo principio sobre cómo evolucionan**: deprecación, ventana de retrocompatibilidad, garantías a largo plazo. Esto es exactamente lo que mata plataformas al quinto año. Es el pilar que falta.
- **Coste y economía operativa.** "La inteligencia adecuada para cada tarea" sin una palabra sobre presupuestos, control de gasto o agentes que se disparan en tokens. El control de coste es un top-3 real en IA empresarial. Ausente.
- **Modelo de amenazas específico de IA.** Quieres que la IA trabaje con correo, ERP, CRM y documentos — los vectores exactos de **prompt injection y exfiltración vía herramientas**. 6.6/6.7 hablan de permisos genéricos, pero ningún principio nombra el contenido no confiable ni el plugin no confiable como amenaza. Imperdonable dado el caso de uso.
- **Gobierno de datos real.** Retención, residencia, borrado (derecho al olvido), lineage, qué entra en un store vectorial privado. "La empresa conserva el control" es un eslogan sin esto.
- **Degradación y disponibilidad.** ¿Qué pasa cuando un proveedor cae, te limita o **deprecia un modelo de la noche a la mañana**? Para algo que se llama "infraestructura", no tener principio de fallback/degradación es un agujero grave.
- **Evaluación y calidad.** No hay principio de evaluación/regresión del comportamiento de la IA. Sin esto, la promesa de "cambiar de modelo libremente" ni siquiera es comprobable: no sabrías que el cambio degradó la calidad.
- **Responsabilidad / human-in-the-loop.** 6.8 habla de reversibilidad, pero nadie responde quién es responsable cuando la IA actúa mal.

## 5. ¿Core inflado o producto sin propuesta? Ambos riesgos están vivos

- **Hacia Core inflado:** la lista de la sección 3 + el mandato de gobernabilidad de 6.7 arrastran identidad, orgs, permisos, auditoría, conocimiento, canales y workflows hacia el alcance. 6.5 dice "mantenlo pequeño" pero **no da ningún criterio operativo** de qué es "común, duradero y necesario para toda instalación". Cada quien argumentará que su feature lo es. La frontera es retórica, no operativa → el Core engorda.
- **Hacia producto sin propuesta:** la sección 4 (qué no es) y la 9 (no objetivos) definen Kern casi enteramente **por negación** y difieren todo lo concreto — lenguaje, DB, inferencia, formato de plugins, contratos de proveedor, agentes, memoria, RAG. Tras leer el manifiesto sabes qué rechaza ser Kern, no qué *hace*. "Una capa de abstracción sobre IA" es el pitch de todos. **No hay una sola cuña concreta, opinada y diferenciadora.**
- Conclusión: el manifiesto no escoge una primera batalla. Necesita nombrar **una** capacidad concreta que sea el wedge.

## 6. Qué debe volverse norma verificable y qué debe quedar como filosofía

**Convertir en normas verificables (RFCs posteriores con criterios medibles):**
- 6.2 → suite de conformidad de contratos (test de reemplazabilidad real).
- 6.4 → taxonomía de capacidades explícita y versionada.
- 6.6 → especificación de permisos/aislamiento de plugins (modelo de seguridad).
- 6.7 → definición de "acción relevante" + esquema de auditoría e identidad por acción.
- 6.8 → lista de qué acciones exigen confirmación/límite/rollback.
- 6.1 → topologías de despliegue y qué garantías de privacidad son *comprobables*.
- Promesas de la sección 5 → el contrato exacto de compatibilidad y qué significa "sin rehacer".

**Mantener como dirección filosófica (y etiquetarlas así explícitamente):**
- Sección 1 (visión), 6.3 (sesgo a estabilidad), 6.9 (sesgo a simplicidad), 6.10 (lente de longevidad), 8 (dirección estratégica).

**Peligro concreto:** 6.3 y 6.9 están redactadas como reglas ("debe", "solo debe") pero son infalsables. Tal cual, se convertirán en **armas retóricas en las revisiones** ("tu propuesta sacrifica estabilidad por novedad") sin test objetivo que lo dirima. Etiquétalas como valores rectores, no como puertas de aprobación.

## 7. Cambios concretos (priorizados)

1. **Sección 5 y 11 — desactivar la promesa de "cero rework".** Sustituir "cambiar de modelo sin rehacer integraciones" por "sin rehacer las integraciones que dependen del contrato, reconociendo que el comportamiento y la calidad pueden cambiar y exigen re-evaluación". Es la mentira de carga; arréglala primero.
2. **Nuevo 6.11 — Compatibilidad y evolución de contratos:** versionado, política de deprecación y ventana de retrocompatibilidad. El pilar ausente que hace creíble a todo lo demás.
3. **Nuevo principio — modelo de amenazas de IA (prompt injection, contenido y plugins no confiables).** Añadir a 6.6/6.7 o como 6.12. Innegociable dado el caso de uso correo/ERP/documentos.
4. **Sección 6.5 — añadir un test operativo de qué entra en el Core** (criterio de decisión, no solo "común y duradero"), enlazado al glosario de RFC-0000. Sin esto el Core engorda garantizado.
5. **Sección 3/9 — nombrar al menos una cuña concreta y opinada** (la primera capacidad diferenciadora). Deja de definir Kern solo por negación.
6. **Nuevo 6.13 — coste y economía operativa:** presupuestos, control de gasto, límites por agente.
7. **Nuevo 6.14 — degradación y disponibilidad:** fallback ante caída/deprecación/rate-limit de proveedor.
8. **Sección 6.2 — cláusula de trade-off explícita:** la independencia tiene coste de complejidad y así se arbitra frente a 6.5/6.9. Resuelve la contradicción en el propio texto.
9. **Sección 6.1/8 — admitir el trade-off privacidad ↔ capacidad** y declarar la posición de Kern (p. ej. suelo de capacidad local + ruteo a nube con consentimiento explícito). Deja de prometer ambas sin condición.
10. **Nuevo 6.15 — evaluación y calidad:** cómo se valida un cambio de modelo (regresión/eval). Hace exigible la promesa de la sección 5.
11. **Secciones 6.3 y 6.9 — reetiquetar como "valores rectores (no verificables)"** y separarlas visualmente de los principios que sí serán normas, para que no se usen como puertas arbitrarias en revisión.
12. **Preguntas abiertas 1, 2 y 4 — fijar una dirección en el propio manifiesto** sobre distribución/licencia/OSS y la separación Core vs Enterprise. "La empresa conserva el control" es hueco si no se sabe si pueden forkar o autoalojar sin atadura. Sácalo de "preguntas abiertas" y declara la postura.

---

**Veredicto:** los principios 6.1, 6.2, 6.6, 6.7, 6.8 son una base sólida y honesta. El daño está en las **promesas absolutas de la sección 5 y la métrica 11** (técnicamente insostenibles), en las **contradicciones no reconocidas** (independencia vs simplicidad, privacidad vs capacidad) y en **cuatro pilares ausentes** (evolución de contratos, amenazas de IA, coste, degradación). Tal como está, este manifiesto firmará promesas comerciales que la ingeniería no podrá cumplir en tres años. Arregla los cambios 1-4 antes de aprobar; son los que evitan demandas y deuda estructural.

¿Quieres que te redacte los principios nuevos (6.11–6.15) y la reescritura de la sección 5, o prefieres atacar primero la cuña concreta del cambio 5, que es lo que decide si Kern es un producto o una capa genérica más?

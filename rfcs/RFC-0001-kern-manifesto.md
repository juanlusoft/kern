# RFC-0001 — Kern Manifesto

- **Estado:** Accepted
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-26
- **Versión:** 0.2.2
- **Tipo:** Product / Foundational
- **Dominio:** Identidad y dirección estratégica de Kern
- **Depends on:** RFC-0000
- **Decisión requerida:** Aprobación de los principios fundacionales de Kern

---

## 1. Resumen ejecutivo

Kern existe para que una empresa pueda usar inteligencia artificial avanzada sin entregar el control de su infraestructura, sus datos, sus procesos ni su futuro tecnológico a un proveedor concreto.

Kern no compite por crear el mejor modelo de IA. Kern crea la infraestructura estable que permite a una empresa ejecutar, gobernar, integrar y evolucionar modelos, agentes, herramientas y automatizaciones privadas durante años.

Los modelos cambiarán. El hardware cambiará. Los runtimes cambiarán. Los protocolos cambiarán.

Kern debe seguir siendo útil cuando todo lo demás cambie.

---

## 2. El problema

Las empresas que adoptan IA suelen quedar atrapadas entre dos extremos:

1. Usar servicios externos rápidos y potentes, a costa de depender de proveedores, enviar datos fuera de su control o aceptar cambios ajenos en precio, capacidades y condiciones.

2. Ejecutar modelos locales de forma aislada, sin una plataforma coherente para integrar datos, usuarios, permisos, herramientas, canales, auditoría y automatizaciones.

El problema no es únicamente ejecutar un modelo.

El problema es operar inteligencia artificial dentro de una empresa de forma segura, útil, gobernable y sostenible.

Una empresa necesita que su IA pueda trabajar con sus documentos, correo, ERP, CRM, calendarios, procesos y herramientas internas. Pero también necesita saber:

- qué datos ha usado;
- qué acciones ha realizado;
- qué permisos tenía;
- qué modelo, configuración y herramientas intervinieron en una ejecución;
- cómo reemplazar una tecnología sin reconstruir todo;
- cómo mantener control sobre sus procesos críticos.

Kern existe para resolver esa capa de infraestructura.

---

## 3. Qué es Kern

Kern es una plataforma de infraestructura para IA privada empresarial.

Proporciona una capa estable para conectar y gobernar:

- modelos de IA;
- runtimes de inferencia;
- hardware;
- agentes;
- herramientas;
- flujos de trabajo;
- conocimiento empresarial;
- canales de comunicación;
- usuarios, organizaciones y permisos;
- integraciones y extensiones.

Kern permite que una empresa use la inteligencia adecuada para cada tarea sin convertir una marca, un modelo, una GPU o un proveedor en una dependencia estructural del negocio.

## 3.1 La primera batalla de Kern

Kern no se diferencia por ofrecer otro chat ni por ocultar modelos detrás de una API.

La primera capacidad estratégica de Kern es la ejecución gobernada de acciones de IA sobre sistemas empresariales privados.

Un agente puede consultar o actuar sobre ERP, CRM, correo, documentos, calendarios u otros sistemas internos únicamente mediante herramientas sometidas a identidad, permisos, políticas, límites, auditoría y mecanismos de reversibilidad proporcionados por la plataforma.

El valor de Kern no es que un modelo pueda sugerir una acción. El valor es que una empresa pueda permitir, limitar, revisar y evolucionar esa acción sin depender del modelo, runtime o proveedor que la haya originado.

---

## 4. Qué no es Kern

Kern no es:

- un chatbot genérico;
- un modelo de IA;
- una aplicación atada a OpenAI, Anthropic, Google, Ollama, vLLM o cualquier proveedor concreto;
- una interfaz aislada de chat sin integración operativa;
- un conjunto desordenado de automatizaciones para un único cliente;
- una plataforma que obligue a las empresas a entregar sus datos a terceros;
- un producto construido alrededor de una GPU, un formato de modelo o un runtime temporal;
- una capa de compilación, cuantización u optimización de silicio;
- un sistema de entrenamiento, preentrenamiento, post-entrenamiento o fine-tuning de modelos fundacionales;
- una promesa de autonomía sin controles, permisos ni auditoría.

Kern puede ofrecer interfaces conversacionales, agentes, workflows o conectores, pero ninguno de ellos define por sí solo qué es Kern.

---

## 5. La promesa de Kern

Kern promete a cada empresa que su inteligencia operativa podrá evolucionar sin obligarla a reconstruir su infraestructura cada vez que cambie el mercado de IA.

Eso significa que una empresa debe poder:

- cambiar de modelo manteniendo la continuidad de los contratos e integraciones compatibles;
- aislar las diferencias sintácticas y operativas entre proveedores;
- ver con claridad qué capacidades ofrece o no ofrece cada componente;
- evaluar antes de migrar;
- aplicar degradación controlada o bloqueo seguro cuando falten capacidades;
- añadir herramientas sin modificar el Core;
- adaptar reglas y procesos sin contaminar el producto base;
- mantener sus datos y políticas bajo su control;
- auditar las acciones relevantes realizadas por la IA;
- empezar localmente y crecer sin quedar bloqueada por la arquitectura inicial.

Kern no promete que dos modelos o runtimes produzcan el mismo comportamiento. Cambiar un componente puede requerir reevaluar calidad, prompts, límites y flujos. Kern debe hacer visibles esas diferencias y preservar, cuando sea posible, los contratos e integraciones compatibles.

La primera etapa puede ejecutarse sobre hardware local limitado. Esa limitación no debe convertirse en una decisión arquitectónica permanente.

Kern abstrae la plataforma mediante runtimes y contratos, pero no garantiza que cualquier capacidad esté disponible en cualquier entorno físico.

---

## 6. Principios fundacionales

### 6.1 La empresa conserva el control

Los datos, permisos, políticas, integraciones, estado de los agentes, memoria de corto y largo plazo, historial operativo, configuraciones relevantes de comportamiento y decisiones operativas pertenecen a la empresa que usa Kern.

Kern debe poder funcionar en infraestructura propia, privada o bajo control explícito del cliente, según la topología de despliegue que la empresa decida.

Kern no promete privacidad absoluta; promete control, topología de despliegue y políticas bajo decisión de la empresa.

### 6.2 Ninguna tecnología concreta define el producto

Kern no debe depender estructuralmente de un modelo, proveedor, runtime, hardware, base vectorial, protocolo o cliente concreto.

Las tecnologías externas entran mediante contratos explícitos y reemplazables.

Kern prioriza contratos explícitos y protocolos abiertos o ampliamente adoptados cuando aporten interoperabilidad real.

La independencia tecnológica tiene un coste de complejidad. Kern no intentará ocultar todas las diferencias de cada proveedor; expondrá capacidades y límites mediante contratos explícitos, evitando tanto el acoplamiento como una abstracción de mínimo común denominador que elimine valor.

Los siguientes valores orientan decisiones cuando existen alternativas válidas. No sustituyen requisitos verificables de seguridad, compatibilidad o arquitectura.

### 6.3 Valor rector: La estabilidad es más valiosa que la novedad

Kern adoptará tecnologías nuevas cuando aporten valor real, pero no sacrificará compatibilidad, seguridad o mantenibilidad por seguir una moda.

### 6.4 Las capacidades importan más que las marcas

Kern debe razonar sobre necesidades funcionales —por ejemplo, razonamiento, visión, tool calling, JSON estructurado o contexto largo— y no diseñarse alrededor de nombres comerciales de modelos.

### 6.5 El Core debe permanecer pequeño y estable

El Core contiene únicamente responsabilidades comunes, duraderas y necesarias para toda instalación.

Una capacidad solo puede entrar en el Core cuando cumpla simultáneamente:

1. Es transversal a organizaciones, distribuciones e instalaciones.
2. Es necesaria para gobernar, asegurar o interoperar la plataforma.
3. No puede resolverse razonablemente como plugin, tool, provider, runtime o extensión.
4. Su ausencia obligaría a la mayoría de instalaciones a reinventar el mismo mecanismo.
5. Tiene un contrato estable que justifica soporte y evolución a largo plazo.

Este test guía decisiones, pero no sustituye futuros RFCs de arquitectura.

Las integraciones, reglas de negocio, personalizaciones de cliente y extensiones deben vivir fuera del Core siempre que sea posible.

### 6.6 Extensibilidad con límites

Herramientas, plugins y contenido externo son no confiables por defecto.

Correo, documentos, páginas web y datos conectados pueden contener instrucciones maliciosas o indirectas.

Las extensiones deben operar con permisos mínimos, fronteras explícitas y aislamiento proporcional al riesgo.

Ninguna extensión puede ampliar sus propios privilegios ni comprometer datos de otra organización.

El mecanismo técnico concreto de aislamiento se definirá en RFCs posteriores.

### 6.7 La IA debe ser gobernable

No basta con registrar acciones después de ejecutarlas.

Kern debe permitir aplicar políticas y controles antes de ejecutar acciones o revelar datos.

Toda acción relevante debe poder asociarse a una identidad, una versión de modelo, una configuración, referencias o huellas del contexto utilizado, las tool calls, los resultados y las decisiones de política cuando aplique. La trazabilidad debe respetar las políticas de minimización, retención y acceso de la empresa.

Kern no debe afirmar explicabilidad interna ni acceso al razonamiento privado del modelo.

### 6.7.1 Compatibilidad y evolución de contratos

Las interfaces públicas de Kern deben versionarse, deprecarse y migrarse de forma explícita. La estabilidad no significa inmovilidad: significa que los cambios tienen ruta de transición, periodo de soporte y consecuencias documentadas.

### 6.7.2 Evaluación antes de sustituir inteligencia

Cambiar un modelo, runtime o proveedor debe poder evaluarse frente a tareas, políticas y flujos relevantes antes de convertirse en configuración de producción. Kern debe permitir detectar regresiones de capacidad, calidad, coste o seguridad.

### 6.7.3 Degradación y disponibilidad

Cuando una capacidad requerida no esté disponible, un proveedor falle o un componente sea retirado, Kern debe degradar de forma explícita, aplicar fallback cuando exista o bloquear la ejecución de forma segura. Nunca debe asumir equivalencia silenciosa entre capacidades distintas.

### 6.7.4 Economía operativa

La IA empresarial debe ser operable dentro de límites de coste y capacidad. Kern debe poder aplicar presupuestos, cuotas, límites y observabilidad de consumo por organización, agente, workflow o integración.

### 6.7.5 Responsabilidad humana

Las acciones de alto impacto deben poder requerir confirmación, aprobación o supervisión humana según políticas de la empresa. Kern no sustituye la responsabilidad operativa de la organización.

### 6.8 La automatización debe ser reversible

Las acciones críticas deben diseñarse con confirmación, límites, observabilidad y rollback cuando sea razonable.

### 6.9 Valor rector: La simplicidad precede a la plataforma

Kern no debe anticipar todas las necesidades futuras mediante abstracciones vacías.

Una extensión solo debe convertirse en contrato de plataforma cuando exista una necesidad real, repetible y verificable.

### 6.10 Valor rector: Kern debe sobrevivir a sus primeras decisiones

Toda decisión importante debe evaluarse considerando si permite reemplazar componentes, migrar clientes y mantener compatibilidad dentro de varios años.

---

## 7. Usuarios de Kern

Kern está diseñado para tres tipos de usuario principales:

### Empresa usuaria

Necesita una IA útil, privada, integrada y gobernable para su trabajo diario.

### Operador de Kern

Configura organizaciones, usuarios, agentes, modelos, permisos, políticas, integraciones y observabilidad.

### Desarrollador o integrador

Construye plugins, herramientas, proveedores, runtimes, canales o soluciones específicas siguiendo contratos estables.

---

## 8. Dirección estratégica

Kern debe poder empezar en una instalación local pequeña y evolucionar hacia despliegues más potentes sin cambiar su identidad.

La topología de despliegue es una decisión explícita de capacidad, coste, privacidad y disponibilidad; no debe esconderse detrás de una promesa genérica de “local” o “enterprise”.

El objetivo no es que Kern sea compatible con todo desde el primer día.

El objetivo es que Kern tenga fronteras claras para poder incorporar nuevas capacidades sin romper su núcleo.

---

## 9. No objetivos

Este RFC no decide:

- el lenguaje de programación;
- el framework web;
- la base de datos;
- el motor de inferencia;
- el modelo local inicial;
- el hardware inicial;
- el formato de plugins;
- los contratos de proveedores;
- el diseño de agentes;
- el diseño de memoria;
- el sistema RAG;
- el producto comercial, precios o licencias;
- el orden de implementación;
- el entrenamiento, preentrenamiento, post-entrenamiento o fine-tuning de modelos fundacionales;
- la optimización de bajo nivel de GPU, compilación de kernels o cuantización de modelos;
- prometer equivalencia conductual entre modelos distintos;
- reemplazar los controles y responsabilidades humanas de una empresa.

Estas decisiones se tratarán en RFCs posteriores.

---

## 10. Consecuencias

Aceptar este manifiesto implica que cualquier propuesta futura debe responder, como mínimo:

1. ¿Refuerza o debilita la independencia tecnológica sin ocultar diferencias reales de capacidad?
2. ¿Pertenece al Core según el test de entrada o debe ser una extensión?
3. ¿Preserva el control de datos, memoria, permisos y operación?
4. ¿Introduce dependencia difícil de reemplazar, deuda de compatibilidad o coste operativo no controlado?
5. ¿Se puede evaluar antes de migrar a producción?
6. ¿Qué ocurre si falta una capacidad, cae un proveedor o una extensión resulta no confiable?
7. ¿Permite auditoría y aplicación preventiva de políticas cuando sea necesario?

Una propuesta que contradiga estos principios requiere un RFC explícito que justifique la excepción.

---

## 11. Métrica de éxito

Este manifiesto habrá tenido éxito si, dentro de varios años, Kern puede adoptar nuevos componentes sin reconstruir toda la plataforma, conservando datos, contratos, integraciones y control operacional cuando sean compatibles, y pudiendo identificar claramente qué debe reevaluarse o migrarse cuando no lo sean.

---

## 12. Preguntas abiertas

1. ¿Qué suite mínima de evaluación se usará para validar cambios de modelo, runtime o proveedor?
2. ¿Qué mecanismos deberán existir para registrar, migrar y restaurar el estado de agentes y memoria entre topologías de despliegue?

---

## 13. Referencias

- RFC-0000 — The Kern RFC Process

---

## 14. Historial de cambios

### 0.1 — 2026-06-26

Borrador inicial del manifiesto fundacional de Kern.

### 0.2 — 2026-06-26

Revisión del manifiesto tras crítica de arquitectura y análisis estratégico externo. Elimina promesas absolutas de equivalencia entre modelos; define la ejecución gobernada como primera capacidad estratégica; añade principios de evolución de contratos, amenazas de IA, evaluación, degradación, economía operativa y responsabilidad humana.

### 0.2.1 — 2026-06-26

Aclaraciones editoriales sobre trazabilidad de ejecuciones, minimización de datos de auditoría y distinción entre valores rectores y principios verificables.

### 0.2.2 — 2026-06-26

RFC Accepted por el Technical Owner tras revisión independiente de arquitectura e investigación estratégica externa. El manifiesto pasa a ser la dirección fundacional de Kern para arquitectura, producto y evolución de plataforma.

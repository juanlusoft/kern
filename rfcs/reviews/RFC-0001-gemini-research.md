# Revisión externa de RFC-0001

- **RFC revisado:** RFC-0001 — Kern Manifesto
- **Fuente:** Gemini
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---

Como Research Engineer y analista de posicionamiento técnico, he evaluado el RFC-0001 — Kern Manifesto contrastándolo con el estado del arte de la IA empresarial en 2026.

A continuación, presento un desglose estratégico que separa los hechos actuales del mercado, las inferencias arquitectónicas y mis recomendaciones concretas para blindar el manifiesto antes de su aprobación.

1. Análisis de Posicionamiento y Mercado
A. Prácticas ya comunes en el mercado
[Hecho Actual]
El manifiesto aborda dolores reales, pero varios de sus pilares ya son ofrecidos por plataformas consolidadas u open-source:

Abstracción de modelos y runtimes (Secciones 3 y 5): Herramientas como LiteLLM, Ollama, vLLM, LangChain/LangGraph y los servicios de Bedrock/Vertex AI ya ofrecen abstracción casi total del proveedor. Cambiar un modelo por otro mediante contratos API unificados (como la adopción masiva del estándar de API de OpenAI) es hoy un commodity.

Orquestación agnóstica de Agentes y Workflows (Sección 3): Frameworks como CrewAI, AutoGen y Temporal abordan la separación entre la lógica del agente y el modelo subyacente.

Privacidad y despliegue local (Sección 2 y 6.1): El mercado está saturado de soluciones on-premises o VPC (Virtual Private Cloud) para modelos open-weights (Llama 3/3.1/3.2, Mistral, Qwen) corriendo en entornos corporativos con gobernanza de datos básica.

B. Diferenciación real y defendible para Kern
[Inferencia Estratégica]
Donde Kern puede ganar el mercado no es en la abstracción del modelo, sino en la infraestructura de ciclo de vida e interoperabilidad de la plataforma. Tu diferenciación real radica en:

El desacoplamiento del Runtime vs. Agente (Sección 5): Permitir que la lógica de un agente (su memoria, estado y herramientas) sobreviva intacta si el backend de inferencia cambia de un clúster local de vLLM (vía GPUs privadas) a un proveedor externo por picos de demanda.

Gobernanza determinista (Sección 6.7 y 6.8): El enfoque en la reversibilidad de la automatización (rollback de acciones de agentes) y auditoría estricta ligada a políticas corporativas (RBAC/ABAC aplicado a inputs/outputs de IA). Esto es un vacío técnico en los frameworks actuales, que suelen ser librerías de código y no plataformas de infraestructura estables.

C. Promesas que necesitan límites (Riesgo comercial/técnico)
[Inferencia Arquitectónica]

"Cambiar de modelo sin rehacer sus integraciones" (Sección 5): Fisiológicamente engañoso. Los modelos difieren críticamente en su capacidad de Tool Calling, seguimiento de instrucciones del sistema (System Prompts) y formateo de respuestas (JSON). Un cambio de modelo (ej. de GPT-4o a un modelo local de 8B parámetros) romperá flujos debido a degradación de capacidades, no de APIs.

"Cambiar de hardware sin rehacer su plataforma" (Sección 5): La portabilidad de hardware (Nvidia CUDA vs. AMD ROCm vs. Apple Silicon vs. TPUs) depende enteramente del runtime de inferencia subyacente (vLLM, TensorRT-LLM, llama.cpp). Kern no debe prometer resolver esto en su Core; debe delegarlo a la capa de abstracción del runtime.

D. Conceptos y estándares emergentes omitidos
[Hecho Actual / Tendencia 2026]
Para que el manifiesto sobreviva al futuro a medio plazo, debe prepararse para los siguientes estándares sin casarse con tecnologías específicas:

MCP (Model Context Protocol): El estándar abierto impulsado por la industria para conectar modelos con fuentes de datos y herramientas de forma segura. Kern debe nacer pensando en protocolos de este tipo.

Evaluación Continua y Guardrails en Caliente: La gobernanza moderna no es solo auditoría (logs), es la capacidad de interceptar, evaluar sesgos/alucinaciones y aplicar políticas en tiempo real (programmatic guardrails).

Arquitecturas de Memoria Persistente y Estado del Agente: Estándares para la migración y serialización del estado de un agente (Short-term/Long-term memory) de manera agnóstica al proveedor.

2. Riesgos estratégicos de intentar ser "compatible con todo"
El "Mínimo Común Denominador": Si Kern intenta abstraer todas las capacidades de todos los modelos del mercado, la plataforma solo podrá soportar las características presentes en el modelo más débil. Funcionalidades avanzadas como Native Audio/Vision processing, modos de razonamiento complejo (tipo modelos OpenAI o1/o3) o Contextos de 1M+ tokens se volverán inmanejables bajo contratos demasiado rígidos.

Infierno de Mantenimiento de Integraciones: El ecosistema de IA cambia semanalmente. Mantener conectores propios para cada combinación de hardware, runtime y modelo devorará los recursos de ingeniería de Kern, alejándolos del desarrollo del Core de infraestructura de gobernanza.

3. Recomendaciones concretas de cambio (Priorizadas)
A continuación, propongo un máximo de 10 modificaciones prioritarias al texto del RFC-0001 para mitigar los riesgos anteriores y asegurar su viabilidad técnica.

1. Modificar la promesa de cambio de modelo (Sección 5)
Dice actualmente: "cambiar de modelo sin rehacer sus integraciones;"

Cambio recomendado: "cambiar de modelo manteniendo la compatibilidad de las interfaces y contratos de datos, aislando la lógica operativa de las variaciones sintácticas del proveedor."

Justificación [Recomendación]: Evita la falsa promesa de que cualquier modelo funcionará igual de bien, limitando la garantía al plano de control y conectores.

2. Introducir el concepto de "Capacidad Degradable" (Sección 6.4)
Dice actualmente: El punto 6.4 habla de razonar sobre necesidades funcionales.

Cambio recomendado: Añadir al final de 6.4: "Kern debe proveer mecanismos para gestionar la degradación elegante de capacidades (graceful degradation) cuando un modelo o componente inferior reemplace a uno superior."

Justificación [Inferencia]: Si la empresa cambia un modelo con visión por uno de texto puro, la plataforma debe capturar el error estructural antes de que falle el flujo.

3. Redefinir la relación con el Hardware (Sección 5)
Dice actualmente: "cambiar de hardware sin rehacer su plataforma;"

Cambio recomendado: "cambiar de entorno de ejecución o hardware subyacente mediante la abstracción estricta de runtimes de inferencia basados en estándares de la industria."

Justificación [Hecho]: La compatibilidad de hardware la resuelven proyectos como Triton Inference Server o vLLM, no las plataformas de orquestación empresarial. Kern debe apoyarse en ellos.

4. Elevar la Gobernanza de "Auditoría" a "Intercepción en Tiempo Real" (Sección 6.7)
Dice actualmente: "Toda acción relevante debe poder asociarse a una identidad, una política... y un registro auditable."

Cambio recomendado: "Toda acción e intercambio de información debe poder ser interceptada, evaluada por políticas de control en tiempo real (Guardrails) y registrada de manera inmutable para auditoría."

Justificación [Recomendación]: La auditoría post-mortem no es suficiente para la IA empresarial privada; se requiere control preventivo de fuga de datos (DLP) e inyección de prompts.

5. Acotar la compatibilidad: "Abstracción basada en Protocolos Abiertos" (Sección 6.2)
Dice actualmente: "Las tecnologías externas entran mediante contratos explícitos y reemplazables."

Cambio recomendado: "Las tecnologías externas entran mediante contratos explícitos y estandarizados, priorizando la adopción de protocolos abiertos de la industria para la conexión de herramientas, datos y modelos."

Justificación [Tendencia]: Prepara a Kern para adoptar estándares de facto como MCP de manera nativa sin nombrarlos explícitamente en el manifiesto.

6. Clarificar la soberanía del Estado del Agente (Sección 6.1)
Dice actualmente: "Los datos, permisos, políticas, integraciones y decisiones operativas pertenecen a la empresa..."

Cambio recomendado: "Los datos, permisos, políticas, integraciones, el estado y la memoria de los agentes, y las decisiones operativas pertenecen a la empresa..."

Justificación [Recomendación]: La propiedad del "contexto" e historial del agente es el activo más valioso a largo plazo y debe declararse explícitamente como propiedad de la empresa, no del proveedor del modelo.

7. Explicitación del desacoplamiento en "Qué no es Kern" (Sección 4)
Dice actualmente: "un producto construido alrededor de una GPU, un formato de modelo o un runtime temporal;"

Cambio recomendado: Añadir al final de la sección: "Kern no provee las capas de compilación de bajo nivel ni optimización de silicio; consume abstracciones de runtimes estables."

Justificación [Recomendación]: Delimita el alcance de ingeniería de Kern para evitar que los ingenieros intenten optimizar kernels de GPU o escribir cuantizaciones de modelos dentro del Core.

8. Agregar un Principio de Aislamiento de Extensiones (Sección 6.6)
Dice actualmente: "Esa extensibilidad no puede comprometer seguridad..."

Cambio recomendado: "Esa extensibilidad se ejecutará mediante un modelo de aislamiento estricto (sandboxing) que impida que fallos o vulnerabilidades en herramientas o plugins comprometan el Core o los datos de la empresa."

Justificación [Inferencia]: En plataformas de IA, la inyección de código a través de herramientas (tool calling malicioso) es un vector crítico de ataque.

9. Resolver la tensión entre "Core Pequeño" y "Gobernanza Completa" (Sección 6.5)
Dice actualmente: "El Core contiene únicamente responsabilidades comunes..."

Cambio recomendado: Añadir especificación: "El Core se encarga estrictamente de la identidad, el enrutamiento seguro de mensajes, la aplicación de políticas (policy enforcement) y la persistencia de estado básico."

Justificación [Recomendación]: "Responsabilidades comunes" es un término ambiguo que causa scope creep (crecimiento descontrolado del alcance). Definir el plano de control evita burocracia técnica.

10. Añadir a No Objetivos: "El entrenamiento/ajuste fino de modelos" (Sección 9)
Dice actualmente: No menciona el entrenamiento.

Cambio recomendado: Añadir a la lista de No Objetivos: "La infraestructura o frameworks para el pre-entrenamiento, post-entrenamiento o ajuste fino (fine-tuning) de modelos fundacionales."

Justificación [Recomendación]: El entrenamiento requiere orquestación de cómputo intensivo (e.g., Slurm, Ray) radicalmente distinta a la inferencia y automatización por agentes. Debe quedar fuera del foco inicial de Kern.

4. Referencias y Fuentes Verificables
Model Context Protocol (MCP): Especificación abierta de la industria para la comunicación entre aplicaciones y modelos de IA. Model Context Protocol Specification

Análisis de Arquitecturas de Inferencia Agnósticas: Enfoques de desacoplamiento de capas de inferencia respecto al hardware (e.g., especificaciones de la Cloud Native Computing Foundation [CNCF] en WG-AI).

OWASP Top 10 for LLM Applications (v2.0): Documentación sobre vulnerabilidades críticas como Indirect Prompt Injection y Excessive Agency, que justifican la recomendación de aislamiento en herramientas y el control de reversibilidad en plataformas empresariales. OWASP LLM Security Project

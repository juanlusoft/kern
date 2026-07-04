# Revisión externa de RFC-0002

- **RFC revisado:** RFC-0002 — Kern Logical Architecture
- **Fuente:** Gemini
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---*Nota inicial: Este documento ha sido redactado por Gemini, tu modelo de inteligencia artificial de Google, asumiendo el rol de Research Engineer especializado en arquitectura de plataformas.*

---

# Análisis Arquitectónico: RFC-0002 — Kern Logical Architecture

Como Research Engineer especializado en arquitectura de sistemas distribuidos y gobernanza de IA, he analizado detalladamente el **RFC-0002 — Kern Logical Architecture**.

A continuación, presento mi evaluación técnica estructurada, contrastando la propuesta con patrones reales de la industria para plataformas extensibles y de control.

---

## 1. Análisis de Patrones Arquitectónicos y Alineación

### A. Patrones bien alineados con prácticas maduras

**[Hechos de la Industria]**

* **Separación de Control Plane y Data/Execution Plane (Sección 5):** Este patrón es el estándar de oro en infraestructuras maduras (ej. *Kubernetes*, *Istio/Envoy*). Mantener el estado, la identidad y las políticas (`Control Plane`) fuera de la ruta crítica de inferencia de red pura (`Execution Plane`) garantiza alta disponibilidad y escalabilidad.
* **Inmutabilidad del Core mediante inversión de dependencias (Sección 6, Regla 5):** Es la base del sistema de plugins de *HashiCorp (go-plugin)*. El Core define la interfaz binaria o RPC, y los proveedores externos se adaptan a ella, protegiendo al núcleo de dependencias circulares.
* **Mediación forzada de acciones (Sección 8):** El flujo que exige que toda salida de modelo sea evaluada por un `Policy Engine` y un `Tool Engine` antes de tocar sistemas externos implementa una *Zero Trust Architecture* (NIST SP 800-207) real, mitigando vulnerabilidades críticas como inyecciones de prompts indirectas.

### B. Patrones que suelen fracasar en la implementación

**[Inferencias Arquitectónicas]**

* **Negociación dinámica de capacidades abstractas (Sección 7.3):** Que un registro asigne un modelo dinámicamente porque declara la capacidad "tool calling" falla en la práctica. El comportamiento de los LLMs no es determinista; dos modelos con la misma "capacidad" difieren enormemente en precisión sintáctica.
* **Separación estricta entre Agent Engine y Workflow Engine (Sección 7.4 y 7.5):** En producción, un agente autónomo complejo se modela mejor como un grafo dirigido acíclico (DAG) con estados. Separar ambos motores crea abstracciones duplicadas y condiciones de carrera en el almacenamiento de estado.

---

## 2. Acoplamiento: Cohesión y Separación

### Responsabilidades que deben vivir juntas (Alta Cohesión)

* **Identity, Policy y Audit (7.1, 7.2, 7.11):** La evaluación de una política requiere el contexto inmediato de identidad y debe emitir un log de auditoría atómico. Dividir esto en tres "motores" aislados a nivel de red destruye la latencia de las transacciones (ej. modelo *AWS IAM* u *Open Policy Agent*).

### Responsabilidades que deben separarse (Bajo Acoplamiento)

* **Tool Engine y el Core Control Plane:** La *ejecución física* de una herramienta (script, API call) debe ocurrir en un entorno aislado (sandbox) muy lejos de la memoria del plano de control para prevenir ataques de ejecución remota de código (RCE).
* **AI Provider y Runtime Engine:** Correctamente separados en el RFC. Normalizar APIs de proveedores (OpenAI/Anthropic) es lógicamente distinto a gestionar colas de VRAM en GPUs (*vLLM*).

---

## 3. Riesgos de la Hiper-Modularidad Temprana

El principal riesgo del RFC-0002 es la definición de **12 motores lógicos** en su versión inicial.

* **Latencia de Red (Network Hop Tax):** Si el equipo intenta desplegar esto como microservicios desde el día uno, una sola petición de usuario sufrirá penalizaciones de latencia inaceptables debido al enrutamiento interno, empeorando el ya lento *Time-to-First-Token* de la IA.
* **Parálisis por Análisis:** Diseñar las interfaces (gRPC/REST) perfectas entre 12 motores paralizará el desarrollo de producto temprano.

---

## 4. Recomendaciones para la primera implementación (Kern Lite)

Para preservar esta sólida arquitectura sin sobreconstruirla **[Recomendación]**:

* **Construir un Monolito Modular:** Todos los motores deben compilarse en un único binario ejecutable (ej. escrito en Rust o Go).
* **Llamadas en Memoria:** La comunicación entre motores debe ser a través de interfaces de código internas estructuradas, no llamadas de red.
* **Aislamiento por Paquetes:** El aislamiento se garantiza prohibiendo importaciones cruzadas de código (mediante linters de arquitectura). Así, cuando se necesite escalar, solo se extraerá el paquete maduro detrás de un endpoint de red.

---

## 5. Conceptos Emergentes para Futuros RFCs

* **Model Context Protocol (MCP):** Estándar abierto (iniciado por Anthropic) para exponer herramientas y conocimiento a los modelos. Kern debería usarlo para estandarizar su ecosistema de extensiones.
* **Open Policy Agent (OPA) / Rego:** Estándares para desacoplar las políticas de control de acceso. El `Policy Engine` de Kern debería estar respaldado por este tipo de evaluadores estandarizados.

---

## 6. Cambios Priorizados Recomendados al RFC-0002

1. **Reestructurar el diagrama visual (Sección 5):** Mostrar el `Control Plane` como un interceptor lateral (proxy/middleware) en lugar de un embudo vertical, aclarando que el flujo de datos pesados no satura las bases de datos de control.
2. **Fusionar Agent y Workflow Engine (Sección 7.4 y 7.5):** Unificarlos en un `Orchestration Engine` que maneje tanto ejecuciones paso-a-paso como razonamiento dinámico sobre un mismo sustrato de estado persistente.
3. **Consolidar Identidad y Políticas (Sección 7.1 y 7.2):** Renombrar a `Identity & Policy Engine` para garantizar la evaluación atómica de acceso sin latencia adicional.
4. **Exigir Sandboxing Explícito para Herramientas (Sección 7.6):** Añadir que *"el Tool Engine garantiza que la ejecución física ocurra en entornos de cómputo aislados preventivamente"*.
5. **Adoptar MCP implícita o explícitamente (Sección 7.3):** Indicar que los contratos de extensión *"buscarán compatibilidad con protocolos abiertos de contexto de modelos de la industria"* en lugar de reinventar la rueda.
6. **Validación programática de capacidades (Sección 7.3):** Sustituir la "selección por capacidades declaradas" por "validación continua", admitiendo que una etiqueta de capacidad no garantiza que el modelo la ejecute con precisión en producción sin guardrails.
7. **Establecer anonimización estricta por defecto (Sección 7.11):** El `Audit Engine` debe tener mandato para truncar o anonimizar prompts completos de forma predeterminada para cumplir regulaciones de privacidad de datos.
8. **Blindar la soberanía del Estado (Sección 10):** Especificar que la memoria a largo plazo y logs de los agentes se almacenan estructuralmente *fuera* de las plataformas externas de IA (evitando dependencias ocultas).
9. **Delimitar al Runtime Engine (Sección 7.9):** Declarar explícitamente que *"no realiza optimizaciones de GPU a bajo nivel ni programación de pesos"*, delegando eso a software especializado (Triton, vLLM).
10. **Añadir la directiva de "Monolito Modular por defecto" (Sección 11):** Ordenar formalmente que la primera implementación de Kern evite arquitecturas distribuidas prematuras.
11. **Requerir UI de Aprobación en Canales (Sección 7.10):** Especificar que todo motor de canal debe saber renderizar flujos interactivos de aprobación (Human-in-the-loop); de lo contrario, las políticas de bloqueo fallan en la interfaz de usuario.
12. **Corregir los "No Objetivos" (Sección 4):** Eliminar *"diseño de agentes"* de la lista de exclusiones, ya que la Sección 7.4 lo aborda directamente.

---

## 7. Fuentes Verificables

* **Zero Trust Architecture:** Basado en especificaciones del NIST SP 800-207 para mediación de acceso.
* **Model Context Protocol (MCP):** Especificación técnica promovida por Anthropic y otros para la integración estandarizada LLM-herramientas.
* **OWASP Top 10 for LLM Applications:** Justificación de las medidas de *sandboxing* de herramientas e intercepción de *prompts* frente a vulnerabilidades como *Indirect Prompt Injection*.
* **HashiCorp Plugin System (go-plugin):** Referencia en la industria para plataformas Core protegidas mediante la inversión de dependencias vía RPC.

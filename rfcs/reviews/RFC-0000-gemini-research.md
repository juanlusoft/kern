# Revisión externa de RFC-0000

- **RFC revisado:** RFC-0000 — The Kern RFC Process
- **Fuente:** Gemini
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---

Como Research Engineer, he analizado los procesos de decisión técnica de los ecosistemas extensibles y de código abierto más relevantes (Kubernetes, Rust, Python, HashiCorp, Apache, Linux e IETF). El objetivo de esta investigación es extraer patrones arquitectónicos y organizativos aplicables a Kern para optimizar nuestro proceso de RFC (Request for Comments).

A continuación, presento los hallazgos estructurados según tus requerimientos, distinguiendo claramente el nivel de respaldo empírico de cada punto.

1. Patrones comunes que hacen que un proceso de RFC escale bien
[Práctica Ampliamente Adoptada]

Separación entre Diseño e Implementación (IETF, Rust): La filosofía del IETF de "rough consensus and running code" se ha adaptado en proyectos modernos. En Rust y Kubernetes, el RFC define el qué y el por qué, pero la implementación se delega a Tracking Issues independientes. El RFC no se actualiza con cada detalle del código.

Roles Claros de "Sponsorship" (Kubernetes KEPs, Python PEPs): Un RFC rara vez prospera sin un patrocinador (Sponsor o Shepherd). En K8s, un KEP requiere aprobación explícita de los líderes del Special Interest Group (SIG) relevante. Esto evita que los RFCs queden en el limbo.

Secciones Obligatorias de Riesgo y Alternativas (Rust, Apache): Los RFCs de Rust exigen detallar "Drawbacks" (desventajas) y "Alternatives". Apache KIPs (Kafka) requieren explicar cómo se manejará la compatibilidad hacia atrás. Obligar al autor a argumentar en contra de su propia propuesta filtra diseños débiles temprano.

Revisiones de "Production Readiness" (Kubernetes): Los KEPs incluyen un cuestionario exhaustivo llamado Production Readiness Review (PRR) que obliga al autor a pensar en telemetría, fallos en cascada y planes de rollback antes de escribir una línea de código.

2. Fallos frecuentes de los RFC en equipos pequeños que luego crecen
[Observación de la Industria / Recomendación Propia]

El RFC como documento vivo perpetuo: Los equipos pequeños tienden a actualizar el documento original del RFC a medida que cambia el código. Al escalar, esto es inmanejable. [Práctica Adoptada]: El RFC debe ser inmutable una vez aceptado; los cambios posteriores se documentan en PRs o en RFCs suplementarios.

Falta de Criterios de "Graduación": Un equipo pequeño lanza una feature y ya está. En un ecosistema extensible, esto rompe integraciones. [Práctica Adoptada - K8s]: No planificar estados de madurez (Alpha, Beta, General Availability/GA) desde el RFC genera deuda técnica inmensa.

Bikeshedding por falta de un "Decider": Equipos que crecen intentan mantener un consenso puro. [Recomendación Propia]: El consenso puro no escala. El modelo de Python (Steering Council) o Linux (Subsystem Maintainers) establece que la discusión es abierta, pero la decisión recae en roles técnicos designados.

3. Metadatos y estados que son realmente útiles
[Práctica Ampliamente Adoptada]

Basado en la estructura de los PEPs de Python y los KEPs de Kubernetes, un frontmatter (YAML) útil debe ser austero pero estricto:

Metadatos esenciales:

Authors: Quién lo escribe.

Sponsors/Reviewers: Quién tiene autoridad para aprobarlo.

Component/Domain: A qué parte del sistema afecta (vital para plataformas extensibles).

Target Version: En qué versión se espera la primera iteración.

Superseded-By / Replaces: Enlaces directos si este RFC reemplaza a otro (vital para la trazabilidad histórica).

Ciclo de Estados Óptimo:

Draft: En redacción, discusión informal.

Provisional / Active: El diseño general está aprobado, pero la implementación puede revelar defectos que fuercen un cambio de diseño.

Accepted: Diseño bloqueado, listo para implementación final.

Final / Implemented: Desplegado en producción. Documento inmutable.

Rejected / Withdrawn / Superseded: Estados terminales de no-implementación.

4. Cómo evitar que los RFC se conviertan en burocracia
[Recomendación Propia basada en HashiCorp y Linux]

Filtro de Tamaño (T-Shirt Sizing): No todo cambio requiere un RFC. Si un cambio tarda más en documentarse que en implementarse y no afecta a APIs públicas o arquitectura core, no debe ser un RFC. Utiliza 1-pagers o Design Docs informales para cambios menores (común en infraestructuras internas tipo HashiCorp).

Timeboxing estricto de discusión: Los RFCs no deben estar en "Draft" eternamente. Establece una política (e.g., 14 días para comentarios). Si hay bloqueo, se escala a un arquitecto o líder técnico para decisión vinculante.

El código primero (a veces): [Idea sin Respaldo Suficiente en procesos formales, pero real en Linux]: Permitir Draft RFCs que vengan acompañados de un Proof of Concept (PoC) en código. A veces, un prototipo destruye la burocracia teórica mucho más rápido que semanas de debate en un documento.

5. Enlace con código, migraciones, versiones y deprecaciones
[Práctica Ampliamente Adoptada]

Tracking Issues (Rust, K8s): Una vez que un RFC pasa a Accepted, se crea un Tracking Issue en GitHub/GitLab. Todos los PRs relacionados con la implementación del RFC deben enlazar a este Issue, no al documento del RFC.

Feature Flags Obligatorias (K8s): Todo KEP introducido debe estar oculto tras un FeatureGate. Esto separa el despliegue del código de la habilitación de la característica.

Deprecation Policy explícita (Python, Kubernetes): Si un RFC altera una API pública o depreca un componente, el RFC debe incluir la línea de tiempo de deprecación (ej. "Warning en versión N, error por defecto en N+1, eliminación del código en N+2"). No se acepta el RFC sin esta ruta de migración.

6. Recomendaciones concretas para Kern (Plataforma Extensible Privada)
[Recomendación Propia]

Dado que Kern es una infraestructura de IA empresarial, la extensibilidad y la estabilidad son críticas.

Implementar un formato RFC de "Doble Audiencia": Como plataforma, los RFCs deben tener una sección obligatoria de User Impact (cómo afecta a los desarrolladores internos o clientes de la empresa que construyen sobre Kern) separada del Technical Design.

Exigir un plan de compatibilidad hacia atrás (Backwards Compatibility): Exigir explícitamente en el template del RFC la respuesta a: "¿Cómo romperá esto las integraciones existentes y cómo mitigaremos ese riesgo?". Inspirado en los FLIPs (Apache Flink).

Proceso de "RFC Lite" para integraciones: Dado que en IA los conectores y modelos cambian rápido, usar un formato reducido (solo API contract y dependencias de red) para agregar nuevos plugins o adaptadores, reservando el proceso pesado para cambios en el core del scheduler o almacenamiento.

Repositorio centralizado con CI/CD: Guardar los RFCs como Markdown en un repositorio Git dedicado (e.g., kern-rfcs). Usar acciones de CI para validar que el frontmatter YAML sea correcto y que las transiciones de estado estén aprobadas por los dueños del código (CODEOWNERS).

Fuentes y Referencias Verificables
Kubernetes (KEPs): Documentación del proceso y plantillas PRR en el repositorio kubernetes/enhancements. Kubernetes Enhancement Proposals

Rust (RFCs): Proceso de consenso y estructura del documento en rust-lang/rfcs. Rust RFCs

Python (PEPs): Definición de estados y metadata en el PEP 1 (PEP Purpose and Guidelines). PEP 1

Apache / Kafka (KIPs): Plantillas de compatibilidad en la wiki del proyecto. Kafka Improvement Proposals

IETF: RFC 7282: On Consensus and Humming in the IETF (Explica la filosofía de "rough consensus"). RFC 7282

¿Te gustaría que profundice en la estructura exacta de un Tracking Issue que conecta estos RFCs con el ciclo de vida de desarrollo de software (Jira/GitHub), o prefieres enfocarte en el diseño del template base para Kern?

# RevisiÃ³n externa de RFC-0000

- **RFC revisado:** RFC-0000 â€” The Kern RFC Process
- **Fuente:** Gemini
- **Fecha:** 2026-06-26
- **Estado:** Input de revisiÃ³n; no representa una decisiÃ³n de Kern

---

Como Research Engineer, he analizado los procesos de decisiÃ³n tÃ©cnica de los ecosistemas extensibles y de cÃ³digo abierto mÃ¡s relevantes (Kubernetes, Rust, Python, HashiCorp, Apache, Linux e IETF). El objetivo de esta investigaciÃ³n es extraer patrones arquitectÃ³nicos y organizativos aplicables a Kern para optimizar nuestro proceso de RFC (Request for Comments).

A continuaciÃ³n, presento los hallazgos estructurados segÃºn tus requerimientos, distinguiendo claramente el nivel de respaldo empÃ­rico de cada punto.

1. Patrones comunes que hacen que un proceso de RFC escale bien
[PrÃ¡ctica Ampliamente Adoptada]

SeparaciÃ³n entre DiseÃ±o e ImplementaciÃ³n (IETF, Rust): La filosofÃ­a del IETF de "rough consensus and running code" se ha adaptado en proyectos modernos. En Rust y Kubernetes, el RFC define el quÃ© y el por quÃ©, pero la implementaciÃ³n se delega a Tracking Issues independientes. El RFC no se actualiza con cada detalle del cÃ³digo.

Roles Claros de "Sponsorship" (Kubernetes KEPs, Python PEPs): Un RFC rara vez prospera sin un patrocinador (Sponsor o Shepherd). En K8s, un KEP requiere aprobaciÃ³n explÃ­cita de los lÃ­deres del Special Interest Group (SIG) relevante. Esto evita que los RFCs queden en el limbo.

Secciones Obligatorias de Riesgo y Alternativas (Rust, Apache): Los RFCs de Rust exigen detallar "Drawbacks" (desventajas) y "Alternatives". Apache KIPs (Kafka) requieren explicar cÃ³mo se manejarÃ¡ la compatibilidad hacia atrÃ¡s. Obligar al autor a argumentar en contra de su propia propuesta filtra diseÃ±os dÃ©biles temprano.

Revisiones de "Production Readiness" (Kubernetes): Los KEPs incluyen un cuestionario exhaustivo llamado Production Readiness Review (PRR) que obliga al autor a pensar en telemetrÃ­a, fallos en cascada y planes de rollback antes de escribir una lÃ­nea de cÃ³digo.

2. Fallos frecuentes de los RFC en equipos pequeÃ±os que luego crecen
[ObservaciÃ³n de la Industria / RecomendaciÃ³n Propia]

El RFC como documento vivo perpetuo: Los equipos pequeÃ±os tienden a actualizar el documento original del RFC a medida que cambia el cÃ³digo. Al escalar, esto es inmanejable. [PrÃ¡ctica Adoptada]: El RFC debe ser inmutable una vez aceptado; los cambios posteriores se documentan en PRs o en RFCs suplementarios.

Falta de Criterios de "GraduaciÃ³n": Un equipo pequeÃ±o lanza una feature y ya estÃ¡. En un ecosistema extensible, esto rompe integraciones. [PrÃ¡ctica Adoptada - K8s]: No planificar estados de madurez (Alpha, Beta, General Availability/GA) desde el RFC genera deuda tÃ©cnica inmensa.

Bikeshedding por falta de un "Decider": Equipos que crecen intentan mantener un consenso puro. [RecomendaciÃ³n Propia]: El consenso puro no escala. El modelo de Python (Steering Council) o Linux (Subsystem Maintainers) establece que la discusiÃ³n es abierta, pero la decisiÃ³n recae en roles tÃ©cnicos designados.

3. Metadatos y estados que son realmente Ãºtiles
[PrÃ¡ctica Ampliamente Adoptada]

Basado en la estructura de los PEPs de Python y los KEPs de Kubernetes, un frontmatter (YAML) Ãºtil debe ser austero pero estricto:

Metadatos esenciales:

Authors: QuiÃ©n lo escribe.

Sponsors/Reviewers: QuiÃ©n tiene autoridad para aprobarlo.

Component/Domain: A quÃ© parte del sistema afecta (vital para plataformas extensibles).

Target Version: En quÃ© versiÃ³n se espera la primera iteraciÃ³n.

Superseded-By / Replaces: Enlaces directos si este RFC reemplaza a otro (vital para la trazabilidad histÃ³rica).

Ciclo de Estados Ã“ptimo:

Draft: En redacciÃ³n, discusiÃ³n informal.

Provisional / Active: El diseÃ±o general estÃ¡ aprobado, pero la implementaciÃ³n puede revelar defectos que fuercen un cambio de diseÃ±o.

Accepted: DiseÃ±o bloqueado, listo para implementaciÃ³n final.

Final / Implemented: Desplegado en producciÃ³n. Documento inmutable.

Rejected / Withdrawn / Superseded: Estados terminales de no-implementaciÃ³n.

4. CÃ³mo evitar que los RFC se conviertan en burocracia
[RecomendaciÃ³n Propia basada en HashiCorp y Linux]

Filtro de TamaÃ±o (T-Shirt Sizing): No todo cambio requiere un RFC. Si un cambio tarda mÃ¡s en documentarse que en implementarse y no afecta a APIs pÃºblicas o arquitectura core, no debe ser un RFC. Utiliza 1-pagers o Design Docs informales para cambios menores (comÃºn en infraestructuras internas tipo HashiCorp).

Timeboxing estricto de discusiÃ³n: Los RFCs no deben estar en "Draft" eternamente. Establece una polÃ­tica (e.g., 14 dÃ­as para comentarios). Si hay bloqueo, se escala a un arquitecto o lÃ­der tÃ©cnico para decisiÃ³n vinculante.

El cÃ³digo primero (a veces): [Idea sin Respaldo Suficiente en procesos formales, pero real en Linux]: Permitir Draft RFCs que vengan acompaÃ±ados de un Proof of Concept (PoC) en cÃ³digo. A veces, un prototipo destruye la burocracia teÃ³rica mucho mÃ¡s rÃ¡pido que semanas de debate en un documento.

5. Enlace con cÃ³digo, migraciones, versiones y deprecaciones
[PrÃ¡ctica Ampliamente Adoptada]

Tracking Issues (Rust, K8s): Una vez que un RFC pasa a Accepted, se crea un Tracking Issue en GitHub/GitLab. Todos los PRs relacionados con la implementaciÃ³n del RFC deben enlazar a este Issue, no al documento del RFC.

Feature Flags Obligatorias (K8s): Todo KEP introducido debe estar oculto tras un FeatureGate. Esto separa el despliegue del cÃ³digo de la habilitaciÃ³n de la caracterÃ­stica.

Deprecation Policy explÃ­cita (Python, Kubernetes): Si un RFC altera una API pÃºblica o depreca un componente, el RFC debe incluir la lÃ­nea de tiempo de deprecaciÃ³n (ej. "Warning en versiÃ³n N, error por defecto en N+1, eliminaciÃ³n del cÃ³digo en N+2"). No se acepta el RFC sin esta ruta de migraciÃ³n.

6. Recomendaciones concretas para Kern (Plataforma Extensible Privada)
[RecomendaciÃ³n Propia]

Dado que Kern es una infraestructura de IA empresarial, la extensibilidad y la estabilidad son crÃ­ticas.

Implementar un formato RFC de "Doble Audiencia": Como plataforma, los RFCs deben tener una secciÃ³n obligatoria de User Impact (cÃ³mo afecta a los desarrolladores internos o clientes de la empresa que construyen sobre Kern) separada del Technical Design.

Exigir un plan de compatibilidad hacia atrÃ¡s (Backwards Compatibility): Exigir explÃ­citamente en el template del RFC la respuesta a: "Â¿CÃ³mo romperÃ¡ esto las integraciones existentes y cÃ³mo mitigaremos ese riesgo?". Inspirado en los FLIPs (Apache Flink).

Proceso de "RFC Lite" para integraciones: Dado que en IA los conectores y modelos cambian rÃ¡pido, usar un formato reducido (solo API contract y dependencias de red) para agregar nuevos plugins o adaptadores, reservando el proceso pesado para cambios en el core del scheduler o almacenamiento.

Repositorio centralizado con CI/CD: Guardar los RFCs como Markdown en un repositorio Git dedicado (e.g., kern-rfcs). Usar acciones de CI para validar que el frontmatter YAML sea correcto y que las transiciones de estado estÃ©n aprobadas por los dueÃ±os del cÃ³digo (CODEOWNERS).

Fuentes y Referencias Verificables
Kubernetes (KEPs): DocumentaciÃ³n del proceso y plantillas PRR en el repositorio kubernetes/enhancements. Kubernetes Enhancement Proposals

Rust (RFCs): Proceso de consenso y estructura del documento en rust-lang/rfcs. Rust RFCs

Python (PEPs): DefiniciÃ³n de estados y metadata en el PEP 1 (PEP Purpose and Guidelines). PEP 1

Apache / Kafka (KIPs): Plantillas de compatibilidad en la wiki del proyecto. Kafka Improvement Proposals

IETF: RFC 7282: On Consensus and Humming in the IETF (Explica la filosofÃ­a de "rough consensus"). RFC 7282

Â¿Te gustarÃ­a que profundice en la estructura exacta de un Tracking Issue que conecta estos RFCs con el ciclo de vida de desarrollo de software (Jira/GitHub), o prefieres enfocarte en el diseÃ±o del template base para Kern?

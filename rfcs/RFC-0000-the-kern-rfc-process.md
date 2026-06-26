# RFC-0000 — The Kern RFC Process

- **Estado:** Accepted
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-26
- **Versión:** 0.2.2
- **Tipo:** Governance / Architecture Process
- **Dominio:** Gobernanza técnica de Kern
- **Decisión requerida:** Aprobación del proceso de decisiones técnicas de Kern

---

## 1. Resumen ejecutivo

Kern se construirá como una plataforma de infraestructura para IA privada empresarial, diseñada para sobrevivir a cambios de modelos, hardware, runtimes, proveedores y protocolos.

Para evitar decisiones improvisadas, dependencias accidentales y deuda arquitectónica, las decisiones relevantes se documentarán en el nivel proporcional a su riesgo: ADR, RFC-Lite o RFC.

Un documento de decisión no es decoración. Es el registro oficial de:

- qué problema existía;
- qué alternativas se evaluaron;
- qué decisión se tomó;
- por qué se tomó;
- qué consecuencias tiene;
- cómo puede evolucionar o sustituirse en el futuro.

Este documento define el proceso oficial de RFC de Kern, el uso de ADR y RFC-Lite, el gobierno fundacional, la revisión y la trazabilidad con implementación.

---

## 2. Motivación

Kern pretende ser una plataforma estable sobre tecnología inestable.

Los modelos de IA, aceleradores, runtimes, protocolos y proveedores evolucionarán a un ritmo superior al software empresarial convencional. Sin una disciplina explícita, el proyecto corre riesgos previsibles:

- acoplar el Core a una tecnología temporal;
- convertir necesidades puntuales de un cliente en reglas globales;
- perder el motivo de decisiones antiguas;
- reabrir debates ya resueltos;
- permitir cambios que rompan extensibilidad o compatibilidad;
- hacer imposible que un nuevo desarrollador entienda el sistema.

El proceso de decisiones existe para que Kern pueda evolucionar durante años sin depender de la memoria de una persona, una conversación o un modelo de IA.

---

## 3. Alcance

Este RFC regula cómo se toman y registran decisiones de producto técnico y arquitectura en Kern.

Aplica a:

- arquitectura del Core;
- contratos e interfaces públicas;
- SDKs;
- modelos de capacidades;
- proveedores de IA;
- runtimes;
- plugins;
- seguridad;
- compatibilidad;
- persistencia de datos;
- protocolos;
- cambios de versión;
- decisiones que afecten a más de un módulo;
- decisiones difíciles de revertir.

No regula:

- tareas pequeñas de implementación;
- correcciones de bugs sin cambio de comportamiento público;
- refactors internos sin impacto de contrato;
- decisiones de estilo locales ya cubiertas por convenciones de código;
- spikes aislados que no prometen compatibilidad ni llegan a producción.

---

## Glosario normativo

- **Core:** responsabilidades de plataforma declaradas como tales por RFCs Accepted. RFC-0000 no define todavía qué componentes lo forman; esa definición llegará en RFC-0002.
- **Interfaz pública:** contrato consumible por un plugin, SDK, proveedor, runtime, canal, instalación de cliente o servicio externo. Incluye APIs, eventos, schemas, CLI, archivos de configuración documentados y contratos de extensión.
- **Módulo:** unidad lógica con responsabilidad propia y frontera explícita, aunque todavía no corresponda a un paquete de código.
- **Cambio reversible:** cambio que puede retirarse sin migración de datos, ruptura de contrato ni impacto permanente en clientes.
- **Cambio difícil de revertir:** cambio que afecta contratos públicos, datos persistidos, seguridad, compatibilidad, SDKs o despliegues de clientes.
- **Spike:** prototipo temporal y desechable utilizado para aprender o validar una hipótesis. No puede convertirse en producción ni definir un contrato público sin el documento de decisión correspondiente.
- **Technical Owner:** persona con autoridad final de aceptación técnica y de producto. Durante la fase fundacional de Kern, este rol corresponde a Juan Luis, salvo delegación explícita por escrito.
- **Independent review:** revisión realizada por una persona o agente distinto del autor principal del documento.

---

## 4. Niveles de decisión

Toda decisión relevante debe documentarse en el nivel proporcional a su riesgo: ADR, RFC-Lite o RFC.

### ADR — Architecture Decision Record

Para decisiones locales, reversibles o de bajo impacto.

- Se guarda en `decisions/`.
- Debe incluir: contexto, decisión, consecuencias y fecha.
- No requiere revisión externa obligatoria.

### RFC-Lite

Para integraciones, adaptadores, plugins, conectores, cambios entre módulos o decisiones de alcance medio.

- No puede cambiar contratos centrales, seguridad global, modelo de permisos, persistencia fundamental ni compatibilidad pública sin escalar a RFC completo.
- Debe incluir: problema, propuesta, alternativas, impacto, compatibilidad, validación y responsable.
- Puede vivir temporalmente en `rfcs/` con tipo `RFC-Lite`.

### RFC

Obligatorio para decisiones de arquitectura, interfaces públicas, SDKs, seguridad, permisos, persistencia, compatibilidad, capacidades, proveedores, runtimes, plugins base y cambios costosos de revertir.

---

## 5. Cuándo es obligatorio crear un RFC

Se debe crear un RFC antes de implementar cambios que cumplan una o más de estas condiciones:

1. Añaden o modifican una interfaz pública.
2. Añaden una nueva capacidad del sistema.
3. Introducen una dependencia tecnológica relevante.
4. Cambian la relación entre motores de Kern.
5. Afectan a la seguridad, aislamiento o permisos.
6. Afectan a compatibilidad con plugins, herramientas, proveedores o runtimes.
7. Introducen persistencia de datos nueva o alteran su semántica.
8. Afectan a varias organizaciones, clientes o distribuciones.
9. Son difíciles o costosos de revertir.
10. Cambian una decisión documentada en un RFC Accepted.

Ejemplos que requieren RFC:

- Definir el contrato de `AI Provider`.
- Añadir el modelo de capacidades.
- Crear el SDK de plugins.
- Cambiar el sistema de permisos.
- Elegir el mecanismo de versionado de herramientas.
- Añadir un runtime local nuevo.
- Cambiar el modelo de memoria de agentes.
- Introducir un protocolo de comunicación externo.

Ejemplos que no requieren RFC:

- Corregir un error de validación.
- Mejorar una consulta SQL sin alterar resultados.
- Cambiar un icono.
- Añadir una prueba unitaria.
- Renombrar una variable interna.
- Optimizar una función sin modificar su contrato.

---

## 6. Estados de un RFC

Cada RFC tendrá exactamente uno de estos estados:

### Draft

Documento en elaboración. No representa una decisión aprobada y no debe tratarse como norma.

### Review

Documento listo para crítica técnica. Puede recibir observaciones de arquitectura, seguridad, producto, implementación y compatibilidad.

### Accepted

Decisión aprobada. Se convierte en referencia obligatoria para futuras implementaciones.

### Implemented

La decisión Accepted ya cuenta con una implementación de referencia o está aplicada de forma verificable en Kern.

### Superseded

El RFC ha sido sustituido por otro RFC más reciente. Debe incluir referencia explícita al RFC sustituto.

### Deprecated

La decisión sigue existiendo por compatibilidad o transición, pero no debe usarse en desarrollos nuevos.

### Rejected

La propuesta fue evaluada y descartada. Se conserva para evitar reabrir el mismo debate sin información nueva.

### Withdrawn

El autor retiró el RFC antes de una decisión final. Conserva su historial y no puede reabrirse sin información materialmente nueva.

---

## 7. Numeración y nombres

Los RFC usarán numeración secuencial de cuatro dígitos:

```text
RFC-0000
RFC-0001
RFC-0002
...
```

La numeración nunca se reutiliza.

El número RFC se reserva al abrir el PR de propuesta y se registra en `rfcs/README.md`.

Si dos ramas intentan usar el mismo número, el PR que se fusione después renumera su RFC antes de merge.

Un RFC Accepted solo puede recibir correcciones editoriales que no cambien significado técnico, normativo ni de compatibilidad.

Toda edición posterior debe quedar registrada en `Historial de cambios`.

Si el significado cambia, se crea un nuevo RFC que amplía, sustituye o depreca el anterior.

Un cambio ambiguo se considera sustancial por defecto.

La numeración nunca se reutiliza aunque un RFC sea Rejected o Withdrawn.

Formato de archivo:

```text
rfcs/RFC-0000-the-kern-rfc-process.md
rfcs/RFC-0001-kern-manifesto.md
rfcs/RFC-0002-kern-architecture.md
```

Reglas:

* El número identifica la decisión, no su versión.
* Cambios sustanciales requieren un RFC nuevo que lo amplíe, sustituya o depreque.
* Correcciones editoriales menores pueden hacerse manteniendo historial de cambios.

---

## 8. Estructura obligatoria

Un RFC no debe rellenar secciones que no aplican. Debe indicar “No aplica” solo cuando sea necesario para evitar ambigüedad.

Campos mínimos obligatorios para un RFC completo:

```text
Título
Estado
Autor
Fecha
Versión
Tipo
Dominio
Resumen ejecutivo
Problema y motivación
Objetivos y no objetivos
Diseño propuesto
Alternativas consideradas
Consecuencias y riesgos
Compatibilidad
Seguridad y privacidad, si aplica
Migración y rollback, si aplica
Validación
Preguntas abiertas
Referencias
Historial de cambios
```

Secciones condicionales:

```text
Contratos e interfaces afectados
Modelo de datos
Observabilidad y operación
Rendimiento y costes
Impacto en SDK
Impacto en plugins
Impacto en clientes existentes
Plan de rollout
Trigger de revisión
```

---

## 9. Calidad mínima para pasar a Review

Un RFC no puede entrar en Review si:

* no explica el problema concreto;
* no define objetivos y no objetivos;
* no enumera alternativas reales;
* no identifica interfaces o módulos afectados;
* no aborda compatibilidad;
* no analiza seguridad cuando trata datos, permisos o ejecución;
* no explica cómo validar la decisión;
* depende de una tecnología concreta sin justificar por qué es inevitable;
* propone código antes de definir el contrato.

Los spikes están permitidos antes o durante un RFC, pero deben marcarse como experimentales y no deben crear compatibilidad prometida.

---

## 10. Proceso de revisión

El flujo estándar será:

```text
Idea
↓
Draft
↓
Review técnico
↓
Investigación externa, si aplica
↓
Revisión de compatibilidad y seguridad
↓
Decisión Technical Owner
↓
Accepted / Rejected / Withdrawn
↓
Implementación
↓
Implemented
```

`Changes requested` no es un estado de RFC: es una acción del Technical Owner que devuelve el documento a `Draft` para revisión del autor.

Objetivo de revisión inicial: 7 días naturales.

Si un RFC lleva 14 días naturales sin decisión, el Technical Owner debe elegir entre: pedir cambios, aceptar, rechazar, retirar o dejarlo explícitamente en espera con motivo.

No se bloquean hotfixes de seguridad o incidentes operativos: se permite un ADR posterior documentado dentro de los 3 días siguientes.

Cada RFC relevante será revisado desde cuatro perspectivas:

### Arquitectura

Evalúa coherencia con principios, límites de módulos, extensibilidad y evolución a largo plazo.

### Ingeniería

Busca ambigüedades, casos límite, complejidad accidental, problemas de implementación y compatibilidad.

### Investigación

Compara estándares, protocolos, prácticas emergentes y alternativas externas cuando el tema pueda cambiar rápidamente.

### Producto y operación

Evalúa impacto comercial, soporte, despliegue, observabilidad, costes y migraciones reales de clientes.

---

## 11. Autoridad y gobierno

El autor puede proponer un RFC, pero no puede ser el único aprobador.

Un RFC completo necesita al menos una independent review antes de poder pasar a Accepted.

El Technical Owner tiene la decisión final de aceptar, rechazar, retirar o solicitar cambios.

Durante la fase fundacional, Juan Luis es el Technical Owner.

El Architecture Lead propone, integra revisiones y recomienda decisiones, pero no sustituye la aprobación del Technical Owner.

En caso de ausencia o bloqueo del Technical Owner, el RFC permanece en Review o se rechaza/retira; no se acepta automáticamente.

La futura creación de un Architecture Council requerirá un RFC posterior.

La aceptación no significa que la implementación sea inmediata. Significa que la dirección arquitectónica ha sido aprobada.

Un RFC Accepted puede ser revisado por un RFC posterior, pero nunca se modifica de forma silenciosa para cambiar el significado de una decisión histórica.

---

## 12. Relación entre RFCs

Los RFC pueden:

* depender de otro RFC;
* ampliar otro RFC;
* sustituir otro RFC;
* deprecar otro RFC;
* entrar en conflicto con otro RFC.

Toda relación debe declararse explícitamente en la cabecera o sección de referencias.

Ejemplo:

```text
Supersedes: RFC-0005
Depends on: RFC-0004
Related: RFC-0012
```

Si dos RFC Accepted entran en conflicto, prevalece el RFC más reciente solo cuando declare explícitamente `Supersedes`.

Si no hay sustitución explícita, el conflicto requiere un ADR o RFC de resolución aprobado por el Technical Owner.

Un RFC Withdrawn conserva su historial. No puede reabrirse sin información materialmente nueva.

RFC-0000 solo puede modificarse mediante un RFC posterior de tipo `Governance`, con revisión independiente y aceptación explícita del Technical Owner.

---

## 13. Reglas de compatibilidad

Antes de aceptar un RFC se debe responder:

1. ¿Rompe una interfaz pública?
2. ¿Afecta a un plugin existente?
3. ¿Afecta a un proveedor de IA existente?
4. ¿Afecta a un runtime existente?
5. ¿Afecta a una instalación de cliente?
6. ¿Se puede migrar sin parada?
7. ¿Existe rollback?
8. ¿Qué versión mínima de SDK requiere?

Si una decisión rompe compatibilidad, el RFC debe definir:

* el motivo;
* el alcance;
* la ruta de migración;
* el periodo de soporte;
* el plan de retirada;
* el comportamiento durante transición.

---

## 14. Reglas de diseño para RFCs de Kern

Todo RFC de arquitectura debe respetar estas reglas:

1. El Core no debe depender de un proveedor, modelo, runtime, hardware o cliente concreto.
2. Las dependencias externas deben entrar mediante contratos explícitos.
3. La extensibilidad debe ser intencional, no accidental.
4. Las capacidades se describen por necesidad funcional, no por marca o producto.
5. Lo específico de cliente debe vivir fuera del Core salvo justificación excepcional.
6. Las decisiones irreversibles requieren más evidencia que las reversibles.
7. La simplicidad tiene prioridad sobre la flexibilidad hipotética.
8. Un plugin no puede obtener privilegios superiores a los concedidos por el Core.
9. Las interfaces públicas deben versionarse.
10. Toda automatización relevante debe ser observable, auditable y reversible cuando sea razonable.

---

## 15. Repositorio y fuentes de verdad

La fuente de verdad de los RFC será el repositorio de Kern.

Los RFC de plataforma comunes viven en el repositorio principal de Kern.

Las decisiones específicas de un cliente que contengan datos, reglas o integraciones confidenciales deben vivir en un repositorio privado de entrega o cliente.

Un RFC de plataforma puede referenciar una decisión privada mediante identificador, sin copiar información confidencial.

Estructura inicial:

```text
rfcs/
  RFC-0000-the-kern-rfc-process.md
  RFC-0001-kern-manifesto.md
  RFC-0002-kern-architecture.md
  README.md
```

El archivo `rfcs/README.md` contendrá un índice con:

* número;
* título;
* estado;
* fecha;
* autor;
* RFCs relacionados;
* resumen de una línea.

Todo PR que implemente un RFC Accepted debe incluir en su descripción:

```text
Implements: RFC-XXXX
```

Todo RFC Accepted que tenga implementación debe enlazar, cuando exista, su issue, PR principal, release o migración.

No hace falta crear todavía automatización CI para esto; la regla se aplicará manualmente hasta que un RFC posterior introduzca tooling.

No se considerará oficial una decisión que exista únicamente en:

* un chat;
* una tarea;
* una nota privada;
* un mensaje de Telegram;
* una conversación verbal;
* una implementación de código sin RFC cuando este era obligatorio.

---

## 16. Trigger de revisión

Los RFC que dependan de estándares externos, modelos, proveedores, runtimes, hardware o protocolos deben definir cuándo volver a revisarse.

Ejemplos:

* cambio incompatible de un protocolo;
* retirada de un proveedor;
* nueva versión mayor del Runtime SDK;
* hallazgo de seguridad;
* cambio de soporte de hardware.

No se introduce caducidad automática para todos los RFC.

---

## 17. Métrica de éxito

El proceso funciona si, dentro de varios años, un desarrollador puede responder leyendo RFCs:

* qué es Kern;
* cuáles son sus límites;
* cómo crear un runtime compatible;
* cómo crear un provider compatible;
* cómo crear un plugin compatible;
* por qué existen sus contratos principales;
* qué decisiones siguen vigentes;
* qué decisiones ya fueron sustituidas.

---

## 18. Decisión propuesta

Adoptar este proceso de decisiones como mecanismo obligatorio de gobierno técnico para Kern a partir de RFC-0000.

---

## 19. Preguntas abiertas

1. ¿El consejo de arquitectura tendrá roles formales o solo proceso de revisión?
2. ¿Los RFC de producto y los RFC técnicos vivirán en el mismo repositorio?
3. ¿Cómo se vincularán RFCs Accepted con tareas, pull requests y releases?
4. ¿Habrá RFCs privados por cliente o solo RFCs de plataforma?

---

## 20. Historial de cambios

### 0.1 — 2026-06-26

Borrador inicial.

### 0.2 — 2026-06-26

Revisión del proceso tras análisis externo de arquitectura e investigación comparativa. Añade glosario, niveles ADR/RFC-Lite/RFC, gobierno fundacional, trazabilidad, reglas de conflicto, manejo de spikes y medidas anti-burocracia.

### 0.2.1 — 2026-06-26

Corrección de renderizado Markdown y aclaraciones menores sobre el flujo de revisión, `Withdrawn` y autoridad fundacional.

### 0.2.2 — 2026-06-26

RFC Accepted por el Technical Owner tras revisión independiente de arquitectura e investigación externa. El proceso de ADR, RFC-Lite y RFC pasa a ser obligatorio para las decisiones relevantes de Kern.

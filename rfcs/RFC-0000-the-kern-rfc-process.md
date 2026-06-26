# RFC-0000 — The Kern RFC Process

- **Estado:** Draft
- **Autor:** Kern Architecture Council
- **Fecha:** 2026-06-26
- **Versión:** 0.1
- **Tipo:** Governance / Architecture Process
- **Decisión requerida:** Aprobación del proceso de RFC de Kern

---

## 1. Resumen ejecutivo

Kern se construirá como una plataforma de infraestructura para IA privada empresarial, diseñada para sobrevivir a cambios de modelos, hardware, runtimes, proveedores y protocolos.

Para evitar decisiones improvisadas, dependencias accidentales y deuda arquitectónica, toda decisión relevante se documentará mediante un RFC: _Request for Comments_.

Un RFC no es documentación decorativa. Es el registro oficial de:

- qué problema existía;
- qué alternativas se evaluaron;
- qué decisión se tomó;
- por qué se tomó;
- qué consecuencias tiene;
- cómo puede evolucionar o sustituirse en el futuro.

Este documento define el ciclo de vida, estructura, numeración, revisión y gobierno de los RFC de Kern.

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

El proceso RFC existe para que Kern pueda evolucionar durante años sin depender de la memoria de una persona, una conversación o un modelo de IA.

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
- experimentos aislados que no lleguen al producto.

---

## 4. Principio rector

> Ninguna decisión relevante debe depender únicamente de una conversación, una persona, un modelo de IA o una implementación concreta.

Toda decisión que afecte a la arquitectura futura debe poder entenderse leyendo el RFC correspondiente.

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

El autor retiró el RFC antes de una decisión final. No debe considerarse una alternativa formalmente descartada.

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

Formato de archivo:

```text
rfcs/RFC-0000-the-kern-rfc-process.md
rfcs/RFC-0001-kern-manifesto.md
rfcs/RFC-0002-kern-architecture.md
```

Reglas:

* El número identifica la decisión, no su versión.
* Un RFC Accepted no se reescribe silenciosamente.
* Cambios sustanciales requieren un RFC nuevo que lo amplíe, sustituya o depreque.
* Correcciones editoriales menores pueden hacerse manteniendo historial de cambios.

---

## 8. Estructura obligatoria

Todo RFC debe incluir, como mínimo, las siguientes secciones:

```text
Título
Estado
Autor
Fecha
Versión
Tipo
Resumen ejecutivo
Motivación
Problema
Objetivos
No objetivos
Diseño propuesto
Contratos e interfaces afectados
Alternativas consideradas
Consecuencias
Compatibilidad
Seguridad y privacidad
Observabilidad y operación
Migración
Plan de pruebas y validación
Preguntas abiertas
Referencias
Historial de cambios
```

Secciones opcionales cuando aplique:

```text
Modelo de datos
Rendimiento y costes
Impacto en SDK
Impacto en plugins
Impacto en clientes existentes
Rollout
Plan de rollback
Riesgos conocidos
Decisiones diferidas
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
Decisión CTO
↓
Accepted / Rejected / Withdrawn
↓
Implementación
↓
Implemented
```

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

## 11. Autoridad de decisión

La autoridad final para aceptar o rechazar un RFC corresponde al CTO de Kern.

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

No se considerará oficial una decisión que exista únicamente en:

* un chat;
* una tarea;
* una nota privada;
* un mensaje de Telegram;
* una conversación verbal;
* una implementación de código sin RFC cuando este era obligatorio.

---

## 16. Métrica de éxito

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

## 17. Decisión propuesta

Adoptar este proceso RFC como mecanismo obligatorio de gobierno técnico para Kern a partir de RFC-0000.

---

## 18. Preguntas abiertas

1. ¿El consejo de arquitectura tendrá roles formales o solo proceso de revisión?
2. ¿Qué nivel de cambio requiere aprobación explícita del fundador además del CTO?
3. ¿Los RFC de producto y los RFC técnicos vivirán en el mismo repositorio?
4. ¿Cómo se vincularán RFCs Accepted con tareas, pull requests y releases?
5. ¿Habrá RFCs privados por cliente o solo RFCs de plataforma?

---

## 19. Historial de cambios

### 0.1 — 2026-06-26

Borrador inicial.

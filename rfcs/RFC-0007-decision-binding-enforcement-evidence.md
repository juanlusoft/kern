# RFC-0007 — Decision Binding, Enforcement Evidence and Runtime Verification

- **Estado:** Draft
- **Versión:** 0.1
- **Fecha:** 2026-06-27

## 1. Resumen ejecutivo

Este RFC define la evidencia mínima que Kern necesita para verificar, en tiempo de efecto, que una operación gobernada corresponde realmente a un Decision Binding válido, fresco, no revocado y consumible.

## 2. Problema

RFC-0003 define ejecución gobernada, Decision Binding, aprobación humana, transformación y auditoría.
RFC-0004 define identidad, tenancy, scopes, delegación y revocación.
RFC-0005 define evaluación de policy, composición y decisiones provisionales.
RFC-0006 define capabilities, tools, extensiones, implementación y enforcement.

Falta formalizar la evidencia verificable que liga esa cadena lógica con el momento exacto en el que se produce un efecto externo.

## 3. Objetivos

- Definir qué debe probarse antes de ejecutar.
- Separar decisión, evidencia de enforcement y resultado operativo.
- Mantener el modelo fail-closed ante Binding ausente, obsoleto o ambiguo.
- Evitar que una recomendación, evaluación provisional o aprobación humana aislada produzca efecto.

## 4. No objetivos

- No redefine el motor de policy.
- No redefine el ciclo de ejecución gobernada.
- No introduce un protocolo criptográfico concreto.
- No decide almacenamiento, formato de red ni transporte.

## 5. Conceptos normativos

### Decision Binding

Autorización ejecutable y verificable emitida para una solicitud final concreta.
Un Decision Binding no es una recomendación, una respuesta de policy, una aprobación humana ni una credencial amplia. Es una autorización ejecutable y verificable, emitida para una solicitud final concreta y consumible únicamente bajo las restricciones que contiene.

### Binding Issuer

Entidad lógica que emite el Decision Binding final.

### Binding Verifier

Componente que valida el Binding en tiempo de efecto antes de permitir cualquier acción externa.

### Enforcement Evidence

Conjunto mínimo de huellas, marcas, referencias y comprobaciones que prueban que la ejecución se realizó con el Binding correcto.

### Binding Subject

Solicitud final concreta, organización, identidades, scope, payload final y restricciones asociadas.

### Binding Freshness

Estado que indica que el Binding sigue vigente, no ha expirado y no ha sido revocado ni consumido.

### Binding Consumption

Uso único del Binding para una ejecución concreta o lote gobernado concreto.

### Effect-Time Verification

Verificación realizada justo antes del efecto externo.

### Replay

Intento de reutilizar un Binding ya consumido o aplicado a un contexto distinto.

### Authoritative State

Estado maestro verificable para organización, identidad, revocación, delegación y consumo.

## 6. Modelo lógico de Decision Binding

Un Binding debe vincular, como mínimo:

- solicitud final;
- organización;
- identidades relevantes;
- scope final;
- payload final o huella verificable;
- policy o evaluación final aplicable;
- expiración;
- revocación;
- consumo;
- referencias de procedencia y correlación;
- restricciones de implementación y capability;
- versión o identidad verificable del artefacto autorizado.

Un Binding no puede autorizar una Implementation genérica, una versión flotante, un artefacto mutable, una organización implícita, una identidad no verificable ni un payload materialmente distinto del evaluado.

## 7. Emisión y contenido mínimo

Solo el Core o un componente controlado por Core puede emitir un Decision Binding final.
La emisión ocurre después de la evaluación final de policy y, cuando aplique, después de una aprobación humana válida.
Las transformaciones permitidas deben haber sido reevaluadas antes de emitir el Binding final.
Tool, Integration o Extension no pueden emitirse a sí mismos un Binding.
Si falta un atributo crítico, el sistema falla cerrado.

## 8. Verificación y consumo en tiempo de efecto

Antes de cualquier efecto externo, el ejecutor debe verificar:

- que el Binding existe y sigue vigente;
- que no está revocado, expirado ni consumido;
- que la organización y las identidades siguen siendo válidas;
- que scope, payload, capability e implementación coinciden con lo autorizado;
- que la procedencia, la correlación y las restricciones continúan intactas;
- que el estado maestro consultado es fresco y verificable.

Si una comprobación falla, no se ejecuta nada y se registra la razón.

## 9. Revocación, expiración e invalidación

Un Binding puede revocarse antes de su uso.
Un Binding expira por tiempo, por consumo o por invalidación del contexto de referencia.
El consumidor debe tratar cualquier duda como fallo cerrado.

## 10. Replay, idempotencia y concurrencia

Toda operación reintentable, asíncrona o capaz de duplicar efectos requiere idempotencia o mecanismo equivalente.
Si concurren dos intentos con el mismo Binding, solo el primero puede consumirlo.
Los intentos posteriores deben fallar cerrado y dejar evidencia.

## 11. Evidencia de enforcement y auditoría

La evidencia mínima debe incluir:

- identificador del Binding;
- huella del payload final;
- solicitud final;
- organización e identidades;
- decisión o evaluación final que lo originó;
- tiempo de emisión;
- tiempo de verificación;
- resultado de cada comprobación;
- estado de consumo o rechazo;
- correlación con auditoría.

## 12. Dependencias con RFC-0003 a RFC-0006

Este RFC no habilita una ruta de ejecución adicional. Formaliza la condición mecánica necesaria para que las garantías de RFC-0003 a RFC-0006 sean verificables en tiempo de efecto.

## 13. Invariantes

- Sin Binding verificable no hay efecto externo.
- Binding revocado o consumido no se reutiliza.
- Un Binding no amplía scope, identidad, tenant ni capability.
- La evidencia de enforcement debe ser verificable y auditable.
- Toda duda sobre frescura, procedencia o consumo se resuelve en deny.

## 14. Consecuencias

- Reduce ambigüedad operativa en ejecución distribuida.
- Permite auditoría posterior y verificación activa.
- Hace explícito el punto en el que una autorización deja de ser teórica y se convierte en efecto.

## 15. Preguntas abiertas

- Qué formato de huella se estandariza primero.
- Qué campos del Binding se consideran obligatorios para cada tipo de efecto.
- Qué política de retención se aplica a la evidencia.

## 16. Referencias

- RFC-0003 — Governed Execution Contract
- RFC-0004 — Identity, Tenancy and Authorization Model
- RFC-0005 — Policy Evaluation and Decision Model
- RFC-0006 — Capability, Tool and Extension Contract

## 17. Historial de cambios

### 0.1 — 2026-06-27

Primer borrador del contrato de evidencia de enforcement para Decision Bindings y verificación en tiempo de efecto.

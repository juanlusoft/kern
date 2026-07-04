# ADR-0002 — Module & Adapter Pluggability per Installation

- **Estado:** Accepted
- **Fecha:** 2026-06-29
- **Decisor:** Juan Luis, con ChatGPT actuando como CTO/arquitecto
- **Contexto:** Kern Core v1 y extensibilidad por instalación
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M6

## 1. Contexto

Kern Core ya dispone de un puerto genérico de lectura de sistemas externos gracias a M6.

Kern Core ya dispone de workflows gobernados gracias a M5.

El siguiente paso serán adaptadores concretos por instalación o cliente. Ejemplos futuros posibles incluyen Holded, Gmail, Odoo, Drive u otros sistemas equivalentes.

Hace falta fijar cómo se relacionan Core y esos módulos a largo plazo para evitar que Core se convierta en un monolito lleno de imports concretos por proveedor.

La decisión debe preservar la separación de tenancy e instalación coherente con RFC-0004 y alinearse con RFC-0006, donde se define el contrato de extensión de capabilities y tools.

## 2. Decisión

### 2.1 Core como anfitrión, no monolito

Kern Core es agnóstico y actúa como anfitrión.

Core no conoce, importa ni nombra proveedores concretos.

Core no debe importar directamente adaptadores como Holded, Gmail, Odoo o Drive, ni ningún proveedor o cliente concreto.

### 2.2 Registro por clave estable

Los módulos y adaptadores se registran bajo una clave estable contra un registry.

Ejemplos conceptuales, sin implementar código:

- `holded-read`
- `gmail-send`
- `odoo-read`
- `drive-read`

Core resuelve por clave, nunca por import directo.

### 2.3 Activación por instalación

Cada instalación declara por configuración qué módulos tiene activos.

Esto puede llamarse conceptualmente `installation manifest` o `installation module manifest`.

Activar o desactivar un módulo debe ser configuración, no modificación de Core.

### 2.4 Composición distinta por instalación

Distintas instalaciones pueden componer módulos distintos sobre el mismo Core.

Ejemplos conceptuales:

- installation A: `holded-read`, `gmail-send`
- installation B: `odoo-read`, `drive-read`

Estos ejemplos son ilustrativos y no implican que el repositorio implemente todavía esos proveedores.

### 2.5 Fail-closed

Si un workflow pide una capability cuyo módulo no está instalado o no está activo en esa instalación, el resultado debe ser `denied`, `unavailable` o `blocked`.

Nunca:

- crash;
- resultado fabricado;
- fallback silencioso;
- ejecución parcial insegura.

Esto sigue la política fail-closed del Core.

### 2.6 Aislamiento por instalación

Activar un módulo en una instalación no lo activa en otra.

No debe haber fuga de módulos entre instalaciones.

Esto queda conectado con RFC-0004: identity, tenancy, authorization y organization isolation.

### 2.7 Dirección de dependencias

La dirección de dependencias queda fijada así:

- contracts define ports
- Core depends on ports
- adapters depend on contracts
- contracts never depend on adapters
- Core never imports concrete adapters

Los contratos y puertos viven en el núcleo de contratos.

Los adaptadores concretos futuros dependen de los contratos.

Nunca al revés.

## 3. Consecuencias

### 3.1 Consecuencias positivas

- Añadir un proveedor nuevo significa registrar un módulo y activarlo por configuración.
- No hace falta editar Core para cada proveedor.
- Permite un mismo Core para muchas instalaciones.
- Habilita el modelo Kern Operator / Kern Factory.
- Refuerza el aislamiento multi-tenant.
- Reduce riesgo de acoplamiento a proveedores concretos.
- Facilita que M7+ implemente adaptadores reales sin romper Core.

### 3.2 Costes y trade-offs

- Hace falta un registry de módulos.
- Hace falta validar configuración por instalación.
- Hace falta testear módulos activos e inactivos.
- La resolución por clave debe ser auditable.
- El sistema debe fallar cerrado cuando una clave no existe o no está activa.

## 4. Relation to RFC-0006

RFC-0006 define el contrato de capability/tool extension.

ADR-0002 fija la política de instalación, registro y resolución de módulos por instalación.

RFC-0006 responde qué debe cumplir una capability.

ADR-0002 responde cómo se activa y resuelve una capability o adaptador en una instalación concreta.

## 5. Out of scope

Este ADR NO implica construir todavía un runtime dinámico de plugins.

NO implica carga en caliente.

NO implica marketplace.

NO implica instalación remota de plugins.

NO implica aislamiento tipo sandbox de plugins todavía.

NO implica resolver versionado avanzado de módulos todavía.

NO implementa registry en este PR.

NO implementa adaptadores reales.

NO implementa Holded, Gmail, Odoo ni Drive.

NO modifica Core.

NO modifica contracts.

NO modifica workflows.

NO modifica capabilities.

El ADR solo fija el principio arquitectónico y la costura: registry + installation manifest + fail-closed resolution.

La implementación mínima del registry llegará con el primer adaptador real o con el hito técnico que corresponda.

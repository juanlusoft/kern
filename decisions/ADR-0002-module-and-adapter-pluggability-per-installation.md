# ADR-0002 — Module & Adapter Pluggability per Installation

- **Estado:** Accepted
- **Fecha:** 2026-06-29
- **Decisor:** Juan Luis, con ChatGPT actuando como CTO/arquitecto
- **Contexto:** Kern Core v1 y extensibilidad por instalaciÃ³n
- **Base:** RFC-0000 a RFC-0010 Accepted, Core v1 Implementation Plan, Core v1 Build Backlog, M6

## 1. Contexto

Kern Core ya dispone de un puerto genÃ©rico de lectura de sistemas externos gracias a M6.

Kern Core ya dispone de workflows gobernados gracias a M5.

El siguiente paso serÃ¡n adaptadores concretos por instalaciÃ³n o cliente. Ejemplos futuros posibles incluyen Holded, Gmail, Odoo, Drive u otros sistemas equivalentes.

Hace falta fijar cÃ³mo se relacionan Core y esos mÃ³dulos a largo plazo para evitar que Core se convierta en un monolito lleno de imports concretos por proveedor.

La decisiÃ³n debe preservar la separaciÃ³n de tenancy e instalaciÃ³n coherente con RFC-0004 y alinearse con RFC-0006, donde se define el contrato de extensiÃ³n de capabilities y tools.

## 2. DecisiÃ³n

### 2.1 Core como anfitriÃ³n, no monolito

Kern Core es agnÃ³stico y actÃºa como anfitriÃ³n.

Core no conoce, importa ni nombra proveedores concretos.

Core no debe importar directamente adaptadores como Holded, Gmail, Odoo o Drive, ni ningÃºn proveedor o cliente concreto.

### 2.2 Registro por clave estable

Los mÃ³dulos y adaptadores se registran bajo una clave estable contra un registry.

Ejemplos conceptuales, sin implementar cÃ³digo:

- `holded-read`
- `gmail-send`
- `odoo-read`
- `drive-read`

Core resuelve por clave, nunca por import directo.

### 2.3 ActivaciÃ³n por instalaciÃ³n

Cada instalaciÃ³n declara por configuraciÃ³n quÃ© mÃ³dulos tiene activos.

Esto puede llamarse conceptualmente `installation manifest` o `installation module manifest`.

Activar o desactivar un mÃ³dulo debe ser configuraciÃ³n, no modificaciÃ³n de Core.

### 2.4 ComposiciÃ³n distinta por instalaciÃ³n

Distintas instalaciones pueden componer mÃ³dulos distintos sobre el mismo Core.

Ejemplos conceptuales:

- installation A: `holded-read`, `gmail-send`
- installation B: `odoo-read`, `drive-read`

Estos ejemplos son ilustrativos y no implican que el repositorio implemente todavÃ­a esos proveedores.

### 2.5 Fail-closed

Si un workflow pide una capability cuyo mÃ³dulo no estÃ¡ instalado o no estÃ¡ activo en esa instalaciÃ³n, el resultado debe ser `denied`, `unavailable` o `blocked`.

Nunca:

- crash;
- resultado fabricado;
- fallback silencioso;
- ejecuciÃ³n parcial insegura.

Esto sigue la polÃ­tica fail-closed del Core.

### 2.6 Aislamiento por instalaciÃ³n

Activar un mÃ³dulo en una instalaciÃ³n no lo activa en otra.

No debe haber fuga de mÃ³dulos entre instalaciones.

Esto queda conectado con RFC-0004: identity, tenancy, authorization y organization isolation.

### 2.7 DirecciÃ³n de dependencias

La direcciÃ³n de dependencias queda fijada asÃ­:

- contracts define ports
- Core depends on ports
- adapters depend on contracts
- contracts never depend on adapters
- Core never imports concrete adapters

Los contratos y puertos viven en el nÃºcleo de contratos.

Los adaptadores concretos futuros dependen de los contratos.

Nunca al revÃ©s.

## 3. Consecuencias

### 3.1 Consecuencias positivas

- AÃ±adir un proveedor nuevo significa registrar un mÃ³dulo y activarlo por configuraciÃ³n.
- No hace falta editar Core para cada proveedor.
- Permite un mismo Core para muchas instalaciones.
- Habilita el modelo Kern Operator / Kern Factory.
- Refuerza el aislamiento multi-tenant.
- Reduce riesgo de acoplamiento a proveedores concretos.
- Facilita que M7+ implemente adaptadores reales sin romper Core.

### 3.2 Costes y trade-offs

- Hace falta un registry de mÃ³dulos.
- Hace falta validar configuraciÃ³n por instalaciÃ³n.
- Hace falta testear mÃ³dulos activos e inactivos.
- La resoluciÃ³n por clave debe ser auditable.
- El sistema debe fallar cerrado cuando una clave no existe o no estÃ¡ activa.

## 4. Relation to RFC-0006

RFC-0006 define el contrato de capability/tool extension.

ADR-0002 fija la polÃ­tica de instalaciÃ³n, registro y resoluciÃ³n de mÃ³dulos por instalaciÃ³n.

RFC-0006 responde quÃ© debe cumplir una capability.

ADR-0002 responde cÃ³mo se activa y resuelve una capability o adaptador en una instalaciÃ³n concreta.

## 5. Out of scope

Este ADR NO implica construir todavÃ­a un runtime dinÃ¡mico de plugins.

NO implica carga en caliente.

NO implica marketplace.

NO implica instalaciÃ³n remota de plugins.

NO implica aislamiento tipo sandbox de plugins todavÃ­a.

NO implica resolver versionado avanzado de mÃ³dulos todavÃ­a.

NO implementa registry en este PR.

NO implementa adaptadores reales.

NO implementa Holded, Gmail, Odoo ni Drive.

NO modifica Core.

NO modifica contracts.

NO modifica workflows.

NO modifica capabilities.

El ADR solo fija el principio arquitectÃ³nico y la costura: registry + installation manifest + fail-closed resolution.

La implementaciÃ³n mÃ­nima del registry llegarÃ¡ con el primer adaptador real o con el hito tÃ©cnico que corresponda.

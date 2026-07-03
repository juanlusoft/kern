# ADR-0004 — Aislamiento del trabajo: un concepto por rama y árbol de trabajo aislado por esfuerzo

- **Estado:** Accepted
- **Fecha:** 2026-07-03
- **Decisor:** Juan Luis, con ChatGPT como CTO/arquitecto
- **Contexto:** Desarrollo multi-cliente y multi-tool de Kern sobre el monorepo
- **Base:** ADR-0002 (pluggability por instalación), RFC-0000 a RFC-0010 Accepted, boundary checker

## 1. Contexto

Kern es un monorepo con un Core compartido y una carpeta por tool bajo `packages/`
(`adapters/*`, `channels/*`, `orchestrators/*`). La modularidad del CÓDIGO ya está
garantizada por el `check-boundaries.mjs` (el Core no importa proveedores; un proveedor no
importa a otro).

Pero el desarrollo ocurre en paralelo: distintos clientes (p.ej. PacoPrint/Holded y el
cliente de presencia/PostgreSQL) y distintas features, a menudo asistidas por Codex.

Incidente que motiva esta decisión (PR #61): el trabajo de una feature de PacoPrint (top-N
de facturas por cliente) y el de una tool nueva de otro cliente (slice de presencia sobre
PostgreSQL) quedaron **cosidos en los mismos commits**, por trabajar sobre el mismo árbol de
trabajo y la misma rama. La separación por carpeta NO basta para evitarlo: una tool nueva,
además de su carpeta, debe tocar cableado compartido (schema, prompt del orquestador,
orquestación, contratos) para enchufarse, y esos cambios de dos features se mezclan si
comparten rama o working tree.

## 2. Decisión

### 2.1 Un branch = un solo concepto
Cada rama contiene exactamente un concepto (una feature, un fix, una tool). Nunca dos
features o dos clientes en la misma rama ni en el mismo commit.

### 2.2 Toda rama nace de `main`
Las ramas se crean siempre desde `main`, nunca desde otra rama de feature, para no heredar
trabajo ajeno.

### 2.3 Árbol de trabajo aislado por esfuerzo
Cada esfuerzo paralelo (por cliente o por feature) se desarrolla en su propio clon o
`git worktree`. El árbol de trabajo de un esfuerzo nunca arrastra cambios de otro.

### 2.4 Verificación antes de abrir el PR
Antes de abrir un PR, `git diff main` debe contener SOLO el concepto de la rama: ningún
fichero de otro cliente, feature o trabajo ajeno. Esta comprobación es criterio de
aceptación explícito en cada tarea (al mismo nivel que la cláusula de codificación UTF-8) y
se lista en el reporte del PR.

### 2.5 Verificación en revisión
Al revisar un PR se comprueba que el diff corresponde a un único concepto. Si mezcla
conceptos, no se fusiona: se resepara en ramas limpias desde `main`.

## 3. Consecuencias

- PRs pequeños, revisables y con historia limpia; un cliente nunca arrastra código de otro
  en su PR ni en `main`.
- Complementa ADR-0002 (modularidad de despliegue) y el boundary checker (modularidad de
  código) con **modularidad de proceso**.
- Coste asumido: coordinar clones/worktrees por esfuerzo y, cuando se detecte una mezcla,
  reseparar en ramas limpias (como se hizo con el PR #61).

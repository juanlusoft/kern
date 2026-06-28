---
title: Revisión de seguridad — RFC-0010 Agent, Workflow and Delegated Autonomy Model v0.2
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (multiagente empresarial, delegación de identidad, autorización distribuida, workflows, efectos, aprobaciones, control de autonomía)
fecha: 2026-06-28
documento_revisado: RFC-0010 — Agent, Workflow and Delegated Autonomy Model (v0.2)
veredicto: REQUIRES TARGETED CORRECTIONS
nota: Revisión de seguimiento de v0.2. v0.1 dejó dos PARTIAL y un bloqueante (frontera de confianza inter-agente).
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2 únicamente.

# Revisión de seguridad — RFC-0010 v0.2

Veredicto rápido: v0.2 **resuelve el bloqueante de v0.1 (frontera de confianza inter-agente) de forma ejemplar** y absorbe casi todas las correcciones — Inter-Agent Output como concepto (§5), clasificación no confiable + verificación independiente (§13), subdelegación como dimensión de autonomía (§5/§8), tope de concesión de autonomía y no-auto-aprobación indirecta (§7/§10), contexto de subagente ensamblado por Core (§13), terminación en cascada (§15). **36 PASS, 1 PARTIAL, 0 FAIL.** El único hueco que queda es real: el **fraccionamiento de una acción entre subagentes/ramas/tiempo** para evadir una aprobación.

## 1. Tabla de resultados

| # | Punto | Resultado | Sección |
|---|-------|-----------|---------|
| 1 | Conceptos definidos sin confusión | PASS | §5 |
| 2 | Agent/Workflow/Plan/Memory/estado ≠ autoridad | PASS | §5, §2, inv 1/4 |
| 3 | Instancia/Subagent en una sola org | PASS | §7, inv 2 |
| 4 | Conserva identidad/sponsor/principal/correlación/cadena | PASS | §7, §9, §17, inv 3 |
| 5 | Agent Identity sin permisos humanos ni suplantación | PASS | §5, §7 |
| 6 | Plan/intención/prompt/memoria ≠ autorización | PASS | §8, §5, inv 4 |
| 7 | Autonomy Boundary verificable, no instrucción | PASS | §5, §8 |
| 8 | Boundary cubre subdelegación/profundidad/cantidad/presupuesto | PASS | §5, §8, inv 18 |
| 9 | Cambio de plan/prompt/memoria no eleva autonomía | PASS | §8, §5, §7 |
| 10 | Elevación de autonomía = decisión gobernada/verificable/correlacionada | PASS | §7, §10 |
| 11 | El concedente no otorga lo que no posee | PASS | §7, inv 21 |
| 12 | Delegation explícita/verificable/limitada/correlacionada | PASS | §9 |
| 13 | Delegation nunca amplía | PASS | §9, inv 5 |
| 14 | Chain conserva origen/límites/restricciones/invalidaciones | PASS | §9 |
| 15 | Delegación circular/opaca/no trazable falla cerrado | PASS | §9, inv 6 |
| 16 | Subdelegación con permiso + dentro de profundidad/cantidad/presupuesto | PASS | §8, §9, inv 18/19 |
| 17 | Fan-out no multiplica cuota/coste/concurrencia/impacto | PASS | §8, §16, inv 19 |
| 18 | Subagent recibe mínimo | PASS | §9, §13, inv 7 |
| 19 | Contexto de subagente ensamblado por Core, no por el padre | PASS | §13, inv 22 |
| 20 | Inter-Agent Output definido y abarca todo el canal | PASS | §5 |
| 21 | Salida inter-agente = no confiable, conserva procedencia/taint | PASS | §5, §13, inv 16/17 |
| 22 | No convertible en instrucción/identidad/aprobación/policy/scope/Binding/Boundary/efecto | PASS | §13, inv 16 |
| 23 | Afirmaciones inter-agente exigen verificación independiente | PASS | §13 |
| 24 | El padre no presupone correcto el output del subagente | PASS | §13 |
| 25 | No auto-aprobación, ni directa ni indirecta | PASS | §7, §10, inv 20 |
| 26 | Aprobaciones limitadas por autoridad del aprobador y contexto | PASS | §7, §10 |
| 27 | No fraccionar entre subagentes/ramas/tiempo para evadir aprobación | **PARTIAL** | §10 |
| 28 | Cada paso/subefecto sigue RFC-0003/0005/0007 | PASS | §8, §9, §11, inv 9 |
| 29 | Workflow no Completed con Unknown/reconciliación | PASS | §11, inv 10 |
| 30 | Reanudación revalida estado vigente + atributos | PASS | §12, inv 12 |
| 31 | Cancelado/diferido no continúa por recuperar memoria | PASS | §12, §15 |
| 32 | Falta de progreso no crea éxito/fallo/cierre implícito | PASS | §15, inv 23 |
| 33 | Trabajo pendiente observable y gobernado sin perder evidencia | PASS | §15 |
| 34 | Terminación en cascada cooperativa, no reinterpreta efectos/Unknown | PASS | §15 |
| 35 | Aislamiento por org (incluye prompts/resultados) | PASS | §16, inv 13 |
| 36 | Evidencia reconstruye plan/cadena/autonomía/bindings/reservas/reconciliación | PASS | §17 |
| 37 | No elude Core ni crea autoridad alternativa | PASS | §14, §18, inv 14/15 |

**Resumen: 36 PASS · 1 PARTIAL · 0 FAIL.**

### Detalle del único PARTIAL

**27 — Fraccionamiento entre subagentes/ramas/tiempo.** §10 prohíbe "dividir artificialmente una acción para evitar una aprobación" y exige evaluar como composición "una secuencia de pasos que en conjunto suponga un efecto relevante". **Pero no extiende explícitamente la agregación a través de subagentes, ramas de workflow ni distribución temporal.** Vector real: un agente con presupuesto €10k y umbral de aprobación €5k/acción reparte la operación en 2 subagentes de €4k cada uno — cada acción evita el umbral aunque el total siga bajo el presupuesto agregado de §8. El tope de presupuesto (§8) limita el total, **no** la evasión del umbral de aprobación por troceo en el árbol de delegación o en el tiempo. La composición de §10 lee "una secuencia de pasos" (dentro de un plan/agente), no a través del árbol.

## 2. Correcciones concretas (priorizadas)

1. **(§10/§8) Extender la evaluación de composición/agregación a subagentes, ramas y tiempo:** un efecto troceado entre múltiples subagentes, ramas de workflow o ventanas temporales para quedar bajo un umbral de aprobación o límite debe agregarse y evaluarse como un único efecto compuesto. **BLOQUEANTE** (punto 27 — evasión de aprobación/límite por fan-out o troceo temporal).
2. **(§5/§8/§13 — integridad documental) Corregir artefactos de edición:** el literal `` `r`n`r`n `` en la definición de Inter-Agent Output (§5) y las frases pegadas a encabezados ("...condiciones aplicables.## 11", "...decisiones o efectos.## 14", "...impacto total permitido al... padre.Aumentar autonomía..."). Hay texto normativo fundido con títulos. **ALTO** (recomendado antes de Draft).
3. **(§13) La procedencia/taint del Inter-Agent Output la estampa Core, no el agente emisor** — coherente con el estampado por Core de RFC-0009; si no, un agente malicioso mislabel su propio taint. **ALTO.**
4. **(§15) Cota de timeout/escalado, no solo "observable" + "tratamiento gobernado":** dar un límite concreto al trabajo atascado en aprobación/reconciliación para que la liveness tenga cota, no solo observabilidad. **MEDIO-ALTO.**
5. **(§12/inv 12) Revalidación de reanudación explícitamente contra estado autoritativo vigente/fresco** (no snapshot/memoria), consistente con RFC-0007/0008. **MEDIO.**
6. **(§17/§15) Atar la evidencia de agente/workflow a la evidencia durable/tamper-evident de RFC-0007** para que la terminación en cascada/caída no pierda la cadena de reconciliación. **MEDIO.**
7. **(§9) Atenuación monótona explícita por salto de subdelegación** (cada salto estrecha, nunca igual o más amplio) y profundidad de cadena como tope duro. **MEDIO.**
8. **(§7) Las decisiones de alta autonomía y los boundaries permanentes trazan a un Human Principal responsable** (no solo Service Principal) para efectos de alto impacto/irreversibles. **MEDIO.**
9. **(§5 Supervisor/§14) Acotar la autoridad del Supervisor:** un Supervisor automatizado no puede aprobar efectos de los agentes que supervisa (refuerza la no-auto-aprobación por cadena controlada). **MEDIO.**
10. **(§16) Los topes de presupuesto/impacto agregado se aplican sobre todo el árbol de delegación en tiempo de evaluación** (no solo declarados), para que el fan-out no los exceda bajo concurrencia/carreras. **MEDIO.**
11. **(§13) "Verificación independiente" = re-ejecutar los gates de RFC-0003-0009 contra estado autoritativo,** no auto-atestación del agente receptor. **BAJO-MEDIO.**
12. **(§7/§10 — estilo) Consolidar los bloques duplicados:** las cláusulas de concesión de autonomía y no-auto-aprobación se repiten verbatim en §7 y §10; unificar o cross-referenciar para evitar drift. **BAJO.**

## 3. Cambios bloqueantes antes de establecer Draft

**Existe uno: la corrección 1** (extender la agregación de composición a subagentes, ramas y tiempo). Es un vector de evasión de aprobación real y propio de un sistema multiagente: sin él, los umbrales de aprobación se eluden troceando la acción en el árbol de delegación o en el tiempo. Es una adición acotada (una cláusula), pero cierra un exploit, no un detalle de estilo.

Las correcciones 2 y 3 son **fuertemente recomendadas** antes de Draft (integridad del documento y estampado de taint por Core), pero no son exploits por sí mismas. El resto (4-12) son endurecimientos para una v0.3.

## 4. Tres riesgos residuales inevitables

1. **Influencia / ingeniería social entre agentes.** Aun con clasificación no confiable y verificación independiente, un agente manipulado puede construir Inter-Agent Output que oriente a un peer hacia una acción **dentro de la autoridad legítima de ese peer**. Core frena el efecto no autorizado, no el autorizado-pero-inducido. Inherente a lo multiagente.
2. **Calidad de la concesión de autonomía.** El modelo impide la auto-elevación y topa la concesión a la autoridad del concedente, pero una autonomía amplia legítima reduce el human-in-the-loop; el riesgo se traslada a la calidad de la decisión de concesión y a los boundaries permanentes. Gobernanza, no mecanismo.
3. **Liveness y dependencias heredadas.** El fail-closed mantiene la seguridad, pero los agentes/reconciliaciones atascados acumulan estado durable pendiente de resolución humana; y las garantías de RFC-0010 descansan sobre los mecanismos aún por implementar de 0006/0007/0009 (binding infalsificable, confinamiento de credencial, estampado por Core).

## 5. Veredicto

```text
REQUIRES TARGETED CORRECTIONS
```

**Por qué no es `READY TO ESTABLISH RFC-0010 DRAFT`:** **36 PASS, 1 PARTIAL, 0 FAIL**, pero el PARTIAL (punto 27) es un **vector de evasión de aprobación real** y específico del dominio multiagente — trocear una acción entre subagentes/ramas/tiempo para quedar bajo umbral. Es una corrección dirigida (extender la agregación de composición al árbol de delegación y al tiempo), no rediseño, pero cierra un exploit y por eso es bloqueante antes de Draft.

**Por qué no es `NEEDS PARTIAL REDESIGN`:** la estructura es completa y excepcionalmente disciplinada; v0.2 resolvió el bloqueante de v0.1 (frontera de confianza inter-agente) de forma ejemplar y absorbió casi todas las correcciones. El documento está a **una cláusula** de READY.

**Lo que haría:** corrección 1 (y, idealmente, 2 y 3) antes de establecer el Draft. Con la corrección 1, RFC-0010 alcanza READY y cierra el modelo multiagente al nivel del resto de la pila.

---

### Nota de la serie

RFC-0010 v0.2 es la prueba de que **la capa de autonomía coordinada se sostiene sobre el núcleo de seguridad sin abrir autoridad nueva**, y de que el proceso de iteración funciona: el bloqueante central de v0.1 (confianza inter-agente) está cerrado con un concepto de primera clase (Inter-Agent Output) y siete invariantes nuevos. Lo que queda —agregación anti-troceo en el árbol, estampado de taint por Core, liveness acotada— son los **mismos patrones transversales** de toda la serie aplicados al dominio multiagente. Con la corrección 1, los diez RFCs forman una pila lógica completa y coherente, y el trabajo restante es **implementación** (los 2-3 mecanismos de núcleo) más cerrar los dos rezagados de diseño, RFC-0002 y RFC-0003.

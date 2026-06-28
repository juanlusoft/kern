---
title: Revisión de seguridad — RFC-0010 Agent, Workflow and Delegated Autonomy Model v0.1
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (multiagente empresarial, delegación de identidad, autorización distribuida, workflows, efectos, aprobaciones, control de autonomía)
fecha: 2026-06-28
documento_revisado: RFC-0010 — Agent, Workflow and Delegated Autonomy Model (v0.1)
veredicto: REQUIRES TARGETED CORRECTIONS
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.1 únicamente.

# Revisión de seguridad — RFC-0010 v0.1

Veredicto rápido: **muy sólido para un v0.1** — conceptos definidos en §5, delegación no amplificante (§9), autonomía que no se eleva por prompt/plan/memoria (§8), Workflow no completable con subefecto en Unknown (§11), terminación que no borra evidencia (§15). **31 PASS, 2 PARTIAL, 0 FAIL.** El hueco real, y propio de ESTE RFC, es el que el documento mismo deja en preguntas abiertas: **la frontera de confianza entre agentes** (output agente↔agente y subagente→padre) no está clasificada como contenido no confiable.

## Checklist

**1. Conceptos normativos definidos con precisión — `PASS`.** §5 define los 26 (Agent, Definition, Instance, Identity, Role, Workflow×3, Plan, Plan Step, Delegation, Chain, Delegated Authority, Autonomy Boundary, Autonomy Level, Human/Service Principal, Execution Sponsor, Supervisor, Subagent, Workflow Step, Approval Boundary, Escalation, Memory, State, Termination).
**2. Agent no confundido con humano/org/aprobación/permiso/Binding/autoridad autónoma — `PASS`.** §5 Agent + cierre §5 + inv 1.
**3. Workflow existente no conserva autoridad por existir/iniciar/contener pasos previos — `PASS`.** §5 cierre + §11.
**4. Plan/intención/memoria/recomendación ≠ autorización — `PASS`.** §8 + §5 Plan + inv 4.
**5. Cada Agent/Workflow Instance/Subagent en una sola org verificable — `PASS`.** §7 + inv 2.
**6. Toda ejecución conserva identidad ejecutora/delegada/principal responsable/sponsor/correlación — `PASS`.** §7 + inv 3.
**7. Agent Identity no hereda permisos humanos ni suplanta usuario — `PASS`.** §5 Agent Identity + §7.
**8. Agent no elige arbitrariamente org/identidad/rol/supervisor/sponsor — `PASS`.** §7.
**9. Autonomy Boundary limita capacidades/datos/clasificación/destinos/efectos/volumen/coste/duración/frecuencia/aprobaciones/subdelegación/reanudación — `PARTIAL`.** §8 enumera casi todo (incl. reanudación y "capacidad de crear subagents"), pero **"subdelegación" no figura como dimensión del Autonomy Boundary** ni en §5 ni en §8; se gobierna aparte en §9. Para completitud, la subdelegación (permiso + profundidad) debe ser dimensión explícita del Boundary.
**10. Cambio de plan/prompt/memoria/instrucción no eleva autonomía — `PASS`.** §8 + §5 Autonomy Level.
**11. Toda Delegation explícita/verificable/limitada/correlacionada — `PASS`.** §9.
**12. Delegation nunca amplía org/identidad/scopes/finalidad/clasificación/restricciones/destinos/límites/autonomía/capacidades/aprobaciones/autoridad de efecto — `PASS`.** §9 + inv 5.
**13. Delegation Chain conserva origen/delegados/límites heredados/restricciones compuestas/correlación/invalidaciones — `PASS`.** §9.
**14. Delegación circular/opaca/no trazable falla cerrado — `PASS`.** §9 + inv 6 ("circular, opaca ni no trazable").
**15. Subagent recibe contexto/alcance/autonomía mínimos — `PASS`.** §9 + §13 + inv 7.
**16. Subdelegación exige permiso explícito y no sobrevive a invalidaciones materiales — `PASS`.** §9.
**17. Cada efecto de Subagent usa controles de RFC-0003/0005/0007 — `PASS`.** §9.
**18. Agent no aprueba sus propios efectos ni reutiliza aprobación fuera de alcance/payload/contexto/correlación/vigencia — `PASS`.** §10 (aprobación ligada a acción/alcance/payload/contexto/momento) + inv 8 (no auto-aprobación). *Nit: la no-auto-aprobación solo está en inv 8, no en el cuerpo §10.*
**19. Agent no divide artificialmente una acción para evitar aprobación — `PASS`.** §10 ("debe evaluarse como composición").
**20. Pasos individuales y efectos compuestos se evalúan por RFC-0003/0005/0007 — `PASS`.** §10 + §11 + §8 + inv 9.
**21. Workflow no Completed con subefecto en Unknown Outcome/reconciliación pendiente — `PASS`.** §11 + inv 10. (Alineado con RFC-0008 v0.2.)
**22. State/Memory/planes/durable no confundidos con autoridad ni contexto vigente — `PASS`.** §12 ("la memoria no es autoridad ni prueba suficiente de contexto vigente") + inv 4.
**23. Reanudación revalida identidad/org/delegación/policy/autonomía/conocimiento/restricciones/contexto — `PASS`.** §12 + inv 12. *Nit: no exige "estado autoritativo fresco" explícito; lo hereda de RFC-0008.*
**24. Cancelado/diferido/terminado no continúa por recuperar memoria — `PASS`.** §12 + §15.
**25. Conocimiento a agentes/subagentes sigue RFC-0009, sin autoridad adicional — `PASS`.** §13.
**26. Datos recuperados/instrucciones/memoria/mensajes de usuario/resultados de herramientas/contenido no confiable permanecen distinguibles — `PARTIAL`.** §13 lista esas categorías, **pero NO incluye el output de un agente a otro ni el resultado de un subagente a su padre como categoría distinguible y no confiable.** En un sistema multiagente, un agente manipulado puede emitir un "plan" o "resultado" que el padre/peer trate como contexto o instrucción legítima → propagación de prompt injection entre agentes. Hay que clasificar explícitamente el output inter-agente/subagente como contenido no confiable bajo RFC-0009 (procedencia/taint), nunca instrucción de sistema ni autoridad. (El RFC mismo deja "coordinación entre múltiples agentes" en §21 preguntas abiertas.)
**27. Agent/Workflow/Extension no elude Core ni se hace Supervisor con autoridad ampliada — `PASS`.** §14 + §7.
**28. Cancelación/timeout/terminación/caída no convierten Unknown Outcome en éxito/fallo/expiración implícitos — `PASS`.** §15 + inv 11.
**29. Terminar un Agent no elimina evidencia/obligaciones/reconciliación/trazabilidad — `PASS`.** §5 Termination + §15 + inv 11.
**30. Agentes/workflows/planes/memoria/prompts/trazas/artefactos no se comparten entre orgs — `PASS`.** §16 (incluye prompts, a diferencia de RFC-0009 §14) + inv 13.
**31. Límites de recursos/profundidad/coste/concurrencia/duración no se amplían por auto-delegación — `PASS`.** §16 ("no puede... ampliar su propia cuota mediante delegación").
**32. La evidencia reconstruye definición/instancia/plan/cadena/autonomía/aprobaciones/conocimiento material/bindings/resultados/subefectos — `PASS`.** §17 (lista completa).
**33. No crea ruta alternativa de autoridad frente a RFC-0002-0009 — `PASS`.** §18 + inv 15.

**34. Tres riesgos residuales inevitables aun con implementación correcta:**
1. **Propagación de influencia entre agentes.** Aun con Core gobernando los efectos, un agente manipulado puede emitir planes/instrucciones plausibles que orienten a un peer o a su padre hacia una acción **dentro de la autoridad legítima de ese agente**. Core frena el efecto no autorizado, no el efecto autorizado-pero-no-pretendido inducido por ingeniería social entre agentes. Inherente a lo multiagente.
2. **Deriva de autonomía por decisión gobernada.** El modelo impide la auto-elevación, pero una decisión humana/gobernada puede conceder autonomía amplia, y un agente de alta autonomía opera con menos human-in-the-loop. El riesgo se traslada a la **calidad de la decisión de concesión** y a los boundaries de alta autonomía permanentes — residuo de gobernanza, no de mecanismo.
3. **Liveness / agentes y reconciliaciones atascados.** Agentes/workflows en pending-approval/reconciliación/Unknown se acumulan reteniendo estado durable; el fail-closed es seguro pero las operaciones se quedan paradas esperando resolución humana (heredado de RFC-0007/0008). Más las dependencias heredadas de confinamiento de credencial y estampado por Core de los RFCs inferiores.

## Correcciones concretas (priorizadas)

1. **(§13/§5/§19) Clasificar explícitamente el output inter-agente y de subagente→padre como contenido no confiable bajo RFC-0009** (procedencia/taint), nunca instrucción de sistema, contexto confiable ni autoridad; añadirlo como invariante. **BLOQUEANTE** (punto 26 — es la frontera de confianza central de un modelo multiagente y hoy está solo implícita / en preguntas abiertas).
2. **(§5/§8) Añadir "subdelegación (permiso + profundidad)" como dimensión explícita del Autonomy Boundary,** reconciliando §8 con la gobernanza de §9. **ALTO** (punto 9).
3. **(§10) Enunciar en el cuerpo (no solo inv 8) que un Agent no aprueba sus propios efectos, y que una aprobación nunca excede la autoridad del aprobador** (regla de RFC-0004). **ALTO.**
4. **(§7/§8) Tope a la concesión de autonomía:** un aumento gobernado de autonomía no puede exceder la autoridad/autonomía del principal que la concede; un supervisor/sponsor no concede autonomía que él mismo no posee. **ALTO.**
5. **(§16/§15) Liveness/escalado acotado para agentes/workflows atascados** en pending-approval/reconciliación/Unknown: espera máxima → escalado gobernado. **ALTO.**
6. **(§13) El contexto reducido de un subagente lo establece Core/Context Assembly (RFC-0009), no el agente padre eligiendo por sí mismo el subconjunto;** el padre no es la autoridad que decide qué ve el subagente. **MEDIO-ALTO.**
7. **(§16) Anti-amplificación por fan-out:** un agente que crea N subagentes no multiplica su blast-radius/cuota efectiva (suma de presupuestos de subagentes ≤ presupuesto del padre). **MEDIO-ALTO.**
8. **(§8/§10) Detección de fraccionamiento que abarque subagentes y pasos async/temporales,** no solo dentro de un mismo plan (la evaluación de composición debe cruzar subagentes y tiempo). **MEDIO.**
9. **(§7/§5) Las decisiones de alta autonomía y los boundaries permanentes trazan a un Human Principal responsable** (no solo Service Principal) para clases de efecto de alto impacto/irreversibles. **MEDIO.**
10. **(§12/§23) Exigir estado autoritativo fresco (no snapshot) en la revalidación de reanudación,** consistente con RFC-0007/0008. **MEDIO.**
11. **(§9) Atenuación monótona por salto de subdelegación y profundidad máxima de cadena como límite duro,** no solo "gobernado". **MEDIO.**
12. **(§17/§15) Atar la evidencia del agente a la evidencia durable/tamper-evident de RFC-0007 (Core-produced)** para que terminación/caída no pierdan la cadena. **MEDIO.**
13. **(§5 Supervisor/§7) Definir los límites de autoridad del Supervisor:** observa/escala dentro de límites explícitos y no amplía autonomía ni acceso del agente. **BAJO-MEDIO.**
14. **(§15) Cross-referenciar el estado `Waiting for Reconciliation` de RFC-0008** para los workflows, de modo que el gating de `Completed` mapee a un estado concreto. **BAJO-MEDIO.**
15. **(§5/§8) Aclarar que "decisión gobernada" para subir autonomía es una decisión de policy/principal con evidencia, no un rol auto-asignado.** **BAJO.**

## Cambios bloqueantes antes de establecer RFC-0010 como Draft

- **Corrección 1** — clasificar el output inter-agente/subagente como contenido no confiable. Es el único hueco de **seguridad central** del documento: sin él, la coordinación multiagente (la razón de ser de este RFC) deja una vía de propagación de injection/instrucción entre agentes, y el propio RFC la tiene en "preguntas abiertas".

Recomendadas fuertes (no estrictamente bloqueantes): **2** (subdelegación en el Boundary), **3** (auto-aprobación y tope de aprobador), **4** (tope de concesión de autonomía) y **5** (liveness).

## Veredicto

## `REQUIRES TARGETED CORRECTIONS`

**Por qué no es `READY TO ESTABLISH DRAFT`:** **31 PASS, 2 PARTIAL, 0 FAIL**, pero uno de los PARTIAL (punto 26) es **la frontera de confianza propia de este RFC** — la comunicación agente↔agente y subagente→padre no está clasificada como contenido no confiable, y el documento mismo deja "coordinación entre múltiples agentes" como pregunta abierta. Para un *modelo de agentes y workflows*, dejar implícita la frontera de confianza multiagente es justo lo que hay que cerrar antes de establecer el Draft. Es **una corrección dirigida** (un enunciado + invariante), no rediseño.

**Por qué no es `NEEDS PARTIAL REDESIGN`:** la estructura es correcta, completa y excepcionalmente disciplinada — delegación no amplificante, autonomía no auto-elevable, no-self-approval, no-fraccionamiento, Workflow no completable con Unknown, terminación que conserva evidencia, aislamiento por org (incluidos prompts), y no introduce autoridad nueva (§18). Solo necesita **explicitar la frontera de confianza entre agentes** y un puñado de endurecimientos.

**Lo que haría:** corrección 1 antes de establecer el Draft; con ella, RFC-0010 cierra el modelo multiagente al mismo nivel que el resto de la pila.

---

### Nota de la serie

RFC-0010 corona la pila: es la capa de **autonomía coordinada** sobre el núcleo de seguridad (0003-0009), y demuestra que ese núcleo soporta agentes y workflows sin abrir autoridad nueva. El único riesgo *nuevo* que introduce es el **multiagente**: la propagación de influencia entre agentes (residual 1) y la frontera de confianza agente↔agente (corrección 1). Todo lo demás es herencia disciplinada de los nueve RFCs previos.

Con esto, los diez RFCs forman una pila lógica completa. La deuda de fondo sigue siendo **de implementación, no de diseño**, y se concentra en los mismos 2-3 mecanismos transversales (binding infalsificable, confinamiento de credencial/efecto, estampado de atributos por Core) más, ahora, **la clasificación no confiable del canal inter-agente**. Los frentes de diseño abiertos siguen siendo RFC-0002 y RFC-0003 (rediseño parcial) y los `targeted corrections` de 0009 y 0010.

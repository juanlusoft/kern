---
title: Revisión de seguridad — RFC-0009 Governed Knowledge Access, Retrieval and Context Provenance v0.2
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (agentes empresariales, control de acceso a datos, aislamiento multi-tenant, RAG, provenance, prompt injection, exfiltración, autorización distribuida)
fecha: 2026-06-28
documento_revisado: RFC-0009 — Governed Knowledge Access, Retrieval and Context Provenance (v0.2)
veredicto: REQUIRES TARGETED CORRECTIONS
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.2 únicamente.

# Revisión de seguridad — RFC-0009 v0.2

Veredicto rápido: gran salto desde v0.1 — **§5 define ya los 16 conceptos**, se añade la cláusula anti-mosaico (§10), la propagación de invalidación a derivados y contexto async retenido (§11), el cierre del derecho al olvido durante la latencia de invalidación (§11), el "must-link" forense (§13) y el cierre de la vía de desclasificación (§9). **27 PASS, 3 PARTIAL, 0 FAIL.** Pero **el changelog reclama un confinamiento de credenciales amplias que el cuerpo no entrega**, y falta el invariante explícito de estampado por Core.

## Checklist

**1. Knowledge Source agnóstico de proveedor — `PASS`.** §5 (def completa, "cualquier otra fuente conectada") + §2.
**2. Todos los conceptos normativos definidos de forma suficiente, coherente y no tecnológica — `PASS`.** §5 define los 16 (Resource, Access Request, Result, Context, Context Assembly, Provenance, Classification, Taint, Restriction, Derived Knowledge, Freshness, Snapshot, Retrieval Scope, Source Authority, Context Consumer, Invalidation). *Resuelve el bloqueante 1 de v0.1.*
**3. Knowledge Access Request ligado a org/identidad/finalidad gobernada/Turn/alcance/restricciones/correlación — `PASS`.** §5 ("la finalidad declarada debe corresponder a una finalidad gobernada y evaluable por policy. No puede ser texto libre autoafirmado") + §6. *Tomó mi corrección de purpose-limitation.*
**4. Lectura no asume tenant/identidad/scopes/finalidad/clasificación/destino — `PASS`.** §6 (bloque).
**5. Ausente/ambiguo/conflicto/inconsistencia/no verificable falla cerrado — `PASS`.** §6 + inv 7.
**6. Turn existente no concede lectura automática — `PASS`.** §7.
**7. Canal/agente/workflow/modelo/Tool/Integration/Extension no son autoridad final de lectura — `PASS`.** §7 + §5 Context Consumer ("nunca autoridad final") + inv 4.
**8. La amplitud de una credencial externa no amplía el Retrieval Scope — `PASS`** (por composición). §5 Retrieval Scope (límite verificable de Kern) + §5 Source Authority ("no sustituye la autorización de Kern") + §7. *Nit: §7 mantiene "cuando corresponda"; conviene un enunciado explícito "la amplitud de credencial nunca amplía el Retrieval Scope".*
**9. El over-fetch se excluye antes de Context Assembly y no se conserva/reutiliza/indexa/cachea/telemetriza/usa como memoria o evidencia — `PARTIAL`.** **El changelog reclama "confinamiento estricto de resultados recuperados mediante credenciales amplias", pero el cuerpo no escribe el ciclo de vida del over-fetch.** §8 solo dice que Context Assembly "**puede** excluir resultados que no puedan atribuirse, clasificarse o verificarse" — eso cubre lo *no verificable*, no el dato **dentro de la org, clasificable y verificable, pero fuera del Retrieval Scope autorizado** (over-scope). Falta el enunciado normativo: "todo resultado fuera del Retrieval Scope autorizado se excluye antes de Context Assembly y no se retiene, indexa, cachea, telemetriza ni usa como memoria o evidencia". Es el mecanismo real de prevención de exfiltración y sigue ausente.
**10. Autorización/disponibilidad de fuente externa no sustituye ni amplía controles de Kern — `PASS`.** §5 Source Authority + §7.
**11. Context Assembly no crea autoridad ni permiso de divulgación — `PASS`.** §8 + bloque ("recuperación no equivale a permiso de divulgación") + inv 15.
**12. Recuperación ≠ permiso de mostrar/resumir/exportar/enviar externo/telemetría/usar en capacidad — `PASS`.** §8 (bloque).
**13. Cada resultado conserva org/procedencia/clasificación/taint/restricciones/correlación — `PASS`.** §9 (lista completa).
**14. Fuente/Tool/Integration/Extension aporta metadatos pero no es autoridad final para reducir/borrar/reinterpretar atributos — `PASS`.** §5 Knowledge Source ("aporta metadatos, pero no decide por sí sola el tratamiento final de seguridad") + §9 ("ninguna transformación... puede rebajar") + §5 Context Consumer.
**15. Core o componente controlado por Core establece, verifica, compone y preserva los atributos de seguridad — `PARTIAL`.** **"Compone" (§10 "Core debe aplicar restricción más estricta") y Context Assembly Core-controlled (§8) están; "establece y verifica" no es invariante explícito.** §5 Knowledge Source implica que la fuente no decide, pero **no hay un enunciado de que Core *establece y verifica* la clasificación/taint** (¿quién fija la clasificación cuando la fuente no la aporta? ¿Core verifica los metadatos de un conector no confiable antes de confiar en ellos?). El changelog lo reclama ("establecidos... por una frontera controlada por Core") pero §17 no incluye ese invariante. Raíz de integridad de todo el modelo.
**16. Procedencia/clasificación/taint/restricciones/obligaciones no se reducen por chunking/extracción/normalización/resumen/indexación/OCR/embedding/combinación/transformación — `PASS`.** §9 (bloque + nuevo "ninguna transformación... puede rebajar... u obligaciones") + §10. Ahora incluye obligaciones.
**17. No hay vía general de desclasificación/rebaja de taint/anonimización/excepción automática por transformación — `PASS`.** §9 NUEVO ("Este RFC no define una vía general de desclasificación, anonimización o rebaja de taint. Cualquier mecanismo futuro... requerirá un contrato específico, verificable y gobernado"). Excelente.
**18. Derivados/inferencias/texto de modelo distinguidos de hechos de fuente — `PASS`.** §8 + §10.
**19. Instrucciones en documentos/correos/webs/adjuntos = no confiables, no alteran identidad/policy/scopes/bindings/Core — `PASS`.** §12 + inv 9.
**20. La inclusión en Context Assembly exige validación vigente de autorización/finalidad/policy/clasificación/taint/restricciones/destino — `PASS`** (por composición). §6 (fail-closed) + §8 (preserva, aplica límites) + §9 (no apto si no verificable) + §11 (revalidar antes de uso). *Nit: §8 dice "**puede** excluir" lo no verificable; debería ser "debe excluir" (fail-closed en el ensamblado).*
**21. Existir en caché/índice/embedding/resumen/ranking/derivado ≠ sigue autorizado — `PASS`.** §11 + inv 11.
**22. Proveedor externo/modelo remoto/inferencia/telemetría/consumidor fuera del límite = destino gobernado — `PASS`.** §12 + §15 + §8.
**23. Core bloquea el envío externo cuando las restricciones no lo permiten o no puede verificar cumplimiento — `PASS`** (por composición). §12 ("exige controles y autorización aplicables") + §11 ("no puede reutilizarse para... destino externo" hasta revalidar) + §6 fail-closed. *Nit: convendría el explícito "Core debe denegar el envío...".*
**24. Memoria/prompts/payloads de contexto ensamblado/representaciones derivadas con aislamiento estricto por org — `PARTIAL`.** §14 enumera "recursos, resultados, índices, embeddings, cachés, resúmenes, artefactos y trazas" org-scoped (derivados ✓), y §12 cubre memoria-retención. **Pero "prompts" y "payloads de contexto ensamblado" no están en la enumeración de aislamiento de §14** (mi observación de v0.1 no se incorporó). El payload de contexto ensamblado es justo lo que se envía al modelo: debe estar explícitamente org-scoped.
**25. La combinación no puede eludir restricciones por agregación/mosaico — `PASS`.** §10 NUEVO ("La composición no puede usarse para eludir restricciones mediante agregación... Core debe aplicar una restricción más estricta, requerir reevaluación o excluir"). *Tomó mi corrección.*
**26. Borrado/revocación/reclasificación/cambio material invalida resultados/cachés/índices/embeddings/resúmenes/derivados/contexto async retenido — `PASS`.** §11 NUEVO ("debe alcanzar... Knowledge Context aún retenido para Turns diferidos o asíncronos"). *Tomó mi corrección.*
**27. La demora técnica de invalidación no autoriza reutilización/divulgación/reanudación/entrega a Context Consumer — `PASS`.** §11 NUEVO ("Mientras no se pueda demostrar que la reevaluación... se ha completado, ese conocimiento no puede reutilizarse para divulgación, destino externo, reanudación o efecto relevante"). Cierra la carrera de invalidación. Excelente.
**28. Efecto relevante/irreversible/alto impacto puede vincularse obligatoriamente a conocimiento material/Turn/decisión/Binding/evidencia — `PASS`.** §13 NUEVO ("Kern **debe** poder vincular..."). *Tomó mi corrección. Nit: inv 12 sigue diciendo "puede... cuando corresponda" — reconciliar con el "debe" de §13.*
**29. Telemetría/logs/prompts/trazas/diagnósticos = destinos gobernados, sin canal de exfiltración — `PASS`** (con dependencia). §15 + inv 13. *La prevención efectiva de exfiltración hereda la mediación de telemetría de RFC-0006, que sigue siendo un ítem abierto allí; conviene cross-referenciarlo.*
**30. No crea ruta de lectura alternativa frente a RFC-0003-0008 — `PASS`.** §16 + inv 15.

**31. Tres riesgos residuales inevitables aun con implementación correcta:**
1. **Salida de modelo no confiable.** Etiquetar procedencia y exigir "distinguir inferencia de hecho" no impide que el modelo parafrasee contenido restringido perdiendo la etiqueta o afirme una inferencia como hecho citado. Inherente al usar un LLM sobre contexto sensible.
2. **Inferencia por agregación más allá de lo detectable.** §10 mitiga exigiendo composición más estricta, pero Kern no puede detectar todas las inferencias emergentes que un modelo extrae de datos individualmente permitidos. La inferencia semántica es ilimitada.
3. **Latencia de propagación a fronteras externas.** Una vez entregado conocimiento a un modelo/proveedor externo (destino gobernado que ya lo recibió), el borrado/reclasificación no lo puede recuperar; y el over-fetch que transitó Kern antes de excluirse ya cruzó la frontera. §11 protege la reutilización interna, no lo ya egresado.

## Correcciones concretas (priorizadas)

1. **(§7/§8/§5 Retrieval Scope) Escribir en el cuerpo el ciclo de vida del over-fetch:** todo resultado fuera del Retrieval Scope autorizado —aunque sea de la misma org, clasificable y verificable— se excluye **antes** de Context Assembly y **nunca** se retiene, reutiliza, indexa, cachea, telemetriza ni usa como memoria o evidencia; quitar el "cuando corresponda" de §7. **BLOQUEANTE** (punto 9 — el changelog lo reclama pero el cuerpo no lo entrega).
2. **(§17/§9) Añadir invariante explícito de estampado por Core:** Core o un componente controlado por Core establece, verifica, compone y preserva procedencia/clasificación/taint/restricciones; los metadatos de fuente/conector/Tool/Integration/Extension son entrada sujeta a verificación de Core, nunca autoridad para fijarlos ni reducirlos. **BLOQUEANTE** (punto 15 — raíz de integridad).
3. **(§14) Añadir "prompts, payloads de contexto ensamblado y memoria" a la enumeración de aislamiento estricto por organización.** **ALTO** (punto 24).
4. **(archivo) Corregir la corrupción de codificación UTF-8 (mojibake "ó", "é"...) en §1-4, 6-8, 12, 14-16, 18-19.** Un documento normativo con texto corrupto arriesga ambigüedad. **ALTO** (higiene documental antes de establecer).
5. **(§8) Cambiar "puede excluir resultados que no puedan atribuirse/clasificarse/verificarse" por "debe excluir"** (fail-closed en el ensamblado), alineando con §6/§9. **MEDIO.**
6. **(inv 12 vs §13) Reconciliar:** inv 12 dice "puede... cuando corresponda"; §13 ya dice "debe" para efectos relevantes/irreversibles/alto impacto. Actualizar inv 12 a "debe" para esas clases. **MEDIO.**
7. **(§17) Reflejar en los invariantes las cláusulas reforzadas del cuerpo:** anti-mosaico (§10), invalidación que alcanza derivados + contexto async y que la demora no autoriza reutilización (§11), y no-vía-de-desclasificación (§9). Hoy §17 va por detrás del cuerpo. **MEDIO.**
8. **(§23/§12) Enunciar explícito "Core debe denegar el envío a un destino externo cuando las restricciones no lo permitan o no pueda verificar su cumplimiento".** **MEDIO.**
9. **(§15/§29) Cross-referenciar que la no-exfiltración por telemetría hereda la mediación de RFC-0006** (ítem abierto allí), para que la dependencia quede trazada. **BAJO-MEDIO.**
10. **(§9) Marcar qué atributos por elemento son obligatorios vs "cuando aplique"** — obligatorios al menos org, fuente, clasificación, procedencia, taint, restricciones. **BAJO-MEDIO.**
11. **(§5 Knowledge Snapshot/§13) Atar el Knowledge Snapshot usado para justificar un efecto a la durabilidad de evidencia de RFC-0007** (Core-produced, tamper-evident). **BAJO.**
12. **(estilo) Normalizar la prosa meta-descriptiva ("Define que:", "Exige que:") en enunciados normativos directos.** **BAJO.**

## Cambios bloqueantes antes de establecer RFC-0009 como Draft

- **Corrección 1** — ciclo de vida del over-fetch en el cuerpo (cierra el `PARTIAL` del punto 9; es el mecanismo real de exfiltración y el changelog lo reclama sin entregarlo).
- **Corrección 2** — invariante explícito de estampado/verificación por Core (cierra el `PARTIAL` del punto 15; raíz de integridad de la procedencia).

Recomendadas fuertemente (no estrictamente bloqueantes): **3** (prompts/payloads en el aislamiento) y **4** (corregir el mojibake). El resto, para v0.3.

## Veredicto

## `REQUIRES TARGETED CORRECTIONS`

**Por qué no es `READY TO ESTABLISH DRAFT`:** **27 PASS, 3 PARTIAL, 0 FAIL**, pero dos PARTIAL son sustantivos y uno revela una **discrepancia entre changelog y cuerpo**: el v0.2 dice haber añadido "confinamiento estricto de credenciales amplias" y "atributos establecidos por Core", pero el cuerpo **no escribe el ciclo de exclusión del over-fetch** (punto 9 — el vector de exfiltración que este RFC existe para cerrar) ni un **invariante explícito de estampado por Core** (punto 15 — la raíz de integridad de toda la procedencia). El tercero (prompts/payloads fuera del aislamiento de §14) y la corrupción de codificación completan las correcciones. Todo es **dirigido y rápido**, no rediseño.

**Por qué no es `NEEDS PARTIAL REDESIGN`:** la estructura es correcta, completa y notablemente reforzada — conceptos definidos, anti-mosaico, propagación de invalidación a derivados y async, cierre de la carrera de invalidación, must-link forense, no-vía-de-desclasificación, read≠use, prompt injection indirecto. No introduce autoridad nueva (§16). Solo necesita **entregar en el cuerpo lo que el changelog ya promete** y un invariante.

**Lo que haría:** correcciones 1-2 (entregar el confinamiento del over-fetch y el invariante de estampado por Core) antes de establecer el Draft; con ellas, RFC-0009 alcanza el nivel del resto de la pila y cierra definitivamente el read-path.

---

### Nota de la serie

RFC-0009 v0.2 está a **dos enunciados** de cerrar el último gran frente de seguridad de datos. Y esos dos enunciados son, otra vez, **los dos mecanismos transversales de toda la serie**: **confinamiento de credencial amplia** (aquí, sobre la lectura/over-fetch) y **estampado de atributos por Core** (aquí, procedencia/taint). Son los mismos que vengo marcando en 0005, 0006 y 0007. Mecanizarlos una sola vez, a nivel de plataforma, los resuelve para los cinco RFCs a la vez — ese es el verdadero camino crítico, no más iteraciones documento a documento.

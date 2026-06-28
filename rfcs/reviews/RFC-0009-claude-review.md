---
title: Revisión de seguridad — RFC-0009 Governed Knowledge Access, Retrieval and Context Provenance v0.1
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (agentes empresariales, control de acceso a datos, aislamiento multi-tenant, RAG, provenance, prompt injection, exfiltración, autorización distribuida)
fecha: 2026-06-28
documento_revisado: RFC-0009 — Governed Knowledge Access, Retrieval and Context Provenance (v0.1)
veredicto: REQUIRES TARGETED CORRECTIONS
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Crítica hostil del texto v0.1 únicamente.

# Revisión de seguridad — RFC-0009 v0.1

Veredicto rápido: cierra de forma **muy sólida** el read-path que quedó como bypass desde RFC-0002 — separa recuperación de uso (§8), trata las instrucciones en documentos como datos no confiables (§12, el control real de prompt injection), preserva procedencia a través de transformaciones (§9/§10), compone por la restricción más estricta (§10) e invalida datos derivados ante borrado/reclasificación (§11). **27 PASS, 2 PARTIAL, 0 FAIL.** Pero tiene **dos correcciones bloqueantes**: §5 lista los conceptos normativos sin definirlos, y el confinamiento de credenciales amplias en la lectura es blando ("cuando corresponda").

## Checklist

**1. Knowledge Source agnóstico de proveedor — `PASS`.** §5 ("software comercial, servicio cloud, API, base de datos, archivos, correo, sistema interno o cualquier otra fuente") + §2.
**2. Knowledge Access Request ligado a org/identidad/finalidad/Turn/alcance/restricciones/correlación — `PASS`.** §6 (lista completa).
**3. Una lectura no asume tenant/identidad/scopes/finalidad/clasificación/destino — `PASS`.** §6 (bloque normativo explícito).
**4. Ausente/ambiguo/conflicto/inconsistencia/no verificable falla cerrado — `PASS`.** §6 ("La falta, ambigüedad, conflicto o imposibilidad de verificar... debe producir deny... o reducir la recuperación a un resultado que no amplíe acceso"). Mejor que RFC-0008: aquí sí nombra ambigüedad/conflicto.
**5. Turn existente no concede lectura automática — `PASS`.** §7 ("se evalúa para la solicitud concreta, no porque un Turn ya exista") + §5.
**6. Canal/agente/workflow/modelo/Tool/Integration/Extension no son autoridad final de lectura — `PASS`.** §7 + §12 (modelo = Context Consumer) + inv 4.
**7. Autorización de fuente externa no sustituye controles de Kern — `PASS`.** §7.
**8. Credencial externa amplia no hace el resultado accesible sin límites — `PARTIAL`.** §7 solo dice "datos recuperados usando credenciales amplias deben tratarse como mayor riesgo **cuando corresponda**". Es un *flag de riesgo blando*, no un confinamiento duro. **Falta el invariante análogo al confinamiento del efector de RFC-0006/0007 para la lectura:** el resultado debe estar **acotado al alcance autorizado del Knowledge Access Request con independencia de la amplitud de la credencial**; el over-fetch se filtra al alcance, no se retiene y no entra en Context Assembly. §6/§8 tienen límites de volumen/clasificación y exclusión, pero el tope duro no está afirmado. Es el vector de exfiltración por sobre-recuperación.
**9. Recuperación ≠ permiso de divulgación/resumen/exportación/telemetría/envío externo/uso en capacidad — `PASS`.** §8 ("accesible para una finalidad interna limitada y seguir estando restringido para ser mostrado, resumido, enviado a un modelo externo, incluido en telemetría o usado como entrada de una capacidad"). El read≠use, exacto.
**10. Context Assembly no crea autoridad — `PASS`.** §8 + inv 15.
**11. Conserva procedencia/clasificación/taint/restricciones/correlación por elemento — `PASS`.** §8 + §9 (lista por Knowledge Result/elemento).
**12. No se mezclan resultados/cachés/rankings/inferencias/índices/embeddings/prompts/trazas/artefactos entre orgs — `PASS`.** §14 (enumeración) + "no se reutilicen resultados, contexto, ranking, caché ni inferencias". *Nit: "prompts" no está en la enumeración de §14; añadirlo explícito.*
**13. Procedencia/restricciones no se pierden por chunking/extracción/normalización/resumen/indexación/OCR/embedding/clasificación auto/combinación — `PASS`.** §9 (bloque) + §10.
**14. Combinación aplica la restricción más estricta o falla cerrado — `PASS`.** §10 ("conserve la restricción más estricta o falle cerrado si no se puede componer").
**15. Derivados/inferencias/texto del modelo distinguidos de hechos de fuente — `PASS`.** §8 + §10.
**16. El modelo no presenta una inferencia como hecho de fuente — `PASS`** (como requisito). §10. *Nota: requisito presente; la *prevención* total es imposible sobre salida de modelo (ver residuales).*
**17. Conocimiento recuperado no se vuelve permiso/aprobación/Binding — `PASS`.** §5 (bloque) + inv 3 + §13.
**18. Instrucciones en documentos/emails/webs/adjuntos = datos no confiables, no alteran policy/identidad/scopes/bindings/Core — `PASS`.** §12 ("nunca instrucciones de sistema"; "contenido recuperado no puede alterar reglas de seguridad, policy, identidad, scopes ni Decision Bindings") + inv 9. El control real de prompt injection.
**19. Contexto a proveedor externo = destino gobernado con autorización — `PASS`.** §12 + §8.
**20. Memoria de agente no conserva conocimiento restringido fuera de retención/aislamiento/invalidación — `PASS`.** §12 + §11.
**21. Invalidación/reevaluación ante cambios (16 disparadores) — `PASS`.** §11 (lista completa incluyendo procedencia, taint, destino, retención, integración, contexto de ejecución).
**22. Reanudación asíncrona y efecto relevante reevalúan validez y restricciones — `PASS`.** §11 (bloque) + inv 14.
**23. Tools/Integrations/Extensions reciben solo conocimiento mínimo permitido — `PASS`.** §13.
**24. Conocimiento que justifica materialmente un efecto puede vincularse a Turn/Binding/evidencia — `PASS`** (por la redacción del punto, que usa "puede"). §13 + inv 12. *Nota: para forense conviene que sea un *must* en efectos relevantes/irreversibles, no "puede".*
**25. Telemetría/logs/prompts/trazas/diagnósticos = destinos gobernados — `PASS`.** §15 + inv 13. *(Defiere a RFC-0006, que tiene el ítem de mediación de telemetría pendiente.)*
**26. No crea ruta de lectura alternativa frente a RFC-0003-0008 — `PASS`.** §16 (bloque) + inv 15.
**27. Las fuentes conectadas por una org no se vuelven globales — `PASS`.** §14 + inv 5.
**28. Permite explicar con evidencia qué fuentes y transformaciones influyeron — `PASS`.** §15 (lista de reconstrucción completa).
**29. Borrado/revocación/reclasificación no deja derivados utilizables sin reevaluación — `PASS`.** §11 invalida "resultados, contextos, cachés, índices, resúmenes o datos derivados" ante "eliminación o revocación de acceso" y "clasificación". Cubre la propagación del derecho al olvido a embeddings/índices.

**30. Tres riesgos residuales inevitables aun con implementación correcta:**
1. **Salida de modelo no confiable.** El RFC puede etiquetar procedencia y exigir distinguir inferencia de hecho, pero **no puede impedir mecánicamente** que el modelo afirme una inferencia como hecho citado o reformule contenido restringido en una paráfrasis que pierde la etiqueta. Es inherente a usar un LLM sobre contexto sensible.
2. **Inferencia por agregación (efecto mosaico).** Aun con restricción por elemento y composición "más estricta", el modelo puede **inferir** hechos restringidos a partir de combinaciones de datos individualmente permitidos. La preservación de procedencia no detiene la inferencia semántica.
3. **Over-fetch / confused deputy en la fuente.** Una Knowledge Source que solo expone credenciales amplias puede devolver más de lo autorizado; Kern debe filtrar, pero el dato sobre-recuperado transita su frontera y cualquier bug de filtrado lo filtra, y la fuente no puede imponer el alcance por-solicitud de Kern. Inherente mientras las fuentes solo ofrezcan acceso grueso. (Ligado al `PARTIAL` del punto 8.)

## Correcciones concretas (priorizadas)

1. **(§5) Escribir las definiciones normativas de TODOS los conceptos listados** (Knowledge Resource, Knowledge Access Request, Knowledge Result, Knowledge Context, Provenance, Classification, Taint, Restriction, Derived Knowledge, Knowledge Freshness, Knowledge Snapshot, Retrieval Scope, Source Authority, Context Consumer, Knowledge Invalidation), no solo Knowledge Source. **BLOQUEANTE** — es la sección de conceptos normativos y hoy 15 de 16 son nombres sin definición.
2. **(§7/§6/§8) Confinamiento duro de credencial amplia en la lectura:** el resultado se acota al alcance autorizado del Knowledge Access Request con independencia de la amplitud de la credencial de la fuente; el over-fetch se filtra al alcance, no se retiene y no entra en Context Assembly; quitar el "cuando corresponda". **BLOQUEANTE** (punto 8 — exfiltración por sobre-recuperación).
3. **(§9/§8) Procedencia, clasificación y taint los estampa una frontera controlada por Core,** no el conector de la fuente ni una Extension (que pueden ser no confiables, RFC-0006); un conector no puede mislabel ni borrar esos atributos. **BLOQUEANTE** — sin esto, las etiquetas por elemento valen solo lo que el conector no confiable diga (mismo defecto que señalé en RFC-0005/0006).
4. **(§13/§24) Vincular el conocimiento que justifica materialmente un efecto relevante/irreversible a Turn/Binding/evidencia como *requisito* (must), no "puede",** para reconstrucción forense. **ALTO.**
5. **(§14) Añadir "prompts" y los payloads de contexto ensamblado a la enumeración de aislamiento por organización.** **MEDIO.**
6. **(§10/§16) Cláusula de agregación/mosaico:** componer elementos individualmente permitidos puede producir inferencias restringidas; donde la sensibilidad combinada exceda la del elemento más permisivo, tratar como mayor clasificación o exigir reevaluación. **MEDIO** (gancho de contrato para el residual 2).
7. **(§12/§15) Cross-referenciar que los destinos de telemetría/prompt heredan la mediación de efectos de RFC-0006,** no solo "destinos gobernados" por afirmación; el read-path es una superficie de exfiltración mayor. **MEDIO.**
8. **(§11/§29) Explicitar que borrado/revocación/reclasificación propaga la invalidación a TODOS los derivados** (embeddings, índices, resúmenes, cachés) **y al contexto ya entregado a Turns asíncronos en vuelo**, con una cota de tiempo de propagación. **MEDIO.**
9. **(§6) Definir la semántica de "finalidad/purpose":** debe pertenecer a un conjunto gobernado y ser parte de la autorización (purpose-limitation), no texto libre auto-afirmado por el solicitante. **MEDIO.**
10. **(§8) Especificar que la exclusión de resultados no verificables es fail-closed** (excluir, no incluir-con-aviso) y que lo excluido se registra. **BAJO-MEDIO.**
11. **(§9) Aclarar qué atributos por elemento son obligatorios vs condicionales** ("cuando aplique"): obligatorios al menos org, fuente, clasificación, procedencia, taint, restricciones. **BAJO-MEDIO.**
12. **(estilo) Normalizar la prosa meta-descriptiva** ("Define que:", "Exige que:", "Explica que:") en enunciados normativos directos para el Draft establecido. **BAJO.**

## Cambios bloqueantes antes de establecer RFC-0009 como Draft

- **Corrección 1** — definir los conceptos de §5 (completitud normativa del documento).
- **Corrección 2** — confinamiento duro de credencial amplia en la lectura (cierra el `PARTIAL`/vector de exfiltración del punto 8).
- **Corrección 3** — procedencia/taint estampados por Core, no por el conector no confiable (raíz de integridad de todo el modelo de provenance).

Las tres son acotadas y rápidas. El resto (4-12) son endurecimientos para v0.2.

## Veredicto

## `REQUIRES TARGETED CORRECTIONS`

**Por qué no es `READY TO ESTABLISH DRAFT`:** el modelo es excelente, pero (a) la sección de **conceptos normativos (§5) está sin escribir** —lista 16 términos y solo define uno—, y (b) el confinamiento de credenciales amplias en la lectura es **blando** ("cuando corresponda"), dejando abierto el vector de exfiltración por over-fetch que es precisamente lo que este RFC existe para cerrar; (c) la integridad de la procedencia depende de que la estampe Core y no el conector. Son **tres correcciones dirigidas y rápidas**, no rediseño.

**Por qué no es `NEEDS PARTIAL REDESIGN`:** la estructura es correcta, completa y disciplinada; cierra el read-path, el prompt injection indirecto, la separación read≠use, la preservación de procedencia a través de transformaciones, la composición por restricción más estricta, el aislamiento multi-tenant y la propagación de borrado a derivados. No introduce autoridad nueva (§16). Solo necesita escribir las definiciones y endurecer dos puntos.

**Lo que haría:** correcciones 1-3 antes de establecer el Draft. Con ellas, RFC-0009 queda al nivel del resto de la pila y cierra el último gran frente de seguridad de datos (la lectura gobernada y la procedencia), que era el bypass original de RFC-0002.

---

### Nota de la serie

RFC-0009 es la pieza que **paga la deuda del read-path** que vengo señalando desde RFC-0002 (Knowledge Engine como ruta de lectura no gobernada) y RFC-0003 (lectura→exfiltración). Con las tres correcciones, la pila de Kern cubre las dos mitades del gobierno de efectos: la **escritura/acción** (0003-0008) y la **lectura/conocimiento** (0009). La deuda raíz transversal sigue siendo la misma y ahora reaparece aquí en forma de **estampado de procedencia por Core** (corrección 3) y **confinamiento de credencial amplia en la lectura** (corrección 2) — los mismos dos mecanismos (taint Core-stamped, confinamiento del efector) que ya marqué en 0005/0006/0007. Mecanizar eso una vez sirve para toda la pila.

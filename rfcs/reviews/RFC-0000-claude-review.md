# Revisión externa de RFC-0000

- **RFC revisado:** RFC-0000 — The Kern RFC Process
- **Fuente:** Claude
- **Fecha:** 2026-06-26
- **Estado:** Input de revisión; no representa una decisión de Kern

---

Voy directo. He leído el RFC-0000 línea a línea. Tiene buen instinto pero está lleno de agujeros que lo romperán antes de que escribas una sola línea de Kern.

---

## 1. Ambigüedades peligrosas

- **"Core" se usa como pilar de todo (2, 14.1, 14.5, 14.8) y nunca se define.** RFC-0000 depende conceptualmente de RFC-0002 (arquitectura), que aún no existe. La constitución del proyecto apoya sus reglas en un concepto que define un documento futuro. Dependencia circular en la raíz.

- **"Interfaz pública" activa medio proceso (5.1, 13.1, 14.9) y no está definida.** Es la frontera más importante del documento y queda al juicio de cada autor. Cualquiera que quiera saltarse el RFC dirá "esto no es interfaz pública". El agujero más explotable que tienes.

- **Todos los gatillos son subjetivos y los evalúa el interesado:** "decisión relevante" (1, 4), "afecten a más de un módulo" (3), "difíciles o costosos de revertir" (5.9), "dependencia tecnológica relevante" (5.3). El que quiere evitar la burocracia es quien decide si aplica. Conflicto de interés incrustado en la definición.

- **"Cambios sustanciales → RFC nuevo" vs "correcciones editoriales menores → editar manteniendo historial" (sección 7).** La línea entre ambos no existe. Por ahí se cuela exactamente la reescritura silenciosa que la propia sección 11 prohíbe. ¿Aclarar una frase ambigua de un `Accepted` es editorial o cambia el significado? No hay criterio.

- **`Implemented`: "implementación de referencia O aplicada de forma verificable" (sección 6).** Dos varas distintas, sin definir cuál cuenta ni quién lo verifica. ¿Un prototipo cuenta? El estado no significa nada operativo.

- **Escotillas de escape pegadas a las reglas:** "salvo justificación excepcional" (14.5), "cuando sea razonable" (14.10), "si aplica" (10), "cuando trata datos, permisos o ejecución" (9). Cada una neutraliza la regla a la que acompaña.

## 2. Huecos de gobierno

- **El RFC no resuelve su propia autoridad.** Lo firma el "Architecture Council", la sección 11 dice que decide el **CTO**, y la pregunta abierta #2 admite que no se sabe qué requiere al **fundador**. Tres autoridades, ninguna reconciliada. El documento que define cómo se gobierna Kern no sabe quién gobierna Kern. Esto debe cerrarse **dentro** de RFC-0000, no en "preguntas abiertas".

- **Bus factor = 1.** Toda decisión cuelga del CTO (11). No hay quórum, delegación, desempate ni qué pasa si no está disponible. Un RFC puede quedar esperando veredicto para siempre y bloquear desarrollo.

- **Conflicto de interés sin tratar.** En equipo pequeño el CTO será autor de la mayoría de RFCs. ¿Quién los aprueba? El proceso lo deja aprobándose a sí mismo.

- **Conflictos entre RFCs se reconocen pero no se resuelven.** La sección 12 dice que un RFC "puede entrar en conflicto con otro" y ahí termina. No hay mecanismo de resolución. Declarar el problema no es gobernarlo.

- **No hay cláusula de enmienda de RFC-0000.** ¿Cómo se reforma el propio proceso, con qué mayoría? La constitución no tiene mecanismo de cambio. En 2 años será un problema real.

- **Sin dueños de proceso:** no se define quién puede crear un RFC, quién asigna números, quién mantiene el índice README. Procesos huérfanos = procesos que no ocurren.

- **`Withdrawn` es una vía de escape.** Un autor retira antes del veredicto y la idea no queda "formalmente descartada" (6) → reabrible indefinidamente. Justo lo que `Rejected` pretende evitar. Se puede usar Withdrawn para esquivar el "no reabrir sin info nueva".

## 3. Problemas de escalabilidad

- **El proceso describe una organización que no existe.** Presupone CTO, council y **cuatro carriles de revisión** (Arquitectura/Ingeniería/Investigación/Producto). Con 1-3 personas es teatro; los cuatro roles caen sobre las mismas personas, que se vuelven cuello de botella. No hay regla de cuántos revisores mínimos ni cómo se cubren los carriles a escala pequeña.

- **Numeración secuencial manual → colisiones.** Con 10 personas y PRs concurrentes, dos `RFC-0042` simultáneos es inevitable. No hay reserva de número ni asignación-al-merge. Se rompe el día que haya paralelismo.

- **~20 secciones obligatorias (sección 8).** A escala de 100 RFCs, o nadie las rellena, o se rellenan como relleno para pasar el control. Ambos destruyen el valor del registro.

- **El README como índice manual divergirá de la realidad.** Estado, relaciones y resumen mantenidos a mano sobre 100 entradas = índice mentiroso en meses.

- **Sin taxonomía ni búsqueda.** Solo números secuenciales. "El RFC de permisos" no se encuentra por número. A escala necesitas tags/categorías; no existen.

- **Clientes enterprise: el agujero está aparcado en pregunta abierta #5.** "RFCs privados por cliente" choca de frente con "repositorio = única fuente de verdad" (15). Esto explota con el primer cliente que exija confidencialidad — y ese es justo el cliente enterprise objetivo.

## 4. Riesgos técnicos

- **Congela el envío.** "Se debe crear un RFC **antes** de implementar" (5) + 20 secciones + aprobación de un único CTO = waterfall encubierto. La lista de "sí requiere RFC" es ancha y vaga; la de "no requiere" es estrecha. El default empuja casi todo al proceso pesado.

- **Ilegaliza aprender prototipando.** "Propone código antes de definir el contrato" descalifica para Review (9). Pero el buen diseño suele salir de spikes desechables. Fuerzas diseño sobre el papel y prohíbes el prototipo-para-aprender.

- **Fabricas el shadow-process que dices combatir.** La sección 15 prohíbe decidir en Telegram/chat pero no ofrece un carril ligero. Resultado: backlog de RFCs pesados → la gente decide en Telegram igual. Has creado el incentivo exacto que querías eliminar.

- **"Fuente de verdad" no es exigible.** No hay vínculo RFC ↔ PR ↔ release (admitido en pregunta abierta #4). El código deriva del `Accepted` y nada lo detecta. La afirmación central del documento es aspiracional.

- **Deuda técnica invisible.** Nada vigila el drift `Accepted`-pero-nunca-`Implemented` (arquitectura fantasma). Nada revalida un `Accepted` que el tiempo vuelve falso pero sigue marcado vigente para siempre. `Deprecated` no tiene dueño ni fecha de retirada. La deuda no se escapa: es que el proceso no la mira.

- **Binario RFC / no-RFC.** No hay peso intermedio. Las decisiones medianas se inflan a proceso pesado o se saltan por completo.

## 5. Cambios concretos (ordenados por impacto)

1. **Glosario normativo** (nueva sección dentro de 3): definir con criterio objetivo "Core", "interfaz pública", "módulo", "decisión relevante", "difícil de revertir". Sin esto, todos los gatillos son inservibles. **Prioridad máxima.**
2. **Cerrar la autoridad dentro del RFC** (sección 11 + resolver preguntas 1 y 2): modelo único de decisión con quórum, delegación, desempate, rol del fundador y qué pasa cuando el decisor es autor.
3. **Añadir carril ligero (ADR / "RFC-Lite")** (secciones 5 y 8): plantilla de 5 secciones para decisiones medianas. Drena la presión que hoy empuja todo a Telegram o al proceso pesado.
4. **SLAs por transición de estado** (sección 10): máximo de días en Review y para la decisión del CTO. Mata el bloqueo indefinido del desarrollo.
5. **Estructura escalada por tipo de RFC** (sección 8): mínimo obligatorio + secciones condicionales según tipo, no las 20 para todo. Elimina el relleno-teatro.
6. **Cerrar el agujero de reescritura silenciosa** (sección 7): definir exactamente "editorial menor" y exigir changelog + diff para cualquier edición de un `Accepted`.
7. **Cláusula de enmienda de RFC-0000** (nueva sección): cómo y con qué mayoría se cambia el propio proceso.
8. **Arreglar numeración** (sección 7): asignar número al hacer merge o usar un broker de reserva. Elimina colisiones concurrentes.
9. **Permitir spikes/prototipos explícitamente** (sección 9): carve-out para código desechable que informa el diseño, sin que descalifique el RFC.
10. **Exigir vínculo RFC ↔ PR ↔ release** (sección 15 + pregunta 4): hace exigible la "fuente de verdad".
11. **Mecanismo de resolución de conflictos entre RFCs** (sección 12): no solo declarar el conflicto, decidir cómo gana uno.
12. **Revalidación periódica de `Accepted`** (secciones 6 y 11): caducidad o re-revisión, para que no queden "vigentes" siendo ya falsos.
13. **Tooling/CI obligatorio** (sección 15): validar estructura, estado y enlaces, y generar el índice automáticamente. El README manual no escala.
14. **Right-sizing para equipo pequeño** (sección 10): mínimo de revisores y cómo una persona cubre varios carriles mientras el equipo es 1-3.
15. **Cerrar `Withdrawn` como escape** (sección 6): retirado tras crítica sustancial no reaparece sin información nueva, igual que `Rejected`.

---

**Veredicto:** la sección 14 (principios de diseño) es sólida y vale la pena conservarla casi intacta. El resto es una constitución de imperio escrita para una organización que aún no existe. **Los dos riesgos que te hunden ya:** (a) frena el envío justo cuando la prioridad del trimestre es lanzar los crowdfunding y vender, y (b) no resuelve su propia autoridad. No apruebes esto como está: arregla los cambios 1-4, baja a v0.2 y entonces adóptalo.

¿Te redacto la v0.2 con los cambios 1-4 ya escritos, o prefieres que ataque solo el glosario (cambio 1), que es el que desbloquea todo lo demás?

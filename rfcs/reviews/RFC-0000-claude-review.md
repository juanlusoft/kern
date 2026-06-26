# RevisiÃ³n externa de RFC-0000

- **RFC revisado:** RFC-0000 â€” The Kern RFC Process
- **Fuente:** Claude
- **Fecha:** 2026-06-26
- **Estado:** Input de revisiÃ³n; no representa una decisiÃ³n de Kern

---

Voy directo. He leÃ­do el RFC-0000 lÃ­nea a lÃ­nea. Tiene buen instinto pero estÃ¡ lleno de agujeros que lo romperÃ¡n antes de que escribas una sola lÃ­nea de Kern.

---

## 1. AmbigÃ¼edades peligrosas

- **"Core" se usa como pilar de todo (2, 14.1, 14.5, 14.8) y nunca se define.** RFC-0000 depende conceptualmente de RFC-0002 (arquitectura), que aÃºn no existe. La constituciÃ³n del proyecto apoya sus reglas en un concepto que define un documento futuro. Dependencia circular en la raÃ­z.

- **"Interfaz pÃºblica" activa medio proceso (5.1, 13.1, 14.9) y no estÃ¡ definida.** Es la frontera mÃ¡s importante del documento y queda al juicio de cada autor. Cualquiera que quiera saltarse el RFC dirÃ¡ "esto no es interfaz pÃºblica". El agujero mÃ¡s explotable que tienes.

- **Todos los gatillos son subjetivos y los evalÃºa el interesado:** "decisiÃ³n relevante" (1, 4), "afecten a mÃ¡s de un mÃ³dulo" (3), "difÃ­ciles o costosos de revertir" (5.9), "dependencia tecnolÃ³gica relevante" (5.3). El que quiere evitar la burocracia es quien decide si aplica. Conflicto de interÃ©s incrustado en la definiciÃ³n.

- **"Cambios sustanciales â†’ RFC nuevo" vs "correcciones editoriales menores â†’ editar manteniendo historial" (secciÃ³n 7).** La lÃ­nea entre ambos no existe. Por ahÃ­ se cuela exactamente la reescritura silenciosa que la propia secciÃ³n 11 prohÃ­be. Â¿Aclarar una frase ambigua de un `Accepted` es editorial o cambia el significado? No hay criterio.

- **`Implemented`: "implementaciÃ³n de referencia O aplicada de forma verificable" (secciÃ³n 6).** Dos varas distintas, sin definir cuÃ¡l cuenta ni quiÃ©n lo verifica. Â¿Un prototipo cuenta? El estado no significa nada operativo.

- **Escotillas de escape pegadas a las reglas:** "salvo justificaciÃ³n excepcional" (14.5), "cuando sea razonable" (14.10), "si aplica" (10), "cuando trata datos, permisos o ejecuciÃ³n" (9). Cada una neutraliza la regla a la que acompaÃ±a.

## 2. Huecos de gobierno

- **El RFC no resuelve su propia autoridad.** Lo firma el "Architecture Council", la secciÃ³n 11 dice que decide el **CTO**, y la pregunta abierta #2 admite que no se sabe quÃ© requiere al **fundador**. Tres autoridades, ninguna reconciliada. El documento que define cÃ³mo se gobierna Kern no sabe quiÃ©n gobierna Kern. Esto debe cerrarse **dentro** de RFC-0000, no en "preguntas abiertas".

- **Bus factor = 1.** Toda decisiÃ³n cuelga del CTO (11). No hay quÃ³rum, delegaciÃ³n, desempate ni quÃ© pasa si no estÃ¡ disponible. Un RFC puede quedar esperando veredicto para siempre y bloquear desarrollo.

- **Conflicto de interÃ©s sin tratar.** En equipo pequeÃ±o el CTO serÃ¡ autor de la mayorÃ­a de RFCs. Â¿QuiÃ©n los aprueba? El proceso lo deja aprobÃ¡ndose a sÃ­ mismo.

- **Conflictos entre RFCs se reconocen pero no se resuelven.** La secciÃ³n 12 dice que un RFC "puede entrar en conflicto con otro" y ahÃ­ termina. No hay mecanismo de resoluciÃ³n. Declarar el problema no es gobernarlo.

- **No hay clÃ¡usula de enmienda de RFC-0000.** Â¿CÃ³mo se reforma el propio proceso, con quÃ© mayorÃ­a? La constituciÃ³n no tiene mecanismo de cambio. En 2 aÃ±os serÃ¡ un problema real.

- **Sin dueÃ±os de proceso:** no se define quiÃ©n puede crear un RFC, quiÃ©n asigna nÃºmeros, quiÃ©n mantiene el Ã­ndice README. Procesos huÃ©rfanos = procesos que no ocurren.

- **`Withdrawn` es una vÃ­a de escape.** Un autor retira antes del veredicto y la idea no queda "formalmente descartada" (6) â†’ reabrible indefinidamente. Justo lo que `Rejected` pretende evitar. Se puede usar Withdrawn para esquivar el "no reabrir sin info nueva".

## 3. Problemas de escalabilidad

- **El proceso describe una organizaciÃ³n que no existe.** Presupone CTO, council y **cuatro carriles de revisiÃ³n** (Arquitectura/IngenierÃ­a/InvestigaciÃ³n/Producto). Con 1-3 personas es teatro; los cuatro roles caen sobre las mismas personas, que se vuelven cuello de botella. No hay regla de cuÃ¡ntos revisores mÃ­nimos ni cÃ³mo se cubren los carriles a escala pequeÃ±a.

- **NumeraciÃ³n secuencial manual â†’ colisiones.** Con 10 personas y PRs concurrentes, dos `RFC-0042` simultÃ¡neos es inevitable. No hay reserva de nÃºmero ni asignaciÃ³n-al-merge. Se rompe el dÃ­a que haya paralelismo.

- **~20 secciones obligatorias (secciÃ³n 8).** A escala de 100 RFCs, o nadie las rellena, o se rellenan como relleno para pasar el control. Ambos destruyen el valor del registro.

- **El README como Ã­ndice manual divergirÃ¡ de la realidad.** Estado, relaciones y resumen mantenidos a mano sobre 100 entradas = Ã­ndice mentiroso en meses.

- **Sin taxonomÃ­a ni bÃºsqueda.** Solo nÃºmeros secuenciales. "El RFC de permisos" no se encuentra por nÃºmero. A escala necesitas tags/categorÃ­as; no existen.

- **Clientes enterprise: el agujero estÃ¡ aparcado en pregunta abierta #5.** "RFCs privados por cliente" choca de frente con "repositorio = Ãºnica fuente de verdad" (15). Esto explota con el primer cliente que exija confidencialidad â€” y ese es justo el cliente enterprise objetivo.

## 4. Riesgos tÃ©cnicos

- **Congela el envÃ­o.** "Se debe crear un RFC **antes** de implementar" (5) + 20 secciones + aprobaciÃ³n de un Ãºnico CTO = waterfall encubierto. La lista de "sÃ­ requiere RFC" es ancha y vaga; la de "no requiere" es estrecha. El default empuja casi todo al proceso pesado.

- **Ilegaliza aprender prototipando.** "Propone cÃ³digo antes de definir el contrato" descalifica para Review (9). Pero el buen diseÃ±o suele salir de spikes desechables. Fuerzas diseÃ±o sobre el papel y prohÃ­bes el prototipo-para-aprender.

- **Fabricas el shadow-process que dices combatir.** La secciÃ³n 15 prohÃ­be decidir en Telegram/chat pero no ofrece un carril ligero. Resultado: backlog de RFCs pesados â†’ la gente decide en Telegram igual. Has creado el incentivo exacto que querÃ­as eliminar.

- **"Fuente de verdad" no es exigible.** No hay vÃ­nculo RFC â†” PR â†” release (admitido en pregunta abierta #4). El cÃ³digo deriva del `Accepted` y nada lo detecta. La afirmaciÃ³n central del documento es aspiracional.

- **Deuda tÃ©cnica invisible.** Nada vigila el drift `Accepted`-pero-nunca-`Implemented` (arquitectura fantasma). Nada revalida un `Accepted` que el tiempo vuelve falso pero sigue marcado vigente para siempre. `Deprecated` no tiene dueÃ±o ni fecha de retirada. La deuda no se escapa: es que el proceso no la mira.

- **Binario RFC / no-RFC.** No hay peso intermedio. Las decisiones medianas se inflan a proceso pesado o se saltan por completo.

## 5. Cambios concretos (ordenados por impacto)

1. **Glosario normativo** (nueva secciÃ³n dentro de 3): definir con criterio objetivo "Core", "interfaz pÃºblica", "mÃ³dulo", "decisiÃ³n relevante", "difÃ­cil de revertir". Sin esto, todos los gatillos son inservibles. **Prioridad mÃ¡xima.**
2. **Cerrar la autoridad dentro del RFC** (secciÃ³n 11 + resolver preguntas 1 y 2): modelo Ãºnico de decisiÃ³n con quÃ³rum, delegaciÃ³n, desempate, rol del fundador y quÃ© pasa cuando el decisor es autor.
3. **AÃ±adir carril ligero (ADR / "RFC-Lite")** (secciones 5 y 8): plantilla de 5 secciones para decisiones medianas. Drena la presiÃ³n que hoy empuja todo a Telegram o al proceso pesado.
4. **SLAs por transiciÃ³n de estado** (secciÃ³n 10): mÃ¡ximo de dÃ­as en Review y para la decisiÃ³n del CTO. Mata el bloqueo indefinido del desarrollo.
5. **Estructura escalada por tipo de RFC** (secciÃ³n 8): mÃ­nimo obligatorio + secciones condicionales segÃºn tipo, no las 20 para todo. Elimina el relleno-teatro.
6. **Cerrar el agujero de reescritura silenciosa** (secciÃ³n 7): definir exactamente "editorial menor" y exigir changelog + diff para cualquier ediciÃ³n de un `Accepted`.
7. **ClÃ¡usula de enmienda de RFC-0000** (nueva secciÃ³n): cÃ³mo y con quÃ© mayorÃ­a se cambia el propio proceso.
8. **Arreglar numeraciÃ³n** (secciÃ³n 7): asignar nÃºmero al hacer merge o usar un broker de reserva. Elimina colisiones concurrentes.
9. **Permitir spikes/prototipos explÃ­citamente** (secciÃ³n 9): carve-out para cÃ³digo desechable que informa el diseÃ±o, sin que descalifique el RFC.
10. **Exigir vÃ­nculo RFC â†” PR â†” release** (secciÃ³n 15 + pregunta 4): hace exigible la "fuente de verdad".
11. **Mecanismo de resoluciÃ³n de conflictos entre RFCs** (secciÃ³n 12): no solo declarar el conflicto, decidir cÃ³mo gana uno.
12. **RevalidaciÃ³n periÃ³dica de `Accepted`** (secciones 6 y 11): caducidad o re-revisiÃ³n, para que no queden "vigentes" siendo ya falsos.
13. **Tooling/CI obligatorio** (secciÃ³n 15): validar estructura, estado y enlaces, y generar el Ã­ndice automÃ¡ticamente. El README manual no escala.
14. **Right-sizing para equipo pequeÃ±o** (secciÃ³n 10): mÃ­nimo de revisores y cÃ³mo una persona cubre varios carriles mientras el equipo es 1-3.
15. **Cerrar `Withdrawn` como escape** (secciÃ³n 6): retirado tras crÃ­tica sustancial no reaparece sin informaciÃ³n nueva, igual que `Rejected`.

---

**Veredicto:** la secciÃ³n 14 (principios de diseÃ±o) es sÃ³lida y vale la pena conservarla casi intacta. El resto es una constituciÃ³n de imperio escrita para una organizaciÃ³n que aÃºn no existe. **Los dos riesgos que te hunden ya:** (a) frena el envÃ­o justo cuando la prioridad del trimestre es lanzar los crowdfunding y vender, y (b) no resuelve su propia autoridad. No apruebes esto como estÃ¡: arregla los cambios 1-4, baja a v0.2 y entonces adÃ³ptalo.

Â¿Te redacto la v0.2 con los cambios 1-4 ya escritos, o prefieres que ataque solo el glosario (cambio 1), que es el que desbloquea todo lo demÃ¡s?

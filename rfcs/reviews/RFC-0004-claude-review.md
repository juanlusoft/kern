---
title: Revisión de seguridad — RFC-0004 Identity, Tenancy and Authorization Model
autor: Claude (Anthropic) — escrito por Claude
revisor_rol: Principal Security Architect (IAM empresarial, autorización distribuida, multi-tenancy, delegación, privilege escalation, seguridad de agentes)
fecha: 2026-06-27
documento_revisado: RFC-0004 — Identity, Tenancy and Authorization Model (v0.1)
veredicto: APTO PARA V0.2 CON CAMBIOS (condicionado)
---

> **Nota de autoría:** Este informe ha sido escrito por Claude (modelo de Anthropic) actuando como Principal Security Architect. Es una crítica técnica, no una aprobación formal.

# Revisión de seguridad — RFC-0004 Identity, Tenancy and Authorization Model

Es, de lejos, el RFC más maduro de la serie: absorbió el feedback previo (cierre del "recurso de plataforma", el canal no autovalida, separación ejecutor/delegado, regla de intersección, "ninguna identidad obtiene autoridad por existir", deny terminal, las aprobaciones no crean autoridad). El conjunto de 15 invariantes es sólido y, acierto importante, el modelo es **neutral de formato** (no se casa con RBAC/ABAC/ReBAC). Pero para un sistema que corre agentes en varias organizaciones tocando correo, ERP y CRM, todavía tiene **huecos críticos de postura de enforcement**, no solo de prosa.

## 1. Bypasses de autorización

- **La regla de intersección (5.5, inv. 4) acota la *autoridad lógica*, no el *efecto real*.** El efector es la credencial externa de la tool (p. ej. API-key de CRM completa). 8.4 dice que la tool la usa "únicamente dentro del alcance autorizado", pero es una afirmación, no un mecanismo. Si la credencial es amplia y Tool Engine no confina el efecto, el modelo dice "no" y la credencial dice "sí". Gobierna la decisión, no el efecto.
- **La delegación no atenúa.** Si un humano con autoridad amplia (un admin) delega en un agente, la "intersección con la identidad delegada" casi no estrecha nada: el agente hereda la huella completa del humano por solicitud. Eso es justo el superusuario que el objetivo 4 quiere evitar. La delegación debe *atenuar* (scope mínimo por defecto), no solo intersecar.
- **Identidad de servicio como vía de escalada.** 5.4 prohíbe que asuma implícitamente una persona (bien), pero **no hay tope a la concesión máxima** de una identidad de servicio. Una identidad de servicio amplia usada por un workflow/agente es el superusuario permanente que el modelo dice prohibir.
- **Operador (8.5).** "No obtiene *por defecto* acceso al contenido de todas las organizaciones" — "por defecto" es el agujero. El operador administra el Control Plane: crea recursos de plataforma, concesiones, identidades de servicio. Es la llave maestra y es la identidad **menos** restringida del documento. No hay separación entre autoridad de *administración de plataforma* y autoridad sobre *datos de organización*.
- **Extensión: consentimiento general en la instalación.** Permisos declarados = "solicitudes" (5.4/8.4), pero si un admin de org pulsa "instalar + aprobar todo", la extensión (no confiable) obtiene autoridad amplia y permanente para esa org. No hay principio de least-privilege, caducidad ni re-consentimiento.
- **Confianza en el Decision Binding.** La inv. de 11 ("ningún Binding concede autoridad que este RFC no permita") presupone que el Binding es **infalsificable y ligado a identidad+solicitud** — y eso era precisamente un hueco no cerrado como invariante en RFC-0003. Si no se cierra arriba, **todo este modelo es advisory**: falsifica un binding y saltas todo.

## 2. Confused deputy

- **Credencial externa vs identidad delegada.** El sistema externo (ERP) autentica la *cuenta de servicio de la tool*, no la identidad ejecutora/delegada de Kern. En el sistema de registro todo aparece como la cuenta de integración con sus derechos plenos → sin atribución real, y esos derechos plenos son el techo verdadero, por encima de la autoridad lógica más estrecha de Kern. Falta propagación on-behalf-of al sistema externo y credenciales por-tenant/por-delegación. La inv. 13 es la intención correcta pero es una regla sobre la decisión de Kern, no sobre el poder real de la credencial.
- **¿Bajo qué identidad corre el efecto?** 5.5 evalúa ejecutor y delegado "de forma separada", pero el Binding lleva ambas y el documento **no resuelve qué identidad se presenta al sistema externo**. Si corre como ejecutor (servicio), se pierde la atribución del humano; si corre como delegado, hace falta una credencial externa que el agente no tiene.
- **Aprobación como diputado.** El humano aprueba; el ejecutor (agente/servicio) actúa. Si el binding/aprobación no está ligado a la solicitud exacta post-transform (hueco heredado de RFC-0003), el agente es un diputado que puede ser confundido para aplicar la aprobación en otra operación.

## 3. Delegación: encadenada, circular, amplia, persistente, herencia accidental

- **Sin prohibición de re-delegación / cadenas.** 5.8 define A→B y calla sobre B→C. Cadenas "cada salto dentro de su autoridad" ofuscan la procedencia y hacen incomputable la intersección. Debe declararse: **no re-delegación por defecto**; si se permite, acotada en profundidad, no amplificante, cadena completa auditada y reevaluada.
- **Sin guardia de circularidad.** A→B y B→A con scopes distintos = laundering por unión de scopes. Falta invariante de **aciclicidad + atenuación monótona**.
- **Delegación persistente.** 5.8 exige "periodo de validez" pero **no lo acota** ni exige TTL corto por defecto. Una delegación de larga/nula caducidad = autoridad permanente que sobrevive a la sesión origen. (Los workflows sí tienen 8.3; la delegación general no.)
- **Herencia accidental.** "Incluir o *referenciar*... scopes permitidos" (5.8) admite referenciar el conjunto de scopes completo del delegado → herencia amplia. El default debe ser **deny-all, grant-specific**, con enumeración de scope mínimo.
- **Delegación diferida (workflows programados).** Un workflow delegado que corre a T+30 días es una concesión permanente; necesita re-consentimiento/re-binding en la ejecución diferida.

## 4. Tenancy y recursos compartidos

- **Providers/runtimes son "recurso de plataforma" (7).** Es decir, el sustrato que procesa datos empresariales es compartido. 10 prohíbe reutilizar "contexto, memoria o cachés" entre orgs, pero **sin mecanismo ni invariante** de que un recurso de plataforma que procesa datos de org imponga aislamiento por solicitud y **no persista contenido de org**. Canales laterales (KV-cache/prompt-cache reuse, batching, logs, métricas de uso/coste que revelan actividad de otro tenant) no se tratan.
- **Compartición cross-org por "autoridad válida" (5.1, inv. 12) indefinida.** ¿Quién autoriza que org-A lea org-B? Si puede un operador de plataforma, es un puente cross-tenant controlado por el vendedor. Debe exigir **autoridad de *ambas* organizaciones**, nunca un operador de plataforma solo.
- **Fuga de metadatos.** Inv. "no enumerar recursos de otra org" (10) bien, pero ¿son enumerables los providers/models de plataforma entre orgs (revelando qué instaló otro tenant)? No se aborda.
- **Extensión multi-tenant.** Un proceso de extensión que sirve a varias orgs puede filtrar en memoria igual que un provider. Sin requisito de aislamiento para instancias multi-tenant.

## 5. Ambigüedades peligrosas (términos)

- **"Autoridad":** se usa como *capacidad concedida* (5.6) y como *entidad que concede* ("autoridad válida", "autoridad del Control Plane", "emisor o autoridad responsable"). Dos sentidos de la misma palabra en un documento de seguridad. Desambiguar: autoridad (capacidad) vs autorizador/emisor (principal).
- **"Scope" (5.7):** "un scope ambiguo debe tratarse como insuficiente" — ¿quién juzga la ambigüedad? Sin representación canónica, "suficientemente específico" es criterio variable. El **fail-closed ante ambigüedad debe ser invariante**, no prosa.
- **"Concesión" vs "delegación":** se solapan y **no se define su composición**. Si un agente tiene una concesión propia *y* una delegación, ¿la autoridad efectiva es intersección o unión? 5.5 interseca ejecutor+delegado, pero una concesión al ejecutor podría ensanchar su lado → unión accidental.
- **"Recurso de plataforma":** mezcla infraestructura (runtime) con recursos de datos compartidos. Perfiles de riesgo distintos; agruparlos invita al problema de caché.
- **"Operador" vs "administrador":** 8.5 operador; 7 "persona administradora de una organización". Los dos roles más poderosos son los de frontera más difusa. Separar autoridad de operador-de-plataforma de autoridad de admin-de-org es crítico.
- **"Revocación" vs "suspensión":** se usan juntas y nunca se distinguen (reversible vs permanente: distinta propagación y auditoría). Y "debe aplicarse antes de nuevas operaciones... *cuando sea razonable*" (5.10) es un **fail-open en la operación más crítica**.

## 6. Aprobación humana como concesión permanente / sustituto de autoridad

Es el área mejor resuelta (9 + inv. 9: la aprobación no crea ni amplía autoridad, no sustituye concesión inexistente, no se reutiliza). Pero:
- **Concesión + aprobación por el mismo principal = auto-autorización.** La separación de deberes (9) es "cuando una política lo exija" — opcional, no default para alto impacto. Debe ser **SoD por defecto** en acciones de alto impacto o derivadas de contenido no confiable.
- **El binding a la solicitud exacta depende del arreglo de RFC-0003.** Si no se mecaniza, la inv. 9 es afirmada pero no exigible.
- **Aprobaciones de clase ("permitir siempre a este agente emitir facturas")** convertirían la aprobación en concesión permanente. Debe prohibirse explícitamente: aprobación ligada a una única solicitud concreta.

## 7. Revocación

- **"Cuando sea razonable" (5.10)** es la frase asesina: para operaciones en curso y workflows largos, condiciona la reevaluación a "razonable" → ventana fail-open. Debe ser **fail-closed** para efectos relevantes/irreversibles.
- **Bindings ya emitidos.** Si la revocación llega tras emitir el binding pero antes de ejecutar, el binding debe invalidarse: **comprobar estado de revocación en el momento de ejecución**, o el binding es un token-portador que sobrevive a la revocación (bypass corto).
- **Cachés de autorización.** Si se cachean decisiones/concesiones, la revocación debe invalidarlas. Stale-cache = bypass.
- **Credenciales externas.** Revocar una identidad de Kern **no** revoca la credencial CRM/ERP que sostiene la tool. Un agente revocado con tool en vuelo y credencial viva sigue actuando salvo que Tool Engine cierre cada efecto contra el estado de revocación actual.
- Bien: 8.3 ya exige reevaluar permisos del workflow en cada operación relevante. Extenderlo a tool calls en vuelo.

## 8. Invariantes obligatorios ahora vs futuro

**Buenos y presentes:** inv. 1-15 (org context, default org-scoped, sin autoridad por existir, ejecutor≤delegado, delegación no amplificante, no auto-concesión, canal no autovalida, no auto-aprobación, aprobación no crea autoridad, revocable, revocación invalida futuras, cross-org explícito, credencial externa insuficiente, recurso de plataforma con autoridad del Control Plane, deny terminal). Conjunto fuerte.

**Faltan como invariante (añadir ahora):**
- Delegación atenúa + no re-delegación por defecto + aciclicidad.
- Delegaciones/concesiones con TTL máximo; sin delegación permanente.
- Scope ambiguo/no acotado = deny (fail-closed).
- Revocación fail-closed para efectos relevantes/irreversibles.
- Binding comprobado contra revocación en ejecución (no token-portador).
- Efecto externo bajo credencial confinada al alcance autorizado (confinamiento del efector).
- Compartición cross-org requiere autoridad de *ambas* organizaciones.
- Recurso de plataforma que procesa datos de org: aislamiento por solicitud + no persistencia de contenido de org.
- SoD por defecto en alto impacto y en acciones derivadas de no confiable.
- Autoridad de operador-de-plataforma separada de autoridad sobre datos de org; alcance a contenido de org con concesión explícita, auditada y de doble control.

**Razonable diferir:** modelo formal RBAC/ABAC/ReBAC (Q#1), propagación técnica de revocación (Q#2/8), jerarquía organizativa (Q#3), umbrales de SoD (Q#4), sintaxis de scopes (Q#5), UI admin (Q#6), SSO/federación (Q#7). Bien mantenidos fuera.

## 9. ¿Permite deny terminal + privilegio mínimo sin elegir RBAC/ABAC/ReBAC/token?

- **Deny terminal: sí** (6, 328; inv. 15), neutral de formato. Correcto.
- **Privilegio mínimo: solo parcialmente.** El modelo lo *habilita* (scopes, intersección, default org-scoped, sin autoridad por existir) pero **no lo *exige* como postura por defecto**: permite concesiones amplias tan fácilmente como estrechas (la delegación puede "referenciar" todos los scopes del delegado). Para poder afirmar least-privilege sin elegir formato, falta una invariante: *toda concesión/delegación enumera el scope mínimo necesario; el scope no acotado o heredado-por-referencia es inválido.* Es neutral de formato y convierte el privilegio mínimo en propiedad, no en opción.
- Acierto: el documento es evaluable por Policy Engine sin comprometerse con RBAC/ABAC/ReBAC/token (objetivo 9). Esa separación está bien hecha.

## 10. Cambios concretos (priorizados por severidad)

1. **(5.10 / inv. 11) Revocación fail-closed, no "cuando sea razonable"; los Decision Bindings se comprueban contra revocación en el momento de ejecución.** Sustituir la frase; añadir invariante. **CRÍTICO** — hoy es ventana fail-open y el binding puede volverse token-portador.
2. **(5.8 / inv. 5) La delegación debe atenuar** (scope mínimo, no heredado-por-referencia), **no re-delegación por defecto, acotada en profundidad + acíclica, TTL máximo.** **CRÍTICO** — cadenas/persistencia/herencia amplia son el núcleo de escalada.
3. **(8.4 / inv. 13) Invariante de confinamiento del efector:** el efecto externo corre bajo credencial acotada a la operación autorizada; Tool Engine lo impone, no la tool; on-behalf-of hacia el sistema externo. **CRÍTICO** — confused deputy / credencial amplia.
4. **(8.5 / 7) Separar autoridad de operador-de-plataforma de autoridad sobre datos de org;** acceso del operador a contenido de org con concesión explícita, auditada y de doble control; default-deny. **CRÍTICO** — el operador es la identidad más poderosa y menos restringida.
5. **(11 / dependencia) Declarar invariante de dependencia: los Decision Bindings son infalsificables y ligados a identidad + solicitud exacta** (atado al arreglo de RFC-0003). Sin esto el modelo es advisory. **CRÍTICO.**
6. **(5.1 / inv. 12) La compartición cross-org requiere autoridad de AMBAS organizaciones**, nunca un operador de plataforma solo. **ALTO.**
7. **(10) Recursos de plataforma (providers/runtimes/extensiones) que procesan datos de org: aislamiento por solicitud + no persistencia de contenido de org;** tratar cachés/canales laterales/métricas. **ALTO.**
8. **(5.7) Elevar "scope ambiguo/no acotado = deny" a invariante** (fail-closed). **ALTO.**
9. **(9) SoD por defecto en acciones de alto impacto y derivadas de no confiable;** prohibir que un mismo principal emita concesión + aprobación de la misma operación. **ALTO.**
10. **(5.9 + 5.8) Definir la composición de concesiones + delegaciones** (intersección, nunca unión); una concesión propia del ejecutor no ensancha la autoridad delegada. **ALTO.**
11. **(5.6 / terminología) Desambiguar "autoridad" (capacidad) vs "autorizador/emisor" (principal)** y "operador" vs "administrador de organización". **MEDIO-ALTO.**
12. **(5.10 / terminología) Distinguir "suspensión" (reversible) de "revocación" (permanente)** con su propagación/auditoría. **MEDIO.**
13. **(5.4 / 8.4) Concesiones de extensión least-privilege, con caducidad y re-consentimiento;** prohibir el consentimiento general en la instalación como autoridad permanente. **MEDIO.**
14. **(5.4) Tope a las concesiones de identidad de servicio;** las usadas por agentes/workflows deben ser estrechas; sin concesiones de servicio permanentes ilimitadas. **MEDIO.**
15. **(6 / inv.) Invariante explícito de privilegio mínimo:** toda concesión/delegación enumera el scope mínimo necesario; el scope no acotado o heredado-por-referencia es inválido. **MEDIO** — es lo que permite afirmar least-privilege sin elegir formato.

## 11. Veredicto final

## `APTO PARA V0.2 CON CAMBIOS` — condicionado

**Por qué APTO (y no REDISEÑO PARCIAL):** a diferencia del RFC-0002 (modelo de dependencias invertido) y del RFC-0003 (faltaban mecanismos que cambiaban el modelo), aquí la **estructura es correcta**: separa los conceptos adecuados (organización, ejecutor vs delegado, autoridad como concesión explícita, recurso de plataforma blindado, deny terminal, 15 invariantes). Los arreglos son sobre todo **añadir invariantes y endurecer prosa a fail-closed**, no reestructurar. El modelo ya separa lo correcto; solo sub-restringe unos pocos puntos.

**Condiciones de bloqueo para v0.2** (sin esto, baja a `NECESITA REDISEÑO PARCIAL`):
- Cambios **1-5 son bloqueantes**: revocación fail-closed (1), atenuación/anti-cadena/TTL de delegación (2), confinamiento del efector (3), separación operador/datos-de-org (4), y la dependencia de binding infalsificable (5).
- **Dependencia externa dura:** si el hueco de RFC-0003 (token de decisión infalsificable ligado a la solicitud) no se cierra, el enforcement de RFC-0004 descansa sobre un binding falsificable y el modelo entero pasa a advisory → `NECESITA REDISEÑO PARCIAL`.

**Lo que haría ya:** cambios 1-5 antes de aprobar v0.2, y verificar que el arreglo del binding de RFC-0003 está comprometido. Con eso, este RFC es una base de autorización honesta y de las mejores de la serie.

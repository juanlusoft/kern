/**
 * Parseo DETERMINISTA del mensaje del usuario para el pricing de PacoPrint.
 *
 * Filosofía (heredada del bot antiguo que funcionaba): el runtime NO se fía de
 * cómo el modelo estructure medidas/cantidad/opciones; las extrae él mismo del
 * texto crudo con reglas testeables. La novedad frente al viejo: las OPCIONES se
 * resuelven contra las opciones REALES del catálogo (`valores_posibles`), no
 * contra una lista fija en código -> se adapta solo a cada artículo.
 *
 * El PRECIO y el descuento por cantidad los sigue calculando la API de PacoPrint;
 * aquí sólo se interpreta el texto.
 */

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const parseNumber = (s: string): number => Number.parseFloat(s.replace(',', '.'));

// Rango plausible de una dimensión en cm para gran formato (1 cm .. 50 m).
const MIN_CM = 1;
const MAX_CM = 5000;
const plausibleCm = (cm: number): boolean => Number.isFinite(cm) && cm >= MIN_CM && cm <= MAX_CM;

/** value+unidad -> cm. Sin unidad, decide por magnitud (ver `inferCmPair`). */
function unitToCm(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'mm') return value / 10;
  if (u === 'm' || u.startsWith('metro')) return value * 100;
  return value; // cm
}

/**
 * Sin unidad explícita: un "2x1" en gran formato son METROS (nadie pide una lona
 * de 2x1 cm), pero "100x200" son cm. Heurística por magnitud del par: si el mayor
 * es <= 10 asumimos metros; si no, cm.
 */
function inferCmPair(a: number, b: number): [number, number] {
  if (Math.max(a, b) <= 10) return [a * 100, b * 100];
  return [a, b];
}

export interface ParsedMeasures {
  altoCm: number;
  anchoCm: number;
}

/**
 * Extrae alto/ancho en cm del texto. Soporta:
 *  - estructurado: "Alto: 200 cm, Ancho: 100 cm" (cualquier orden, unidad opcional)
 *  - libre: "2x1 m", "200x100", "200 x 100 cm"
 * Convención del formato libre "A x B": A = ancho, B = alto (lo habitual en
 * rotulación; para productos por m2 el precio es simétrico de todas formas).
 * Devuelve null si no hay medidas plausibles.
 */
export function parseMeasures(text: string): ParsedMeasures | null {
  const t = normalizeText(text);

  const altoM = t.match(/alto:?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|metros?|m)?/);
  const anchoM = t.match(/ancho:?\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|metros?|m)?/);
  if (altoM?.[1] && anchoM?.[1]) {
    const hRaw = parseNumber(altoM[1]);
    const wRaw = parseNumber(anchoM[1]);
    let h: number;
    let w: number;
    if (altoM[2] || anchoM[2]) {
      h = altoM[2] ? unitToCm(hRaw, altoM[2]) : hRaw;
      w = anchoM[2] ? unitToCm(wRaw, anchoM[2]) : wRaw;
    } else {
      [h, w] = inferCmPair(hRaw, wRaw);
    }
    if (plausibleCm(h) && plausibleCm(w)) return { altoCm: h, anchoCm: w };
  }

  const free = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|metros?|m)?/g;
  for (const m of t.matchAll(free)) {
    if (!m[1] || !m[2]) continue;
    const aRaw = parseNumber(m[1]);
    const bRaw = parseNumber(m[2]);
    let a: number;
    let b: number;
    if (m[3]) {
      a = unitToCm(aRaw, m[3]);
      b = unitToCm(bRaw, m[3]);
    } else {
      [a, b] = inferCmPair(aRaw, bRaw);
    }
    if (plausibleCm(a) && plausibleCm(b)) {
      return { altoCm: b, anchoCm: a }; // A = ancho, B = alto
    }
  }
  return null;
}

/**
 * Cantidad de unidades del texto ("5 uds", "10 unidades", "x10 und"). Exige el
 * sufijo unid/ud/uds/unidad(es) para NO confundir un número de una medida
 * ("50x40") con una cantidad. Devuelve null si no hay patrón claro (el llamador
 * decide el default).
 */
export function parseQuantity(text: string): number | null {
  const t = normalizeText(text);
  const m = t.match(/(\d+)\s*(?:unidad(?:es)?|unid|uds?|und)\b/);
  if (m?.[1]) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= 100000) return n;
  }
  return null;
}

// --- Artículo -----------------------------------------------------------------

const FRONTLIT_RE = /frontlit|frontli\b|frontly|fronlit/;
const MESH_RE = /microperforad|mesh/;
// Tokens de nombre de artículo sin valor discriminante (gramaje, ruido).
const NOISE_TOKEN = /^\d+\s*g$|^\d+g$|^\d+$/;
const FAMILY_TOKENS = new Set(['carton', 'lona', 'metacrilato', 'pvc', 'vinilo']);
const COLOR_TOKENS = new Set([
  'acido',
  'amarillo',
  'azul',
  'blanco',
  'dorado',
  'granate',
  'gris',
  'marron',
  'naranja',
  'negro',
  'plata',
  'rojo',
  'transparente',
  'verde'
]);

/**
 * Puntúa cuánto encaja el nombre de un candidato del catálogo con el texto del
 * usuario: nº de tokens significativos (>=3 chars, no gramaje) del nombre que
 * aparecen en el texto. -1 si viola la exclusión frontlit <-> microperforada/mesh.
 */
export function scoreCandidate(rawText: string, candidateName: string): number {
  const t = normalizeText(rawText);
  const n = normalizeText(candidateName);
  if (FRONTLIT_RE.test(t) && MESH_RE.test(n)) return -1;
  if (MESH_RE.test(t) && FRONTLIT_RE.test(n)) return -1;
  const tokens = n.split(' ').filter((w) => w.length >= 3 && !NOISE_TOKEN.test(w));
  if (tokens.length === 0) return 0;
  const distinctiveTokens = tokens.filter((w) => !COLOR_TOKENS.has(w) && !FAMILY_TOKENS.has(w));
  const distinctiveTokensPresent = distinctiveTokens.length === 0 || distinctiveTokens.every((w) => t.includes(w));
  let hit = 0;
  for (const w of tokens) {
    if (!t.includes(w)) continue;
    if (COLOR_TOKENS.has(w) && !distinctiveTokensPresent) continue;
    hit += 1;
  }
  return hit;
}

export interface CandidatePick<T> {
  selected: T | null;
  ambiguous: boolean;
}

/**
 * Elige el candidato del catálogo que mejor encaja con el texto del usuario.
 * 0 candidatos -> null; 1 -> ese; varios -> el de mayor score si es único; empate
 * o score 0 -> ambiguo (el workflow pedirá aclaración con la lista).
 */
export function pickArticleCandidate<T extends { nombre: string }>(
  rawText: string,
  candidates: ReadonlyArray<T>
): CandidatePick<T> {
  if (candidates.length === 0) return { selected: null, ambiguous: false };
  if (candidates.length === 1) return { selected: candidates[0] ?? null, ambiguous: false };
  const scored = candidates
    .map((c) => ({ c, s: scoreCandidate(rawText, c.nombre) }))
    .sort((a, b) => b.s - a.s);
  const top = scored[0];
  if (!top || top.s <= 0) return { selected: null, ambiguous: true };
  const tied = scored.filter((x) => x.s === top.s);
  if (tied.length > 1) return { selected: null, ambiguous: true };
  return { selected: top.c, ambiguous: false };
}

// --- Opciones (guiadas por el catálogo) ---------------------------------------

export interface CatalogOption {
  id: string | number;
  nombre: string;
}

/** Claves de match de una opción: su nombre sin paréntesis + su primera palabra larga. */
function optionMatchKeys(nombre: string): string[] {
  const full = normalizeText(nombre.replace(/[()]/g, ' '));
  const core = normalizeText(nombre.replace(/\([^)]*\)/g, ' '));
  const keys = new Set<string>();
  const sourceForNumeric = /\d/.test(full) ? full : core;
  if (!/\d/.test(sourceForNumeric) && core.length >= 3) keys.add(core);
  const compact = sourceForNumeric.replace(/\s+/g, '');
  if (/\d/.test(compact) && compact.length >= 2) keys.add(compact);
  if (/\d/.test(sourceForNumeric)) {
    if (sourceForNumeric.length >= 3) keys.add(sourceForNumeric);
    for (const match of sourceForNumeric.matchAll(/\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?/g)) {
      const numericKey = match[0]?.trim();
      if (numericKey && numericKey.length >= 1) {
        keys.add(numericKey);
        keys.add(numericKey.replace(/\s+/g, ''));
      }
    }
    return [...keys];
  }
  const firstLong = core.split(' ').find((w) => w.length >= 4);
  if (firstLong) keys.add(firstLong);
  return [...keys];
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ¿Aparece `phrase` como palabra(s) completa(s) en `text`? (evita falsos como
 * "forma" dentro de "informa"). El texto ya está normalizado a ASCII+dígitos.
 */
function containsWord(text: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`).test(text);
}

function containsNegatedWord(text: string, phrase: string): boolean {
  return new RegExp(`\\b(?:sin|no(?:\\s+\\w+){0,4})\\s+${escapeRegExp(phrase)}\\b`).test(text);
}

/**
 * Busca en el texto la opción de un atributo cuyo nombre (o su raíz) aparezca.
 * Data-driven: recibe las `valores_posibles` reales del catálogo. Ante varias
 * coincidencias, elige la de clave más larga (más específica). null si ninguna.
 */
export function matchOptionInText(
  rawText: string,
  options: ReadonlyArray<CatalogOption>
): CatalogOption | null {
  const t = normalizeText(rawText);
  let best: CatalogOption | null = null;
  let bestLen = 0;
  for (const option of options) {
    if (typeof option?.nombre !== 'string') continue;
    for (const key of optionMatchKeys(option.nombre)) {
      const optionIsNegative = /^\s*(?:sin|no)\b/.test(normalizeText(option.nombre));
      if (!optionIsNegative && containsNegatedWord(t, key)) {
        continue;
      }
      if (key.length > bestLen && containsWord(t, key)) {
        best = { id: option.id, nombre: option.nombre };
        bestLen = key.length;
      }
    }
  }
  return best;
}

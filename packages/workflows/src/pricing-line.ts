/**
 * Resolución de UNA línea de PacoPrint: dado el artículo del catálogo y los
 * valores ya resueltos (medidas/cantidad/opciones), mapea los atributos del
 * artículo a `{atributo_id: valor}` listo para la API, detectando lo que falta
 * o es inválido. Compartido por el pricing de una línea (F1) y el borrador
 * multi-línea (F2) para que ambos resuelvan EXACTAMENTE igual.
 */
import type { PacoPrintCatalogCandidate } from '../../contracts/src/index';
import { matchOptionInText } from './pricing-parse';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizedTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function hasWholeWord(text: string, word: string): boolean {
  return normalizedTokens(text).includes(normalizeSearchText(word));
}

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);
  if (!normalizedPhrase) {
    return false;
  }
  return new RegExp(`\\b${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalizeSearchText(text));
}

function containsNegatedPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase);
  if (!normalizedPhrase) {
    return false;
  }
  return new RegExp(`\\b(?:sin|no(?:\\s+\\w+){0,4})\\s+${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
    normalizeSearchText(text)
  );
}

function labelsForNegation(...labels: string[]): string[] {
  const expanded = new Set<string>();
  for (const label of labels) {
    const normalized = normalizeSearchText(label);
    if (!normalized) {
      continue;
    }
    expanded.add(normalized);
    for (const token of normalized.split(' ')) {
      if (token.length >= 4) {
        expanded.add(token);
      }
    }
  }
  return [...expanded];
}

function normalizeCompact(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

function extractNumberNearLabel(rawText: string, labels: string[]): number | null {
  const normalized = normalizeSearchText(rawText);
  const uniqueLabels = [...new Set(labels.map((label) => normalizeSearchText(label)).filter((label) => label.length > 0))];
  for (const label of uniqueLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelThenNumber = new RegExp(`\\b${escaped}\\b\\s*(?:diferentes?)?\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\b`);
    const numberThenLabel = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(?:disenos?|diseños?)?\\s*(?:diferentes?)?\\s*\\b${escaped}\\b`);
    const labelMatch = normalized.match(labelThenNumber);
    const numberMatch = normalized.match(numberThenLabel);
    const rawValue = labelMatch?.[1] ?? numberMatch?.[1] ?? null;
    if (!rawValue) {
      continue;
    }
    const parsed = Number(rawValue.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (uniqueLabels.some((label) => /\bdiseno\b|\bdisenos\b|\bdiseño\b|\bdiseños\b/.test(label))) {
    const designMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:disenos?|diseños?)\s*diferentes?\b/);
    const differentDesignMatch = normalized.match(/\bdisenos?\s*diferentes?\s*:?\s*(\d+(?:[.,]\d+)?)\b/);
    const rawValue = designMatch?.[1] ?? differentDesignMatch?.[1] ?? null;
    if (rawValue) {
      const parsed = Number(rawValue.replace(',', '.'));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

interface ResolvedAttribute {
  id: string | number;
  nombre: string;
  valores_posibles?: Array<{ id: string | number; nombre: string }> | null;
}

export function findAttribute(candidate: PacoPrintCatalogCandidate, key: string): ResolvedAttribute | null {
  const normalizedKey = normalizeSearchText(key);
  const attributes = Array.isArray(candidate.atributos) ? candidate.atributos : [];
  for (const attribute of attributes) {
    if (!isPlainObject(attribute)) {
      continue;
    }
    const attributeId = attribute.id;
    const hasId = typeof attributeId === 'string' || typeof attributeId === 'number';
    const attributeName = typeof attribute.nombre === 'string' ? attribute.nombre : null;
    const idMatches = hasId && normalizeSearchText(String(attributeId)) === normalizedKey;
    const nameMatches = attributeName !== null && normalizeSearchText(attributeName) === normalizedKey;
    if (idMatches || nameMatches) {
      return {
        id: hasId ? attributeId : (attributeName ?? key),
        nombre: attributeName ?? String(attributeId),
        valores_posibles: Array.isArray(attribute.valores_posibles)
          ? attribute.valores_posibles.filter((item): item is { id: string | number; nombre: string } => {
              return isPlainObject(item) && (typeof item.id === 'string' || typeof item.id === 'number') && typeof item.nombre === 'string';
            })
          : null
      };
    }
  }
  return null;
}

export function selectChoice(attribute: ResolvedAttribute, rawValue: unknown): { id: string | number; nombre: string } | null {
  const values = attribute.valores_posibles ?? [];
  if (values.length === 0) {
    return null;
  }
  if (typeof rawValue === 'number' || typeof rawValue === 'string') {
    for (const option of values) {
      if (
        String(option.id) === String(rawValue) ||
        normalizeSearchText(option.nombre) === normalizeSearchText(String(rawValue)) ||
        normalizeCompact(option.nombre) === normalizeCompact(String(rawValue))
      ) {
        return { id: option.id, nombre: option.nombre };
      }
    }
  }
  if (typeof rawValue === 'boolean') {
    const keywords = rawValue ? ['con', 'sí', 'si', 'true', 'yes'] : ['sin', 'no', 'false'];
    for (const option of values) {
      const normalized = normalizeSearchText(option.nombre);
      if (keywords.some((keyword) => hasWholeWord(normalized, keyword))) {
        return { id: option.id, nombre: option.nombre };
      }
    }
  }
  return null;
}

function rawTextSupportsStructuredChoice(input: {
  rawMessage: string | null;
  displayLabel: string;
  rawValue: unknown;
  selected: { id: string | number; nombre: string };
}): boolean {
  if (!input.rawMessage) {
    return false;
  }
  const rawMessage = input.rawMessage;
  const valueText = typeof input.rawValue === 'string' || typeof input.rawValue === 'number' ? String(input.rawValue) : '';
  const labels = [input.displayLabel, valueText, input.selected.nombre].filter((label) => label.trim().length > 0);
  if (labels.some((label) => containsNegatedPhrase(rawMessage, label))) {
    return false;
  }
  if (matchOptionInText(rawMessage, [input.selected])) {
    return true;
  }
  return labels.some((label) => containsPhrase(rawMessage, label));
}

function rawTextSupportsStructuredNumber(rawMessage: string | null, labels: string[]): boolean {
  if (!rawMessage) {
    return false;
  }
  return extractNumberNearLabel(rawMessage, labels) !== null;
}

export interface LineAttributeResolution {
  resolvedAttributes: Record<string, unknown>;
  defaultsApplied: string[];
  optionsSummary: string[];
  missingFields: string[];
  invalidFields: string[];
  missingChoices: Map<string, string[]>;
}

/**
 * Mapea los atributos del artículo a `{atributo_id: valor}`. Prioridad de valor:
 * (1) opción detectada en el texto crudo contra el catálogo, (2) opción del
 * modelo, (3) valor por defecto, (4) auto-relleno de dimensión obligatoria
 * (unidades/alto/ancho) desde el top-level. Devuelve lo que falta/es inválido.
 */
export function resolveLineAttributes(
  candidate: PacoPrintCatalogCandidate,
  ctx: {
    rawMessage: string | null;
    resolvedUnits: number;
    resolvedAlto: number | null;
    resolvedAncho: number | null;
    resolvedOptions: Record<string, unknown> | null;
  }
): LineAttributeResolution {
  const { rawMessage, resolvedUnits, resolvedAlto, resolvedAncho, resolvedOptions } = ctx;
  const resolvedAttributes: Record<string, unknown> = {};
  const defaultsApplied: string[] = [];
  const optionsSummary: string[] = [];
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const missingChoices = new Map<string, string[]>();

  const rules = candidate.json_calcular_precio?.atributos;
  if (Array.isArray(rules)) {
    for (const rawRule of rules) {
      if (!isPlainObject(rawRule)) {
        continue;
      }
      const rule = rawRule as {
        atributo_id?: string | number;
        nombre?: string;
        tipo?: string;
        obligatorio?: boolean;
        valores_validos?: Array<string | number>;
        valor_defecto?: string | number | boolean | null;
      };
      if (rule.atributo_id === undefined || rule.atributo_id === null) {
        continue;
      }
      const attributeId = String(rule.atributo_id);
      const ruleName = typeof rule.nombre === 'string' && rule.nombre.trim().length > 0 ? rule.nombre : attributeId;
      const attribute = findAttribute(candidate, ruleName);
      const displayLabel = attribute?.nombre ?? ruleName;
      const normalizedName = normalizeSearchText(ruleName);
      const normalizedKey = normalizeSearchText(attributeId);
      const normalizedLabel = normalizeSearchText(displayLabel);
      let value: unknown = undefined;
      // 1) Match DETERMINISTA: buscar en el texto crudo alguna opción real del
      //    catálogo para este atributo (p.ej. "escuadrado" -> Corte=117).
      if (rawMessage && rule.tipo === 'select' && attribute?.valores_posibles && attribute.valores_posibles.length > 0) {
        const matched = matchOptionInText(rawMessage, attribute.valores_posibles);
        if (matched) {
          value = matched.id;
        }
      }
      // 2) Respaldo: opciones estructuradas que haya dado el modelo.
      if ((value === undefined || value === null || value === '') && resolvedOptions) {
        for (const [key, optionValue] of Object.entries(resolvedOptions)) {
          if (normalizeSearchText(key) === normalizedKey || normalizeSearchText(key) === normalizedLabel) {
            if (!rawMessage) {
              continue;
            }
            if (rule.tipo === 'select' && attribute) {
              const selected = selectChoice(attribute, optionValue);
              if (!selected || !rawTextSupportsStructuredChoice({ rawMessage, displayLabel, rawValue: optionValue, selected })) {
                continue;
              }
            } else if (rule.tipo === 'number' || rule.tipo === 'numero') {
              if (!rawTextSupportsStructuredNumber(rawMessage, [ruleName, displayLabel])) {
                continue;
              }
            } else if (!containsPhrase(rawMessage, displayLabel) && !containsPhrase(rawMessage, ruleName)) {
              continue;
            }
            value = optionValue;
            break;
          }
        }
      }
      if ((value === undefined || value === null || value === '') && rawMessage && (rule.tipo === 'number' || rule.tipo === 'numero')) {
        value = extractNumberNearLabel(rawMessage, [ruleName, displayLabel]);
      }
      let appliedDefault = false;
      const rawMessageNegatesAttribute =
        rawMessage && labelsForNegation(ruleName, displayLabel).some((label) => containsNegatedPhrase(rawMessage, label));
      if (
        (value === undefined || value === null || value === '') &&
        rule.obligatorio &&
        !rawMessageNegatesAttribute &&
        rule.valor_defecto !== undefined &&
        rule.valor_defecto !== null
      ) {
        value = rule.valor_defecto;
        appliedDefault = true;
      }
      let dimensionFill = false;
      if ((value === undefined || value === null || value === '') && rule.obligatorio) {
        // Dimensiones duplicadas: unidades/alto/ancho llegan como campos top-level,
        // pero PacoPrint también las declara como atributos (ids 1/23/24). Cuando el
        // atributo es obligatorio se rellena desde el valor top-level correspondiente
        // para no exigirlo dos veces al usuario.
        if (normalizedName === 'unidades' && resolvedUnits !== null) {
          value = resolvedUnits;
          dimensionFill = true;
        } else if (normalizedName === 'alto' && resolvedAlto !== null) {
          value = resolvedAlto;
          dimensionFill = true;
        } else if (normalizedName === 'ancho' && resolvedAncho !== null) {
          value = resolvedAncho;
          dimensionFill = true;
        }
      }
      if ((value === undefined || value === null || value === '') && rule.obligatorio) {
        missingFields.push(displayLabel);
        if (rule.tipo === 'select' && attribute?.valores_posibles && attribute.valores_posibles.length > 0) {
          missingChoices.set(
            displayLabel,
            attribute.valores_posibles.map((option) => option.nombre)
          );
        }
        continue;
      }
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (rule.tipo === 'select') {
        if (!attribute) {
          invalidFields.push(displayLabel);
          continue;
        }
        const selected = selectChoice(attribute, value);
        if (!selected) {
          invalidFields.push(displayLabel);
          continue;
        }
        resolvedAttributes[attributeId] = selected.id;
        optionsSummary.push(`${displayLabel} ${selected.nombre}`);
        if (appliedDefault) {
          defaultsApplied.push(displayLabel);
        }
        continue;
      }
      if (rule.tipo === 'number' || rule.tipo === 'numero') {
        const numeric = normalizeOptionalNumber(value);
        if (numeric === null) {
          invalidFields.push(displayLabel);
          continue;
        }
        resolvedAttributes[attributeId] = numeric;
        if (!dimensionFill) {
          optionsSummary.push(`${displayLabel} ${numeric}`);
        }
        if (appliedDefault) {
          defaultsApplied.push(displayLabel);
        }
        continue;
      }
      resolvedAttributes[attributeId] = typeof value === 'boolean' ? value : String(value);
      optionsSummary.push(`${displayLabel} ${String(value)}`);
      if (appliedDefault) {
        defaultsApplied.push(displayLabel);
      }
    }
  }

  return { resolvedAttributes, defaultsApplied, optionsSummary, missingFields, invalidFields, missingChoices };
}

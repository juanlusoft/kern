export interface NumaHrToolMappingConfig {
  time_type_by_label: Record<string, number[]>;
  annual_quota_by_time_type: Record<number, number>;
}

export interface NumaHrRoutingOverride {
  force_capability_key: 'leave.days';
  force_params: {
    year: string;
    time_type_labels: ['asuntos propios'];
  };
}

function normalizeBusinessLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMessage(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function normalizeNumaHrTimeTypeLabels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const labels: string[] = [];
  for (const entry of value) {
    const normalized = normalizeBusinessLabel(entry);
    if (!normalized) {
      return null;
    }
    if (!labels.includes(normalized)) {
      labels.push(normalized);
    }
  }
  return labels.length > 0 ? labels : null;
}

export function resolveNumaHrTimeTypeIds(
  labels: string[] | null,
  mapping: Record<string, number[]> | null | undefined
): number[] | null {
  if (!labels || !mapping) {
    return null;
  }
  const ids = new Set<number>();
  for (const label of labels) {
    const normalizedLabel = normalizeBusinessLabel(label);
    if (!normalizedLabel) {
      return null;
    }
    const mappedIds = mapping[normalizedLabel];
    if (!Array.isArray(mappedIds) || mappedIds.length === 0) {
      return null;
    }
    for (const id of mappedIds) {
      const normalizedId = normalizePositiveInteger(id);
      if (normalizedId === null) {
        return null;
      }
      ids.add(normalizedId);
    }
  }
  return ids.size > 0 ? [...ids] : null;
}

function formatBusinessLabel(label: string): string {
  return label
    .split(' ')
    .map((word, index) => {
      if (word.length === 0) {
        return word;
      }
      return index === 0 ? `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}` : word;
    })
    .join(' ');
}

export function buildNumaHrTimeTypeLabelById(
  labels: string[] | null,
  mapping: Record<string, number[]> | null | undefined
): Record<string, string> | null {
  if (!labels || !mapping) {
    return null;
  }
  const labelById: Record<string, string> = {};
  for (const label of labels) {
    const normalizedLabel = normalizeBusinessLabel(label);
    if (!normalizedLabel) {
      return null;
    }
    const mappedIds = mapping[normalizedLabel];
    if (!Array.isArray(mappedIds) || mappedIds.length === 0) {
      return null;
    }
    for (const id of mappedIds) {
      const normalizedId = normalizePositiveInteger(id);
      if (normalizedId === null) {
        return null;
      }
      const key = String(normalizedId);
      const formattedLabel = formatBusinessLabel(normalizedLabel);
      if (labelById[key] && labelById[key] !== formattedLabel) {
        return null;
      }
      labelById[key] = formattedLabel;
    }
  }
  return Object.keys(labelById).length > 0 ? labelById : null;
}

export function deriveNumaHrRoutingOverride(message: string, now: Date): NumaHrRoutingOverride | null {
  const normalized = normalizeMessage(message);
  if (!/\basuntos propios\b/.test(normalized)) {
    return null;
  }
  if (!/\b(?:el\s+)?ano\s+pasado\b/.test(normalized)) {
    return null;
  }
  return {
    force_capability_key: 'leave.days',
    force_params: {
      year: String(now.getUTCFullYear() - 1),
      time_type_labels: ['asuntos propios']
    }
  };
}

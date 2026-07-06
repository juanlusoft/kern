import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEvidenceRecord, type EvidenceRecord } from '../../contracts/src/index';

export interface EvidenceLedgerOptions {
  filePath?: string | null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function cloneRecord(record: EvidenceRecord): EvidenceRecord {
  return {
    ...record,
    data: structuredClone(record.data)
  };
}

function normalizeRecord(value: unknown): EvidenceRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as EvidenceRecord;
  if (
    typeof record.evidence_id !== 'string' ||
    typeof record.organization_id !== 'string' ||
    typeof record.correlation_id !== 'string' ||
    typeof record.record_type !== 'string' ||
    typeof record.subject !== 'string' ||
    typeof record.created_at !== 'string' ||
    typeof record.sequence !== 'number' ||
    !Number.isInteger(record.sequence) ||
    record.sequence <= 0 ||
    !record.data ||
    typeof record.data !== 'object' ||
    Array.isArray(record.data)
  ) {
    return null;
  }
  return cloneRecord({
    evidence_id: record.evidence_id,
    organization_id: record.organization_id,
    correlation_id: record.correlation_id,
    record_type: record.record_type,
    subject: record.subject,
    created_at: record.created_at,
    sequence: record.sequence,
    data: structuredClone(record.data)
  });
}

function loadRecordsFromFile(filePath: string): EvidenceRecord[] {
  try {
    const content = readFileSync(filePath, 'utf8');
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((record) => normalizeRecord(record)).filter((record): record is EvidenceRecord => Boolean(record));
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { records?: unknown }).records)) {
        return ((parsed as { records: unknown[] }).records ?? [])
          .map((record) => normalizeRecord(record))
          .filter((record): record is EvidenceRecord => Boolean(record));
      }
      const singleRecord = normalizeRecord(parsed);
      if (singleRecord) {
        return [singleRecord];
      }
    } catch {
      // Fall through to JSONL parsing below.
    }

    const records: EvidenceRecord[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmedLine);
        const record = normalizeRecord(parsed);
        if (record) {
          records.push(record);
        } else {
          console.warn('skipped corrupt evidence line at ' + filePath);
        }
      } catch {
        console.warn('skipped corrupt evidence line at ' + filePath);
      }
    }
    return records;
  } catch {
    return [];
  }
}

export class InMemoryEvidenceLedger {
  private readonly filePath: string | null;
  private readonly records: EvidenceRecord[];
  private nextSequence: number;

  constructor(options: EvidenceLedgerOptions = {}) {
    this.filePath = normalizeString(options.filePath ?? null);
    this.records = this.filePath ? loadRecordsFromFile(this.filePath).map((record) => cloneRecord(record)) : [];
    this.nextSequence = this.records.length > 0 ? Math.max(...this.records.map((record) => record.sequence)) + 1 : 1;
  }

  append(record: EvidenceRecord): EvidenceRecord {
    const stored = createEvidenceRecord({
      organization_id: record.organization_id,
      correlation_id: record.correlation_id,
      record_type: record.record_type,
      subject: record.subject,
      data: record.data,
      created_at: record.created_at,
      sequence: this.nextSequence
    });
    this.nextSequence += 1;
    const cloned = this.cloneRecord(stored);
    this.records.push(cloned);
    if (this.filePath) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, JSON.stringify(cloned) + '\n', 'utf8');
    }
    return this.cloneRecord(cloned);
  }

  list(): EvidenceRecord[] {
    return this.records.map((record) => this.cloneRecord(record));
  }

  listByCorrelation(correlation_id: string): EvidenceRecord[] {
    return this.list().filter((record) => record.correlation_id === correlation_id);
  }

  listByOrganization(organization_id: string): EvidenceRecord[] {
    return this.list().filter((record) => record.organization_id === organization_id);
  }

  private cloneRecord(record: EvidenceRecord): EvidenceRecord {
    return cloneRecord(record);
  }
}

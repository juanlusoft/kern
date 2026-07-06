import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createEvidenceRecord, type EvidenceRecord } from '../../contracts/src/index';

export interface EvidenceLedgerOptions {
  filePath?: string | null;
}

interface EvidenceLedgerSnapshot {
  version: 1;
  nextSequence: number;
  records: EvidenceRecord[];
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

function snapshotFromJSON(value: unknown): EvidenceLedgerSnapshot {
  const rawRecords = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { records?: unknown }).records)
      ? ((value as { records: unknown[] }).records ?? [])
      : [];
  const records = rawRecords.map((record) => normalizeRecord(record)).filter((record): record is EvidenceRecord => Boolean(record));
  const nextSequence = records.length > 0 ? Math.max(...records.map((record) => record.sequence)) + 1 : 1;
  return { version: 1, nextSequence, records };
}

function loadSnapshot(filePath: string): EvidenceLedgerSnapshot {
  try {
    return snapshotFromJSON(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return { version: 1, nextSequence: 1, records: [] };
  }
}

function saveSnapshot(filePath: string, snapshot: EvidenceLedgerSnapshot): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
}

export class InMemoryEvidenceLedger {
  private readonly filePath: string | null;
  private readonly records: EvidenceRecord[];
  private nextSequence: number;

  constructor(options: EvidenceLedgerOptions = {}) {
    this.filePath = normalizeString(options.filePath ?? null);
    const snapshot = this.filePath ? loadSnapshot(this.filePath) : { version: 1 as const, nextSequence: 1, records: [] as EvidenceRecord[] };
    this.records = snapshot.records.map((record) => cloneRecord(record));
    this.nextSequence = snapshot.nextSequence;
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
      saveSnapshot(this.filePath, {
        version: 1,
        nextSequence: this.nextSequence,
        records: this.records.map((item) => this.cloneRecord(item))
      });
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

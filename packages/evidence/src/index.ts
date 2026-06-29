import { createEvidenceRecord, type EvidenceRecord } from '../../contracts/src/index';

export class InMemoryEvidenceLedger {
  private readonly records: EvidenceRecord[] = [];

  append(record: EvidenceRecord): EvidenceRecord {
    const stored = createEvidenceRecord({
      organization_id: record.organization_id,
      correlation_id: record.correlation_id,
      record_type: record.record_type,
      subject: record.subject,
      data: record.data,
      created_at: record.created_at
    });
    this.records.push(stored);
    return stored;
  }

  list(): EvidenceRecord[] {
    return this.records.map((record) => ({
      ...record,
      data: { ...record.data }
    }));
  }

  listByCorrelation(correlation_id: string): EvidenceRecord[] {
    return this.list().filter((record) => record.correlation_id === correlation_id);
  }

  listByOrganization(organization_id: string): EvidenceRecord[] {
    return this.list().filter((record) => record.organization_id === organization_id);
  }
}

export interface HoldedReadRoutingOverride {
  force_capability_key: 'mock.resource.read';
  force_params: {
    resource_type: 'invoice' | 'estimate';
    payment_status?: 'pending' | 'paid' | 'overdue';
    customer_id?: string;
    year?: string;
    limit?: number;
  };
}

function normalizeMessage(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function extractCustomerAfterDe(original: string, normalized: string, marker: RegExp): string | null {
  const match = marker.exec(normalized);
  if (!match) {
    return null;
  }
  const suffix = original
    .slice(match.index + match[0].length)
    .replace(/[?.!]+$/g, '')
    .trim();
  return suffix.length > 0 ? suffix : null;
}

function extractYear(normalized: string): string | null {
  const match = /\b(20\d{2}|19\d{2})\b/.exec(normalized);
  return match?.[1] ?? null;
}

function extractDocumentCode(message: string): { resource_type: 'invoice' | 'estimate'; estimate_id: string } | null {
  const match = /\b([PF]\d{2}\/\d{3,})\b/i.exec(message);
  const code = match?.[1]?.toUpperCase() ?? null;
  if (!code) {
    return null;
  }
  return {
    resource_type: code.startsWith('F') ? 'invoice' : 'estimate',
    estimate_id: code
  };
}

function extractLatestLimit(normalized: string): number | null {
  const match = /\b(?:las\s+)?([1-9]\d*)\s+ultimas?\b/.exec(normalized);
  if (!match?.[1]) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20 ? parsed : null;
}

function hasInvoiceCount(normalized: string): boolean {
  return /\b[1-9]\d*\s+facturas?\b/.test(normalized);
}

function hasInvoice(normalized: string): boolean {
  return /\bfacturas?\b/.test(normalized);
}

function hasEstimate(normalized: string): boolean {
  return /\b(?:presupuestos?|ofertas?)\b/.test(normalized);
}

function invoiceStatus(normalized: string): 'pending' | 'paid' | 'overdue' | null {
  if (/\b(?:pendientes?|sin pagar|impagadas?)\b/.test(normalized)) {
    return 'pending';
  }
  if (/\b(?:pagadas?|cobradas?)\b/.test(normalized)) {
    return 'paid';
  }
  if (/\b(?:vencidas?|caducadas?)\b/.test(normalized)) {
    return 'overdue';
  }
  return null;
}

export function deriveHoldedReadRoutingOverride(message: string): HoldedReadRoutingOverride | null {
  const original = message.replace(/\s+/g, ' ').trim();
  const normalized = normalizeMessage(message);
  if (!original || !normalized) {
    return null;
  }

  const documentCode = extractDocumentCode(original);
  if (documentCode) {
    return {
      force_capability_key: 'mock.resource.read',
      force_params: documentCode
    };
  }

  if (hasInvoice(normalized)) {
    const payment_status = invoiceStatus(normalized);
    const year = extractYear(normalized);
    const limit = extractLatestLimit(normalized);
    if (payment_status && (limit || hasInvoiceCount(normalized))) {
      return null;
    }
    const latestCustomer = extractCustomerAfterDe(original, normalized, /\b(?:ultima|ultimo|ultimas|ultimos)\s+facturas?\s+de\s+/);
    const statusCustomer = payment_status
      ? extractCustomerAfterDe(original, normalized, /\bfacturas?\s+(?:pendientes?|sin pagar|impagadas?|pagadas?|cobradas?|vencidas?|caducadas?)\s+de\s+/)
      : null;
    const yearCustomer = year ? extractCustomerAfterDe(original, normalized, /\bfacturas?\s+de\s+(?:20\d{2}|19\d{2})\s+de\s+/) : null;
    const customer_id = latestCustomer ?? statusCustomer ?? yearCustomer ?? undefined;

    if (!payment_status && !year && !customer_id) {
      return null;
    }

    return {
      force_capability_key: 'mock.resource.read',
      force_params: {
        resource_type: 'invoice',
        ...(payment_status ? { payment_status } : {}),
        ...(year ? { year } : {}),
        ...(customer_id ? { customer_id } : {}),
        ...(limit ? { limit } : {})
      }
    };
  }

  if (hasEstimate(normalized)) {
    const customer_id = extractCustomerAfterDe(original, normalized, /\b(?:ultima|ultimo|ultimas|ultimos)\s+(?:presupuestos?|ofertas?)\s+de\s+/);
    const year = extractYear(normalized);
    if (!customer_id && !year) {
      return null;
    }
    return {
      force_capability_key: 'mock.resource.read',
      force_params: {
        resource_type: 'estimate',
        ...(customer_id ? { customer_id } : {}),
        ...(year ? { year } : {})
      }
    };
  }

  return null;
}

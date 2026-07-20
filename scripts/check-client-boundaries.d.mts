/** Tipos publicos del checker de fronteras de cliente (ADR-0006, seccion 7). */

export type ClientToken = string;

export interface ScannedSourceFile {
  filePath: string;
  content: string;
}

export interface ClientReferenceMatch {
  client: ClientToken;
  text: string;
  line: number;
}

export interface ClientBoundaryViolation {
  path: string;
  packageRoot: string | null;
  clients: ClientToken[];
  occurrences: number;
  matches: ClientReferenceMatch[];
}

export interface ClientBoundaryAllowlistEntry {
  path: string;
  clients: ClientToken[];
  allowed_occurrences: number;
  category: string;
  reason: string;
  target: string;
  retire_with: string;
  owner: string;
  recorded_on: string;
}

export interface ClientBoundaryAllowlist {
  budget: { max_entries: number; max_occurrences: number };
  entries: ClientBoundaryAllowlistEntry[];
}

export type ClientBoundaryProblemKind =
  | 'new_violation'
  | 'grown_violation'
  | 'shrunk_violation'
  | 'client_mismatch'
  | 'stale_entry'
  | 'missing_file'
  | 'budget_exceeded'
  | 'allowlist_growth';

export interface ClientBoundaryProblem {
  kind: ClientBoundaryProblemKind;
  path: string;
  detail: string;
}

export interface ClientBoundaryResult {
  violations: ClientBoundaryViolation[];
  problems: ClientBoundaryProblem[];
  passed: boolean;
  stats: {
    contaminated_files: number;
    total_occurrences: number;
    allowlist_entries: number;
    declared_occurrences: number;
  };
}

export declare const ALLOWLIST_PATH: string;
export declare const CLIENT_TOKENS: ClientToken[];

export declare function packageRootFromPath(filePath: string): string | null;
export declare function clientsOwnedByPackage(packageRoot: string | null): ClientToken[];
export declare function isScannedFile(filePath: string): boolean;
export declare function loadScannableSourceFiles(rootDir?: string): ScannedSourceFile[];
export declare function scanClientReferences(files: ScannedSourceFile[]): ClientBoundaryViolation[];
export declare function loadAllowlist(allowlistPath?: string): ClientBoundaryAllowlist;
export declare function loadBaselineAllowlist(currentAllowlist?: ClientBoundaryAllowlist): ClientBoundaryAllowlist | null;
export declare function evaluateClientBoundaries(options?: {
  rootDir?: string;
  files?: ScannedSourceFile[];
  allowlist?: Partial<ClientBoundaryAllowlist>;
  baselineAllowlist?: Partial<ClientBoundaryAllowlist> | null;
}): ClientBoundaryResult;
export declare function buildClientBoundaryReport(result: ClientBoundaryResult): string;

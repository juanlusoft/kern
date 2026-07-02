import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);
const INTERNAL_PACKAGE_PREFIXES = ['packages/'];

const GOVERNED_PACKAGES = new Set([
  'packages/contracts',
  'packages/compliance-tests',
  'packages/external-read-adapters',
  'packages/core',
  'packages/identity',
  'packages/policy',
  'packages/bindings',
  'packages/evidence',
  'packages/turns',
  'packages/capabilities',
  'packages/workflows',
  'packages/orchestration'
]);

const PROVIDER_PREFIXES = ['packages/adapters/', 'packages/channels/', 'packages/orchestrators/'];

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function walkSourceFiles(rootDir = PACKAGE_ROOT) {
  const files = [];

  function visit(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        visit(path.join(currentDir, entry.name));
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relative = toPosixPath(path.relative(REPO_ROOT, fullPath));
      if (!relative.startsWith('packages/')) {
        continue;
      }
      if (!relative.includes('/src/')) {
        continue;
      }
      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        continue;
      }
      files.push(fullPath);
    }
  }

  visit(rootDir);
  return files.sort((left, right) => toPosixPath(path.relative(REPO_ROOT, left)).localeCompare(toPosixPath(path.relative(REPO_ROOT, right))));
}

function packageRootFromPath(filePath) {
  const relative = toPosixPath(path.relative(REPO_ROOT, filePath));
  if (!relative.startsWith('packages/')) {
    return null;
  }

  const parts = relative.split('/');
  if (parts.length < 2) {
    return null;
  }

  if (parts[1] === 'adapters' || parts[1] === 'channels' || parts[1] === 'orchestrators') {
    return parts.length >= 3 ? `packages/${parts[1]}/${parts[2]}` : null;
  }

  return `packages/${parts[1]}`;
}

function packageCategory(packageRoot) {
  if (!packageRoot) {
    return null;
  }

  if (packageRoot === 'packages/contracts') {
    return 'contracts';
  }
  if (packageRoot === 'packages/runtime') {
    return 'runtime';
  }
  if (GOVERNED_PACKAGES.has(packageRoot)) {
    return 'governed';
  }
  if (PROVIDER_PREFIXES.some((prefix) => packageRoot.startsWith(prefix))) {
    return 'provider';
  }

  return null;
}

function resolveInternalTargetPackageRoot(fromFile, specifier) {
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFile), specifier);
    return packageRootFromPath(resolved);
  }

  if (specifier.startsWith('packages/')) {
    const normalized = toPosixPath(specifier);
    const match = normalized.match(/^packages\/(?:adapters|channels|orchestrators)\/[^/]+/);
    if (match) {
      return match[0];
    }
    const direct = normalized.match(/^packages\/[^/]+/);
    return direct ? direct[0] : null;
  }

  const bare = {
    contracts: 'packages/contracts',
    core: 'packages/core',
    identity: 'packages/identity',
    policy: 'packages/policy',
    bindings: 'packages/bindings',
    evidence: 'packages/evidence',
    turns: 'packages/turns',
    capabilities: 'packages/capabilities',
    workflows: 'packages/workflows',
    orchestration: 'packages/orchestration',
    'external-read-adapters': 'packages/external-read-adapters'
  };
  return bare[specifier] ?? null;
}

function extractImportRecords(filePath, sourceText) {
  const records = [];
  const patterns = [
    /\bimport(?:\s+type)?\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport(?:\s+type)?\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of sourceText.matchAll(pattern)) {
      const specifier = match[1];
      const start = match.index ?? 0;
      const line = sourceText.slice(0, start).split('\n').length;
      records.push({ specifier, line });
    }
  }

  return records;
}

function classifyImport(sourcePackageRoot, targetPackageRoot) {
  if (!sourcePackageRoot || !targetPackageRoot) {
    return null;
  }
  if (sourcePackageRoot === targetPackageRoot) {
    return null;
  }

  const sourceCategory = packageCategory(sourcePackageRoot);
  const targetCategory = packageCategory(targetPackageRoot);

  if (!sourceCategory || !targetCategory) {
    return null;
  }

  if (sourceCategory === 'runtime') {
    return null;
  }

  if (sourceCategory === 'contracts') {
    return {
      severity: 'error',
      reason: 'contracts package cannot import other internal packages'
    };
  }

  if (sourceCategory === 'governed') {
    if (targetCategory === 'provider' || targetCategory === 'runtime') {
      return {
        severity: 'error',
        reason: 'governed package cannot import provider package'
      };
    }
    return null;
  }

  if (sourceCategory === 'provider') {
    if (targetCategory === 'provider') {
      return {
        severity: 'error',
        reason: 'provider package cannot import another provider package'
      };
    }
    if (targetCategory === 'runtime') {
      return {
        severity: 'error',
        reason: 'provider package cannot import runtime package'
      };
    }
    return null;
  }

  return null;
}

export function scanBoundaryViolations(files) {
  const violations = [];

  for (const file of files) {
    const sourcePackageRoot = packageRootFromPath(file.filePath);
    const sourceCategory = packageCategory(sourcePackageRoot);
    if (!sourceCategory) {
      continue;
    }

    const imports = extractImportRecords(file.filePath, file.content);
    for (const record of imports) {
      const targetPackageRoot = resolveInternalTargetPackageRoot(file.filePath, record.specifier);
      if (!targetPackageRoot) {
        continue;
      }

      const targetCategory = packageCategory(targetPackageRoot);
      if (!targetCategory) {
        continue;
      }

      const violation = classifyImport(sourcePackageRoot, targetPackageRoot);
      if (violation) {
        violations.push({
          filePath: toPosixPath(path.relative(REPO_ROOT, file.filePath)),
          line: record.line,
          specifier: record.specifier,
          targetPackageRoot,
          reason: violation.reason
        });
      }
    }
  }

  return violations;
}

export function buildBoundaryReport(violations) {
  if (violations.length === 0) {
    return 'Module boundary check passed.';
  }

  const lines = ['Module boundary check failed.', ''];
  for (const violation of violations) {
    lines.push(`${violation.filePath}:${violation.line}`);
    lines.push(`  imports ${violation.targetPackageRoot}`);
    lines.push(`  reason: ${violation.reason}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function loadWorkspaceSourceFiles(rootDir = REPO_ROOT) {
  const files = walkSourceFiles(path.join(rootDir, 'packages'));
  return files.map((filePath) => ({
    filePath,
    content: readFileSync(filePath, 'utf8')
  }));
}

export function checkBoundaries({ rootDir = REPO_ROOT, files } = {}) {
  const records = files ?? loadWorkspaceSourceFiles(rootDir);
  const violations = scanBoundaryViolations(records);
  return {
    violations,
    passed: violations.length === 0,
    report: buildBoundaryReport(violations)
  };
}

function main() {
  const result = checkBoundaries();
  console.log(result.report);
  if (!result.passed) {
    process.exitCode = 1;
  }
}

if (process.argv[1]) {
  const invokedPath = path.resolve(process.argv[1]);
  if (fileURLToPath(import.meta.url) === invokedPath) {
    main();
  }
}


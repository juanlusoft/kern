/**
 * Client boundary checker (ADR-0006, seccion 7: "Core no menciona empresas").
 *
 * Busqueda estatica de nombres de cliente en los paquetes comunes de Kern:
 * Core, paquetes gobernados, runtime e integraciones reutilizables.
 *
 * Un paquete comun no puede nombrar una empresa concreta ni en identificadores,
 * ni en rutas de import, ni en prompts embebidos, ni en constantes de configuracion,
 * ni en comentarios. Solo pueden nombrar a una empresa los paquetes cuya propia ruta
 * declara esa empresa (por ejemplo `packages/adapters/pacoprint-catalog` o el futuro
 * `packages/customer-modules/numa-hr`), y unicamente a esa empresa.
 *
 * Las violaciones que ya existian al introducir este check estan registradas en
 * `scripts/client-boundary-allowlist.json` como deuda tecnica explicita y decreciente.
 *
 * Relacion con `scripts/check-boundaries.mjs`:
 * son dos invariantes distintos y complementarios de ADR-0006 seccion 7.
 * - `check-boundaries.mjs` verifica el GRAFO DE IMPORTS ("Core no importa modulos de
 *   empresa") y por diseno exime al paquete `runtime`, que es el punto de composicion.
 * - este check verifica las MENCIONES ("Core no menciona empresas"), no mira imports y
 *   NO exime a `runtime`: precisamente `packages/runtime/src/slice.ts` es hoy el mayor
 *   foco de mezcla y debe quedar contabilizado como deuda.
 * Se mantienen separados porque el modelo de excepciones es distinto: el checker de
 * imports debe estar siempre en cero, mientras que este arrastra una allowlist con fecha
 * y responsable mientras dura la migracion a modulos de empresa.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages');

export const ALLOWLIST_PATH = path.join(SCRIPT_DIR, 'client-boundary-allowlist.json');

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/**
 * Empresas conocidas de Kern, declaradas por palabras para poder derivar sus grafias.
 * Dar de alta una empresa nueva incluye anadirla aqui.
 */
const CLIENTS = [
  { client: 'pacoprint', words: ['paco', 'print'] },
  { client: 'proinsur', words: ['proinsur'] },
  { client: 'numa', words: ['numa'] },
  { client: 'mipc', words: ['mipc'] }
];

export const CLIENT_TOKENS = CLIENTS.map((entry) => entry.client);

/**
 * Paquetes que pueden nombrar clientes sin ser modulos de empresa:
 * el paquete de tests de cumplimiento verifica comportamiento de todas las instalaciones
 * y ADR-0006 seccion 7 contempla explicitamente la allowlist de tests.
 */
const SCAN_EXEMPT_PACKAGE_ROOTS = new Set(['packages/compliance-tests']);

/** Familias de paquetes con un nivel extra de anidamiento por proveedor o por empresa. */
const NESTED_PACKAGE_FAMILIES = new Set(['adapters', 'channels', 'orchestrators', 'customer-modules']);

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Grafias reales de un nombre de cliente en codigo:
 * `pacoprint`, `PACOPRINT`, `Pacoprint`, `PacoPrint`, `pacoPrint`.
 */
function spellingsFor(words) {
  const lower = words.join('');
  const pascal = words.map(capitalize).join('');
  const camel = words[0] + words.slice(1).map(capitalize).join('');
  return [...new Set([lower, lower.toUpperCase(), capitalize(lower), pascal, camel])];
}

/**
 * Busca la grafia como unidad lexica, nunca como subcadena suelta, para evitar falsos
 * positivos (un test con falsos positivos se acaba desactivando).
 *
 * Coincide con `numa`, `numa_hr`, `kern-numa`, `NUMA_API_KEY`, `numa.hr.read`,
 * `createNumaHrCapabilitySet`, `pacoPrintFetch`, `PACOPRINT_API_TOKEN`.
 * No coincide dentro de otra palabra (`pneuma`, `numeral`, `numatic`).
 *
 * El match es sensible a mayusculas a proposito: con la bandera `i`, `[a-z]` tambien
 * casaria mayusculas y los bordes camelCase dejarian de detectarse.
 */
function buildClientPattern(words) {
  const alternatives = spellingsFor(words).map((spelling) => {
    const escaped = escapeRegExp(spelling);
    // Las grafias que empiezan en minuscula solo valen tras un borde no alfabetico.
    // Las que empiezan en mayuscula valen ademas dentro de un identificador camelCase.
    const prefix = /^[a-z]/.test(spelling) ? '(?<![A-Za-z])' : '(?<![A-Z])';
    return `${prefix}${escaped}(?![a-z])`;
  });
  return new RegExp(alternatives.join('|'), 'g');
}

const TOKEN_PATTERNS = CLIENTS.map((entry) => ({
  token: entry.client,
  pattern: buildClientPattern(entry.words),
  words: entry.words
}));

export function packageRootFromPath(filePath) {
  const relative = toPosixPath(path.relative(REPO_ROOT, filePath));
  if (!relative.startsWith('packages/')) {
    return null;
  }

  const parts = relative.split('/');
  if (parts.length < 3) {
    return null;
  }

  if (NESTED_PACKAGE_FAMILIES.has(parts[1])) {
    return `packages/${parts[1]}/${parts[2]}`;
  }

  return `packages/${parts[1]}`;
}

/**
 * Clientes que un paquete puede nombrar legitimamente: solo aquellos que su propia ruta
 * declara. `packages/adapters/numa-postgres` puede decir Numa, pero no PacoPrint.
 */
export function clientsOwnedByPackage(packageRoot) {
  if (!packageRoot) {
    return [];
  }
  const lowered = packageRoot.toLowerCase();
  return TOKEN_PATTERNS.filter(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(lowered);
  }).map(({ token }) => token);
}

export function isScannedFile(filePath) {
  const relative = toPosixPath(path.relative(REPO_ROOT, filePath));
  if (!relative.startsWith('packages/')) {
    return false;
  }
  if (!relative.includes('/src/')) {
    return false;
  }
  if (!SOURCE_EXTENSIONS.includes(path.extname(relative))) {
    return false;
  }
  // Los tests de comportamiento de un cliente pueden nombrarlo (ADR-0006, 2.3).
  if (/\.test\.[a-z]+$/.test(relative) || relative.includes('/test/')) {
    return false;
  }
  const packageRoot = packageRootFromPath(filePath);
  if (!packageRoot || SCAN_EXEMPT_PACKAGE_ROOTS.has(packageRoot)) {
    return false;
  }
  return true;
}

function walkSourceFiles(rootDir = PACKAGE_ROOT) {
  const files = [];

  function visit(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(fullPath);
        }
        continue;
      }
      if (isScannedFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  visit(rootDir);
  return files.sort((left, right) => left.localeCompare(right));
}

export function loadScannableSourceFiles(rootDir = REPO_ROOT) {
  return walkSourceFiles(path.join(rootDir, 'packages')).map((filePath) => ({
    filePath: toPosixPath(path.relative(rootDir, filePath)),
    content: readFileSync(filePath, 'utf8')
  }));
}

/** Devuelve una violacion por fichero contaminado, con el detalle de ocurrencias. */
export function scanClientReferences(files) {
  const violations = [];

  for (const file of files) {
    const packageRoot = packageRootFromPath(path.resolve(REPO_ROOT, file.filePath));
    const owned = new Set(clientsOwnedByPackage(packageRoot));
    const matches = [];

    for (const { token, pattern } of TOKEN_PATTERNS) {
      if (owned.has(token)) {
        continue;
      }
      pattern.lastIndex = 0;
      for (const match of file.content.matchAll(pattern)) {
        const start = match.index ?? 0;
        matches.push({
          client: token,
          text: match[0],
          line: file.content.slice(0, start).split('\n').length
        });
      }
    }

    if (matches.length > 0) {
      matches.sort((left, right) => left.line - right.line || left.text.localeCompare(right.text));
      violations.push({
        path: toPosixPath(file.filePath),
        packageRoot,
        clients: [...new Set(matches.map((match) => match.client))].sort(),
        occurrences: matches.length,
        matches
      });
    }
  }

  return violations.sort((left, right) => left.path.localeCompare(right.path));
}

export function loadAllowlist(allowlistPath = ALLOWLIST_PATH) {
  if (!existsSync(allowlistPath)) {
    return { budget: { max_entries: 0, max_occurrences: 0 }, entries: [] };
  }
  return JSON.parse(readFileSync(allowlistPath, 'utf8'));
}

/**
 * Compara el estado real con la allowlist. Devuelve los problemas que deben romper el build.
 *
 * - `new_violation`: fichero comun contaminado que no esta en la allowlist.
 * - `grown_violation`: fichero allowlisted con mas ocurrencias de las registradas.
 * - `stale_entry`: entrada ya limpia; hay que borrarla y bajar el contador.
 * - `missing_file`: entrada que apunta a un fichero inexistente.
 * - `budget_exceeded`: la allowlist ha crecido por encima del presupuesto declarado.
 */
export function evaluateClientBoundaries({ rootDir = REPO_ROOT, files, allowlist } = {}) {
  const records = files ?? loadScannableSourceFiles(rootDir);
  const list = allowlist ?? loadAllowlist();
  const entries = list.entries ?? [];
  const budget = list.budget ?? { max_entries: 0, max_occurrences: 0 };

  const violations = scanClientReferences(records);
  const byPath = new Map(violations.map((violation) => [violation.path, violation]));
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const problems = [];

  for (const violation of violations) {
    const entry = entryByPath.get(violation.path);
    if (!entry) {
      problems.push({
        kind: 'new_violation',
        path: violation.path,
        detail: `menciona ${violation.clients.join(', ')} en un paquete comun (${violation.occurrences} ocurrencias, primera en linea ${violation.matches[0].line})`
      });
      continue;
    }
    if (violation.occurrences > (entry.allowed_occurrences ?? 0)) {
      problems.push({
        kind: 'grown_violation',
        path: violation.path,
        detail: `la deuda ha crecido: ${violation.occurrences} ocurrencias frente a ${entry.allowed_occurrences} registradas`
      });
    }
  }

  for (const entry of entries) {
    if (!existsSync(path.join(rootDir, entry.path))) {
      problems.push({
        kind: 'missing_file',
        path: entry.path,
        detail: 'la entrada de la allowlist apunta a un fichero que ya no existe'
      });
      continue;
    }
    if (!byPath.has(entry.path)) {
      problems.push({
        kind: 'stale_entry',
        path: entry.path,
        detail: 'el fichero ya esta limpio: borra la entrada y baja budget.max_entries'
      });
    }
  }

  if (entries.length !== budget.max_entries) {
    problems.push({
      kind: 'budget_exceeded',
      path: 'scripts/client-boundary-allowlist.json',
      detail: `budget.max_entries es ${budget.max_entries} y hay ${entries.length} entradas; este numero solo puede bajar`
    });
  }

  const declaredOccurrences = entries.reduce((total, entry) => total + (entry.allowed_occurrences ?? 0), 0);
  if (declaredOccurrences > budget.max_occurrences) {
    problems.push({
      kind: 'budget_exceeded',
      path: 'scripts/client-boundary-allowlist.json',
      detail: `las ocurrencias declaradas (${declaredOccurrences}) superan budget.max_occurrences (${budget.max_occurrences}); este numero solo puede bajar`
    });
  }

  return {
    violations,
    problems,
    passed: problems.length === 0,
    stats: {
      contaminated_files: violations.length,
      total_occurrences: violations.reduce((total, violation) => total + violation.occurrences, 0),
      allowlist_entries: entries.length,
      declared_occurrences: declaredOccurrences
    }
  };
}

export function buildClientBoundaryReport(result) {
  if (result.passed) {
    return [
      'Client boundary check passed.',
      `Deuda registrada: ${result.stats.allowlist_entries} ficheros / ${result.stats.total_occurrences} menciones de cliente en paquetes comunes.`
    ].join('\n');
  }

  const lines = ['Client boundary check failed (ADR-0006).', ''];
  for (const problem of result.problems) {
    lines.push(`[${problem.kind}] ${problem.path}`);
    lines.push(`  ${problem.detail}`);
    lines.push('');
  }
  lines.push('Los paquetes comunes de Kern no pueden nombrar empresas concretas.');
  lines.push('Mueve el comportamiento a un modulo de empresa (ADR-0006, 3.2) en vez de ampliar la allowlist.');
  return lines.join('\n').trimEnd();
}

function main() {
  const result = evaluateClientBoundaries();
  console.log(buildClientBoundaryReport(result));
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

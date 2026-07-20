import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_TOKENS,
  buildClientBoundaryReport,
  clientsOwnedByPackage,
  evaluateClientBoundaries,
  isScannedFile,
  loadAllowlist,
  loadScannableSourceFiles,
  scanClientReferences
} from '../../../scripts/check-client-boundaries.mjs';

/**
 * M13 — frontera Core / cliente (ADR-0006 seccion 7).
 *
 * Un paquete comun de Kern (Core, gobernados, runtime e integraciones reutilizables)
 * no puede nombrar una empresa concreta. La deuda existente vive en
 * scripts/client-boundary-allowlist.json y solo puede decrecer.
 */

const allowlist = loadAllowlist();

test('M13 the repository satisfies the client boundary within the current allowlist', () => {
  const result = evaluateClientBoundaries();
  assert.equal(result.passed, true, buildClientBoundaryReport(result));
});

test('M13 a new client reference in a common package fails the check', () => {
  const files = loadScannableSourceFiles();
  const polluted = files.map((file) =>
    file.filePath === 'packages/turns/src/index.ts'
      ? { ...file, content: `${file.content}\nconst pacoPrintQuoteRule = 'PacoPrint';\n` }
      : file
  );

  assert.equal(
    polluted.some((file) => file.filePath === 'packages/turns/src/index.ts'),
    true,
    'the fixture file must exist for this test to be meaningful'
  );

  const result = evaluateClientBoundaries({ files: polluted, allowlist });

  assert.equal(result.passed, false);
  assert.equal(
    result.problems.some(
      (problem) =>
        problem.kind === 'new_violation' && problem.path === 'packages/turns/src/index.ts'
    ),
    true,
    buildClientBoundaryReport(result)
  );
});

test('M13 growing an already allowlisted file fails the check', () => {
  const entry = allowlist.entries[0];
  const files = loadScannableSourceFiles();
  const polluted = files.map((file) =>
    file.filePath === entry.path
      ? { ...file, content: `${file.content}\n// numa numa numa\n` }
      : file
  );

  const result = evaluateClientBoundaries({ files: polluted, allowlist });

  assert.equal(
    result.problems.some(
      (problem) =>
        problem.kind === 'grown_violation' && problem.path === entry.path
    ),
    true,
    buildClientBoundaryReport(result)
  );
});

test('M13 a cleaned file must be removed from the allowlist', () => {
  const entry = allowlist.entries[0];
  const files = loadScannableSourceFiles().filter((file) => file.filePath !== entry.path);

  const result = evaluateClientBoundaries({ files, allowlist });

  assert.equal(
    result.problems.some(
      (problem) =>
        problem.kind === 'stale_entry' && problem.path === entry.path
    ),
    true,
    buildClientBoundaryReport(result)
  );
});

test('M13 the allowlist can only shrink', () => {
  const declared = allowlist.entries.reduce((total, entry) => total + entry.allowed_occurrences, 0);

  assert.equal(
    allowlist.entries.length,
    allowlist.budget.max_entries,
    'budget.max_entries debe coincidir con el numero de entradas y solo puede bajar'
  );
  assert.ok(
    declared <= allowlist.budget.max_occurrences,
    `las ocurrencias declaradas (${declared}) superan budget.max_occurrences (${allowlist.budget.max_occurrences})`
  );

  const extended = {
    ...allowlist,
    entries: [
      ...allowlist.entries,
      {
        path: 'packages/turns/src/index.ts',
        clients: ['numa'],
        allowed_occurrences: 1,
        category: 'domain-workflow',
        reason: 'entrada de prueba',
        target: 'packages/customer-modules/numa-hr',
        retire_with: 'never',
        owner: 'test',
        recorded_on: '2026-07-20'
      }
    ]
  };
  const result = evaluateClientBoundaries({ allowlist: extended });

  assert.equal(
    result.problems.some((problem) => problem.kind === 'budget_exceeded'),
    true,
    'anadir una entrada sin tocar el presupuesto debe romper el check'
  );
});

test('M13 every allowlist entry documents its debt and its destination', () => {
  for (const entry of allowlist.entries) {
    assert.ok(entry.path.startsWith('packages/'), `${entry.path} debe ser una ruta de paquete`);
    assert.ok(entry.clients.length > 0, `${entry.path} debe declarar los clientes filtrados`);
    for (const client of entry.clients) {
      assert.ok(CLIENT_TOKENS.includes(client), `${entry.path} declara un cliente desconocido: ${client}`);
    }
    assert.ok(entry.allowed_occurrences > 0, `${entry.path} debe declarar ocurrencias`);
    assert.ok(typeof entry.category === 'string' && entry.category.length > 0, `${entry.path} necesita categoria`);
    assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0, `${entry.path} necesita motivo`);
    assert.ok(typeof entry.target === 'string' && entry.target.length > 0, `${entry.path} necesita destino ADR-0006`);
    assert.ok(typeof entry.retire_with === 'string' && entry.retire_with.length > 0, `${entry.path} necesita hito de retirada`);
    assert.ok(typeof entry.owner === 'string' && entry.owner.length > 0, `${entry.path} necesita responsable`);
    assert.match(entry.recorded_on, /^\d{4}-\d{2}-\d{2}$/, `${entry.path} necesita fecha de registro`);
  }
});

test('M13 a package can only name the client declared in its own path', () => {
  assert.deepEqual(clientsOwnedByPackage('packages/adapters/pacoprint-catalog'), ['pacoprint']);
  assert.deepEqual(clientsOwnedByPackage('packages/adapters/numa-postgres'), ['numa']);
  assert.deepEqual(clientsOwnedByPackage('packages/customer-modules/numa-hr'), ['numa']);
  assert.deepEqual(clientsOwnedByPackage('packages/core'), []);
  assert.deepEqual(clientsOwnedByPackage('packages/contracts'), []);
  assert.deepEqual(clientsOwnedByPackage('packages/channels/telegram'), []);

  const foreign = scanClientReferences([
    {
      filePath: 'packages/adapters/numa-postgres/src/index.ts',
      content: 'const rule = "PacoPrint pricing";'
    }
  ]);

  assert.equal(foreign.length, 1, 'un modulo de empresa no puede nombrar a otra empresa');
  assert.deepEqual(foreign[0].clients, ['pacoprint']);
});

test('M13 the scan matches lexical units and ignores unrelated words', () => {
  const violations = scanClientReferences([
    {
      filePath: 'packages/core/src/index.ts',
      content: [
        'const numa_hr = 1;',
        'const kernNuma = 2;',
        'const NUMA_API_KEY = 3;',
        'const pacoPrintFetch = 4;',
        'const PACOPRINT_API_TOKEN = 5;',
        'import x from "../../adapters/pacoprint-catalog/src/index";'
      ].join('\n')
    }
  ]);

  assert.equal(violations[0].occurrences, 6);

  const clean = scanClientReferences([
    {
      filePath: 'packages/core/src/index.ts',
      content: 'const pneuma = enumerate(numeral, "numatic");'
    }
  ]);

  assert.equal(clean.length, 0, 'palabras no relacionadas no deben generar falsos positivos');
});

test('M13 the scan covers sources but not tests or the compliance package', () => {
  assert.equal(isScannedFile('packages/core/src/index.ts'), true);
  assert.equal(isScannedFile('packages/channels/telegram/src/index.ts'), true);
  assert.equal(isScannedFile('packages/compliance-tests/src/run-tests.ts'), false);
  assert.equal(isScannedFile('packages/compliance-tests/test/m13-client-boundary.test.ts'), false);
  assert.equal(isScannedFile('packages/orchestration/test/anything.test.ts'), false);
  assert.equal(isScannedFile('packages/core/src/README.md'), false);
});

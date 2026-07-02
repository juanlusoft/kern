import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoundaryReport, checkBoundaries, scanBoundaryViolations } from './check-boundaries.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeFile(filePath, content) {
  return { filePath, content };
}

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

test('contracts can be imported by governed packages and same-layer imports are allowed', () => {
  const result = checkBoundaries({
    files: [
      makeFile(
        repoPath('packages', 'core', 'src', 'index.ts'),
        "import { createPolicyDecision } from '../../contracts/src/index';\nimport { resolveIdentityContext } from '../../identity/src/index';\n"
      ),
      makeFile(
        repoPath('packages', 'identity', 'src', 'index.ts'),
        "import { createPolicyDecision } from '../../contracts/src/index';\n"
      )
    ]
  });

  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
});

test('governed packages cannot import providers or runtime', () => {
  const result = checkBoundaries({
    files: [
      makeFile(
        repoPath('packages', 'core', 'src', 'index.ts'),
        "import { createHoldedReadAdapter } from '../../adapters/holded/src/index';\nimport { createTelegramChannelAdapter } from '../../channels/telegram/src/index';\nimport { createQwenOrchestrator } from '../../orchestrators/qwen/src/index';\nimport { startInstallationRuntime } from '../../runtime/src/index';\n"
      )
    ]
  });

  assert.equal(result.passed, false);
  assert.equal(result.violations.length, 4);
  assert.match(result.report, /governed package cannot import provider package/);
  assert.match(result.report, /governed package cannot import provider package/);
  assert.match(result.report, /governed package cannot import provider package/);
  assert.match(result.report, /governed package cannot import provider package/);
});

test('provider packages cannot import other providers or runtime', () => {
  const result = checkBoundaries({
    files: [
      makeFile(
        repoPath('packages', 'adapters', 'holded', 'src', 'index.ts'),
        "import { createTelegramChannelAdapter } from '../../../channels/telegram/src/index';\nimport { createQwenOrchestrator } from '../../../orchestrators/qwen/src/index';\nimport { startInstallationRuntime } from '../../../runtime/src/index';\nimport { createMockExternalReadAdapter } from '../../../external-read-adapters/src/index';\n"
      ),
      makeFile(
        repoPath('packages', 'channels', 'telegram', 'src', 'index.ts'),
        "import { createHoldedReadAdapter } from '../../../adapters/holded/src/index';\n"
      )
    ]
  });

  assert.equal(result.passed, false);
  assert.equal(result.violations.length, 4);
  assert.match(result.report, /provider package cannot import another provider package/);
  assert.match(result.report, /provider package cannot import runtime package/);
});

test('runtime can import governed packages and providers', () => {
  const result = checkBoundaries({
    files: [
      makeFile(
        repoPath('packages', 'runtime', 'src', 'slice.ts'),
        "import { createHoldedReadAdapter } from '../../adapters/holded/src/index';\nimport { createTelegramChannelAdapter } from '../../channels/telegram/src/index';\nimport { createQwenOrchestrator } from '../../orchestrators/qwen/src/index';\nimport { resolveIdentityContext } from '../../identity/src/index';\nimport { createSourceEvidence } from '../../contracts/src/index';\n"
      )
    ]
  });

  assert.equal(result.passed, true);
});

test('extractors detect import export require and dynamic import forms', () => {
  const result = scanBoundaryViolations([
    makeFile(
      repoPath('packages', 'core', 'src', 'index.ts'),
      [
        "import { createPolicyDecision } from '../../contracts/src/index';",
        "export * from '../../contracts/src/index';",
        "const contracts = require('../../contracts/src/index');",
        "await import('../../contracts/src/index');"
      ].join('\n')
    )
  ]);

  assert.equal(result.length, 0);
});

test('report includes file line and reason for violations', () => {
  const report = buildBoundaryReport([
    {
      filePath: 'packages/core/src/index.ts',
      line: 2,
      specifier: '../../adapters/holded/src/index',
      targetPackageRoot: 'packages/adapters/holded',
      reason: 'governed package cannot import provider package'
    }
  ]);

  assert.equal(report.includes('Module boundary check failed.'), true);
  assert.equal(report.includes('packages/core/src/index.ts:2'), true);
  assert.equal(report.includes('imports packages/adapters/holded'), true);
  assert.equal(report.includes('reason: governed package cannot import provider package'), true);
});

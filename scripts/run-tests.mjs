/**
 * Test runner: compiles every tests/*.test.ts to CommonJS in a temp directory
 * and executes each file with node. Keeps the repo dependency-free while
 * giving a single `npm test` entry point.
 *
 * Usage: node scripts/run-tests.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '.cache/tests';
const tests = readdirSync('tests')
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

if (tests.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
// Compiled output is CommonJS; mark the directory so node does not treat the
// .js files as ES modules (root package.json declares "type": "module").
writeFileSync(join(OUT_DIR, 'package.json'), JSON.stringify({ type: 'commonjs' }));

console.log(`Compiling ${tests.length} test file(s)...`);
execFileSync(
  'npx',
  [
    'tsc',
    ...tests.map((f) => join('tests', f)),
    '--outDir', OUT_DIR,
    '--module', 'commonjs',
    '--target', 'ES2022',
    '--moduleResolution', 'node',
    '--rootDir', '.',
    '--strict',
    '--esModuleInterop',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);

let failed = 0;
for (const test of tests) {
  const compiled = join(OUT_DIR, 'tests', test.replace(/\.ts$/, '.js'));
  console.log(`\n=== ${test} ===`);
  try {
    execFileSync('node', [compiled], { stdio: 'inherit' });
  } catch {
    failed++;
    console.error(`--- ${test} FAILED ---`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${tests.length} test file(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} test file(s) passed.`);
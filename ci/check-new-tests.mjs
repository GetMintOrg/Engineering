#!/usr/bin/env node
/**
 * Every test file a PR adds must say which failure it catches.
 *
 * CI twin of hooks/guard-new-tests.sh: the hook stops the agent at write time,
 * this stops anyone (agent with hooks off, human) at PR time.
 *
 * - a new `*.spec|test.(ts|tsx|js)` outside `e2e/` carries a
 *   `@guards <category> — <failure>` JSDoc tag;
 * - a new spec under `e2e/` calls `testInfo.attach(`.
 *
 * Existing files are not back-filled. If you have a release branch that
 * re-presents already-reviewed specs, set ACCEPTED_REF (e.g. origin/staging):
 * a file that already exists there is skipped.
 *
 * Usage: node ci/check-new-tests.mjs <base-ref>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_FILE_RE = /\.(spec|test)\.(tsx?|jsx?|mjs)$/;
const E2E_RE = /(^|\/)e2e\//;
const GUARDS_RE = /@guards\s+(business-rule|security|recovery|regression|query|calculation)\s+[—-]+\s*\S/;

const base = process.argv[2];
if (!base) {
  console.error('Usage: node check-new-tests.mjs <base-ref>');
  process.exit(2);
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const root = git(['rev-parse', '--show-toplevel']).trim();

function acceptedTestFiles(ref) {
  if (!ref) return new Set();
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    return new Set();
  }
  return new Set(git(['ls-tree', '-r', '--name-only', ref]).split('\n').filter((f) => TEST_FILE_RE.test(f)));
}

const accepted = acceptedTestFiles(process.env.ACCEPTED_REF);
const added = git(['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`])
  .split('\n')
  .filter((file) => TEST_FILE_RE.test(file) && !accepted.has(file));

const failures = [];
for (const file of added) {
  const text = readFileSync(join(root, file), 'utf8');
  if (E2E_RE.test(file)) {
    if (!text.includes('.attach(')) failures.push(`${file}: an E2E journey must end with testInfo.attach() of its outcome`);
  } else if (!GUARDS_RE.test(text)) {
    failures.push(`${file}: missing \`@guards <business-rule|security|recovery|regression|query|calculation> — <failure>\``);
  }
}

if (failures.length > 0) {
  console.error('✗ New test files must name the failure they catch:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ ${added.length} new test file(s) name what they guard`);

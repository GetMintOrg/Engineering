#!/usr/bin/env node
/**
 * "The ceiling only goes down": fails a PR that loosens lint instead of fixing code.
 *
 * Agents under pressure to turn lint green take the shortest path: raise the
 * budget, add the file to an exemption list, or drop a disable comment. Each
 * of those is caught here against the base branch:
 *
 * - a `complexity`, `max-lines`, `max-lines-per-function`, `max-depth` or
 *   `max-params` limit raised in a lint config;
 * - a `--max-warnings` cap raised in a package.json script;
 * - a member added to a `BURNDOWN` / `ratchet` exemption collection in a lint
 *   config or plugin (those lists may only shrink);
 * - a new `eslint-disable` / `oxlint-disable` directive added in the diff.
 *
 * `LINT_RATCHET_ACK=1` (e.g. set from a PR label in CI) lets a deliberate,
 * human-decided re-baseline through.
 *
 * Usage: node ci/check-lint-ratchet.mjs <base-ref>
 */
import { execFileSync } from 'node:child_process';

const BUDGET_RULES = ['complexity', 'max-lines-per-function', 'max-lines', 'max-depth', 'max-params'];
const CONFIG_FILE_RE =
  /(^|\/)(\.?oxlintrc(\.json)?|oxlint\.config\.[cm]?[jt]s|\.eslintrc(\.\w+)?|eslint\.config\.[cm]?[jt]s|package\.json)$|(^|\/)(oxlint|eslint|lint)[\w-]*plugins?\/.+\.m?js$/;
const SOURCE_FILE_RE = /\.(m?[jt]sx?|cjs)$/;
const COLLECTION_RE =
  /(?:const|let)\s+(BURNDOWN|ratchet)\s*=\s*(?:new Set\(\[|\[|\{)([\s\S]*?)(?:\]\)|\]|\}\s*as const|\};)/g;
const DISABLE_RE = /(eslint|oxlint)-disable/;

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

function fileAt(ref, file) {
  try {
    return git(['show', `${ref}:${file}`]);
  } catch {
    return null;
  }
}

/** Numeric budgets keyed `<rule>#<n>` (n-th occurrence) so the same budget matches across revisions. */
function budgets(text) {
  const found = new Map();
  const record = (key, value) => {
    let index = 0;
    while (found.has(`${key}#${index}`)) index += 1;
    found.set(`${key}#${index}`, Number(value));
  };
  for (const rule of BUDGET_RULES) {
    const pattern = new RegExp(
      `['"]?${rule}['"]?\\s*:\\s*\\[\\s*['"]?(?:error|warn|1|2)['"]?\\s*,\\s*(?:\\{[^}]*?\\bmax['"]?\\s*:\\s*)?(\\d+)`,
      'g',
    );
    for (const match of text.matchAll(pattern)) record(rule, match[1]);
  }
  for (const match of text.matchAll(/--max-warnings[= ](\d+)/g)) record('max-warnings', match[1]);
  return found;
}

function collections(text) {
  const found = new Map();
  for (const match of text.matchAll(COLLECTION_RE)) {
    found.set(match[1], new Set([...match[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1])));
  }
  return found;
}

const baseRef = process.argv[2];
if (!baseRef) {
  console.error('usage: check-lint-ratchet.mjs <base-ref>');
  process.exit(2);
}
if (process.env.LINT_RATCHET_ACK === '1') {
  console.log('✓ Lint budget re-baseline acknowledged');
  process.exit(0);
}

const changed = git(['diff', '--name-only', `${baseRef}...HEAD`]).split('\n').filter(Boolean);
const failures = [];

for (const file of changed.filter((f) => CONFIG_FILE_RE.test(f))) {
  const before = fileAt(baseRef, file);
  const after = fileAt('HEAD', file);
  if (before === null || after === null) continue;
  const beforeBudgets = budgets(before);
  for (const [key, value] of budgets(after)) {
    const previous = beforeBudgets.get(key);
    if (previous !== undefined && value > previous) {
      failures.push(`${file}: ${key.replace(/#\d+$/, '')} raised from ${previous} to ${value}`);
    }
  }
  const beforeCollections = collections(before);
  for (const [name, members] of collections(after)) {
    const previous = beforeCollections.get(name);
    if (!previous) continue;
    for (const member of members) {
      if (!previous.has(member)) failures.push(`${file}: "${member}" added to ${name}, which may only shrink`);
    }
  }
}

const sources = changed.filter((f) => SOURCE_FILE_RE.test(f));
if (sources.length > 0) {
  const diff = git(['diff', '-U0', `${baseRef}...HEAD`, '--', ...sources]);
  let current = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) current = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++') && DISABLE_RE.test(line)) {
      failures.push(`${current}: new lint disable directive: ${line.slice(1).trim()}`);
    }
  }
}

if (failures.length > 0) {
  console.error('✗ Lint got looser. Fix the code instead (split the function or file, fix the warning):');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ No lint budget grew against ${baseRef}`);

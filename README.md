# GetMint Engineering: agent guardrails

The guardrails the GetMint engineering team runs on every AI coding agent session.

The idea: when you correct an agent twice on the same thing, stop writing it in prose (CLAUDE.md, rules files). A rule in prose is a rule the agent will eventually break. Make the wrong thing impossible instead, at the earliest place it fits: a hook at write time, a lint rule, a CI check, a procedure.

| File | What it stops |
|---|---|
| `hooks/guard-new-tests.sh` | A new test file that can't name the failure it catches. New E2E specs must attach a verifiable artifact. |
| `hooks/protect-files.sh` | The agent writing into `.env*`, keys, certificates or credential files. |
| `oxlint-plugins/no-internal-module-mocking.mjs` | `vi.mock('./my-own-module')`: tests that assert against a mock's shape and stay green after the real contract breaks. |
| `oxlint-plugins/no-stray-line-comments.mjs` | `// now we fetch the user`: narration comments that restate the code and rot. |
| `oxlint-plugins/no-hand-rolled-sleep.mjs` | `await new Promise(r => setTimeout(r, 2000))`: "wait for the other job" instead of a real completion signal. |
| `ci/check-new-tests.mjs` | The same test rule at PR time, for humans and hook-less sessions. |
| `ci/check-lint-ratchet.mjs` | Turning lint green by loosening it: raised budgets, files added to exemption lists, new `eslint-disable` lines. |
| `skills/ship/SKILL.md` | "I opened the PR, done." The agent takes the change to a green PR with every review thread handled. |
| `skills/dlq/SKILL.md` | Redriving a dead-letter queue into the same bug: peek without consuming, root cause, redrive only once the fix is deployed. |

## Hooks (Claude Code)

Copy `hooks/` to `.claude/hooks/`, then in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash .claude/hooks/protect-files.sh" }] },
      { "matcher": "Write", "hooks": [{ "type": "command", "command": "bash .claude/hooks/guard-new-tests.sh" }] }
    ]
  }
}
```

A new `*.spec.ts` / `*.test.ts` must carry:

```ts
/**
 * @guards calculation — a discount above 100% yields a negative invoice total
 */
```

Categories: `business-rule | security | recovery | regression | query | calculation`. Exit 2 sends the reason back to the agent: it names the failure or drops the test. No human in the loop. Both hooks need `jq`.

## Lint rules (oxlint JS plugins)

```json
{
  "jsPlugins": [
    "./oxlint-plugins/no-internal-module-mocking.mjs",
    "./oxlint-plugins/no-stray-line-comments.mjs",
    "./oxlint-plugins/no-hand-rolled-sleep.mjs"
  ],
  "rules": {
    "no-internal-module-mocking/no-internal-vi-mock": ["error", { "firstPartyPrefixes": ["@/", "@your-org/"] }],
    "no-stray-line-comments/no-line-comments": "error",
    "no-hand-rolled-sleep/no-sleep-promise": "error"
  }
}
```

- **no-internal-vi-mock:** relative imports are always first-party. Mocking `axios`, `stripe`, `node:dns` stays allowed: those are real boundaries. Covers `vi.mock` and `jest.mock`.
- **no-line-comments:** allows tool directives (`eslint-disable`, `@ts-*`, `prettier-ignore`), `/// <reference>` and one `// HACK:` pointer. JSDoc and block comments are untouched.
- **no-sleep-promise:** when a delay is genuinely needed (retry backoff), use `setTimeout(ms, undefined, { signal })` from `node:timers/promises`.

## CI checks

`.github/workflows/agent-guardrails.yml` runs both on every PR. Copy `ci/` and the workflow.

- `check-lint-ratchet.mjs`: lint budgets and exemption lists (`BURNDOWN` / `ratchet` collections) only shrink, and no new disable directive lands. A `lint-budget-rebaseline` PR label lets a deliberate, human-decided re-baseline through.
- `check-new-tests.mjs`: set `ACCEPTED_REF` (e.g. `origin/staging`) if a release PR re-presents specs already reviewed on another branch.

Run them in a pre-push hook too, so a red PR fails the push first.

## Skills (Claude Code)

Copy `skills/<name>/` to `.claude/skills/<name>/`.

- **ship:** set your base branch, then say "ship". Needs `gh`.
- **dlq:** AWS SQS. Needs the `aws` CLI and a named profile per environment.

## License

MIT. `no-internal-module-mocking` is adapted from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) (MIT).

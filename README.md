# GetMint Engineering: agent guardrails

Three guardrails the GetMint engineering team runs on every AI coding agent session, so agent-written tests catch bugs instead of reciting the code.

The idea: when you correct an agent twice on the same thing, stop writing it in prose (CLAUDE.md, rules files). Make the wrong thing impossible: a hook, a lint rule, a procedure.

| File | What it stops |
|---|---|
| `hooks/guard-new-tests.sh` | An agent writing a new test file that can't name the failure it catches. New E2E specs must attach a verifiable artifact. |
| `oxlint-plugins/no-internal-module-mocking.mjs` | `vi.mock('./my-own-module')`: tests that assert against a mock's shape and stay green after the real contract breaks. |
| `skills/ship/SKILL.md` | "I opened the PR, done." The agent takes the change to a green PR with every review thread handled, without stopping to ask. |

## 1. Test guard hook (Claude Code)

Copy `hooks/guard-new-tests.sh` to `.claude/hooks/`, then in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
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

Categories: `business-rule | security | recovery | regression | query | calculation`. Exit 2 sends the reason back to the agent: it names the failure or drops the test. No human in the loop. Needs `jq`.

Pair it with a CI check that applies the same rule to new test files in the PR, or humans bypass it.

## 2. No internal module mocking (oxlint)

```json
{
  "jsPlugins": ["./oxlint-plugins/no-internal-module-mocking.mjs"],
  "rules": {
    "no-internal-module-mocking/no-internal-vi-mock": ["error", { "firstPartyPrefixes": ["@/", "@your-org/"] }]
  }
}
```

Relative imports are always first-party. Mocking `axios`, `stripe`, `node:dns` stays allowed: those are real boundaries. Covers `vi.mock` and `jest.mock`.

## 3. Ship skill (Claude Code)

Copy `skills/ship/` to `.claude/skills/ship/`, set your base branch, then say "ship". Needs `gh`.

## License

MIT. The lint rule is adapted from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) (MIT).

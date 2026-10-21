---
name: ship
description: "Take finished work to a reviewed, green PR: checks, commit, push, PR, CI, every review thread handled. Use when: user says 'ship', 'open the PR', 'push it', or a task is done and needs a PR."
argument-hint: "[conventional commit subject]"
---

Ship the current change as a PR against the integration branch (`BASE`, default: the repo's default branch; change it here if your team integrates elsewhere, e.g. `staging`). Done means: CI green, zero unresolved review threads, the bot's suppressed comments read. Do every step; do not stop to ask between them.

## 1. Where am I

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
gh repo view --json owner,name,defaultBranchRef
```

- Never commit on the base or release branch. Branch names are `feat|fix|chore/<scope>`.
- If several agent sessions share this checkout, move YOUR files to a `git worktree` before committing. Never `git stash`: the stash is shared across worktrees.

## 2. Is the branch's PR still open

```bash
gh pr view --json number,state,baseRefName
```

- `MERGED` or `CLOSED`: do not push here. Fetch the base, create a new branch off it, cherry-pick the new commits and open a new PR that links the old one.
- `OPEN`: push to it. No PR: continue.

## 3. Checks on what changed

For each touched package, run its typecheck, lint and affected tests, plus its build when the change touches bundling, config, dependencies, routing or the server/client boundary. Don't run the full suite locally: CI does. Fix every failure in the code; never disable a rule, raise a budget, skip a test or loosen an assertion.

## 4. Commit and push

- Conventional subject (`feat:`, `fix:`, `chore:` …, scoped), body says why.
- Never `--no-verify`. If a hook fails, fix the cause and commit again.
- `git push -u origin HEAD`.

## 5. Open the PR

```bash
gh pr create --base "$BASE" --title "<subject>" --body "<body>"
```

Body: what changed and why, ops steps (migrations, backfills, infra deploys; before or after deploy), external services called and what data leaves, how it was verified (commands, E2E artifact paths), what was NOT verified.

## 6. CI

```bash
gh pr checks --watch --fail-fast
```

On failure, read the log (`gh run view <id> --log-failed`), fix, push, watch again.

## 7. Every review thread, and the suppressed comments

Unresolved threads (bots and humans):

```bash
gh api graphql -f query='query { repository(owner:"OWNER", name:"REPO") { pullRequest(number:N) { reviewThreads(first:50) { pageInfo { hasNextPage endCursor } nodes { id isResolved comments(first:3) { nodes { author { login } body path line } } } } } } }'
```

GitHub Copilot hides real findings in the review BODY under `<details><summary>Suppressed comments (K)</summary>`; they are not threads. Always read it:

```bash
gh api graphql -f query='query { repository(owner:"OWNER", name:"REPO") { pullRequest(number:N) { reviews(last:5) { nodes { author { login } body } } } } }'
```

Page with `after:` while `hasNextPage` is true. Only then is a count of zero true.

Request a bot review at most ONCE per PR: re-requesting after every fix buys a new wave of nitpicks, not safety.

For each finding:

- Real: fix it, push, then resolve the thread without replying (the diff explains the fix).
- Not applicable: reply with a one-line reason, then resolve.
- Suppressed comment: fix it and push; there is no thread to resolve.

```bash
gh api graphql -f query='mutation { resolveReviewThread(input:{threadId:"<thread id>"}) { thread { isResolved } } }'
```

After pushing fixes, go back to step 6.

## 8. Report

PR URL, CI state, unresolved thread count (must be 0), ops steps still pending after merge, anything not verified.

#!/bin/bash
# Claude Code PreToolUse hook (matcher: Write).
# Refuses a NEW test file that does not say which failure it catches.
# Never prompts a human: exit 2 hands the reason back to the agent, which either
# names the failure (`@guards`) or drops the test. Edits to existing files pass.

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$FILE" in
  *.spec.ts|*.spec.tsx|*.test.ts|*.test.tsx|*.spec.js|*.test.js) ;;
  *) exit 0 ;;
esac

if [ -e "$FILE" ]; then
  exit 0
fi

CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // empty')

case "$FILE" in
  */e2e/*)
    if ! printf '%s' "$CONTENT" | grep -q '\.attach('; then
      echo "BLOCKED: new E2E spec $FILE never calls testInfo.attach(). Every journey ends with a verifiable artifact (screenshot, returned JSON, exported file) a reviewer can check without rerunning." >&2
      exit 2
    fi
    exit 0
    ;;
esac

if ! printf '%s' "$CONTENT" | grep -Eq '@guards[[:space:]]+(business-rule|security|recovery|regression|query|calculation)[[:space:]]+[—-]+[[:space:]]*[^[:space:]]'; then
  cat >&2 <<MSG
BLOCKED: new test file $FILE has no \`@guards <category> — <failure>\` JSDoc.
E2E first; an isolated test exists only for a failure you listed BEFORE writing the code.
Categories: business-rule | security | recovery | regression | query | calculation.
If you cannot name the failure this file catches, do not write it: verify through existing tests or an E2E journey instead.
MSG
  exit 2
fi

exit 0

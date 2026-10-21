#!/bin/bash
# Block edits to files that hold secret material (not code that handles secrets).
# Claude Code PreToolUse hook (matcher: Edit|Write).
# Exit 2 = refuse the write and hand the reason back to the agent.

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

FILE=$(jq -r '.tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

BASENAME=$(basename "$FILE")

# Environment files; the committed .env.example templates stay editable
case "$BASENAME" in
  .env.example) ;;
  .env|.env.*)
    echo "BLOCKED: Editing $BASENAME is not allowed. Environment files contain secrets." >&2
    exit 2
    ;;
esac

# Private keys and certificates; public CA bundles (*-bundle.pem) stay editable
case "$BASENAME" in
  *-bundle.pem) ;;
  *.pem|*.key|*.p12|*.pfx|*.cert)
    echo "BLOCKED: Editing $BASENAME is not allowed. Certificate/key files are sensitive." >&2
    exit 2
    ;;
esac

# Credential data files; source code that handles secrets (secrets.ts, credential.ts) stays editable
case "$BASENAME" in
  credentials|*secret*.json|*secret*.yaml|*secret*.yml|*secret*.txt|*secret*.ini|*credential*.json|*credential*.yaml|*credential*.yml|*credential*.txt|*credential*.ini)
    echo "BLOCKED: Editing $BASENAME is not allowed. Credentials files are sensitive." >&2
    exit 2
    ;;
esac

exit 0

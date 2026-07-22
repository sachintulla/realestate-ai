#!/usr/bin/env bash
#
# push-prompt.sh
#
# Pushes the real-estate voice-agent system prompt
# (docs/prompts/real_estate_agent_v1.txt) to a business's Getello agent by
# calling the `update-agent-prompt` edge function (AI_BUILD_GUIDE.md §6.4 / §8.1)
# with { business_id, prompt_text, prompt_type: "hybrid" }.
#
# Usage:
#   SUPABASE_URL="https://<ref>.supabase.co" \
#   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
#   ./scripts/push-prompt.sh <business_id>
#
#   - <business_id> is a REQUIRED CLI argument — never hardcoded.
#   - Secrets are read from the environment only — never hardcoded, never logged.
#
# ─────────────────────────────────────────────────────────────────────────────
# ⚠️  OPEN QUESTION (from AI_BUILD_GUIDE.md §8.1) — CONFIRM WITH GETELLO BEFORE
#     RELYING ON THIS IN PRODUCTION:
#
#     The prompt in docs/prompts/real_estate_agent_v1.txt contains {{variable}}
#     placeholders (e.g. {{business_name}}, {{user_name}}). This script pushes
#     the prompt AS-IS, which ASSUMES Getello interpolates those placeholders
#     from context_data at call time. That assumption is UNVERIFIED.
#
#     If Getello does NOT support {{ }} interpolation, the literal placeholders
#     will reach the caller verbatim and break the calls. In that case the
#     variables must instead be woven into prompt_text server-side (inside
#     trigger-call, or a new step before it) before pushing.
#
#     Verify this against Getello's own documentation first.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BUSINESS_ID="${1:-}"
if [[ -z "$BUSINESS_ID" ]]; then
  echo "Error: business_id is required." >&2
  echo "Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... $0 <business_id>" >&2
  exit 1
fi

: "${SUPABASE_URL:?Error: set SUPABASE_URL (e.g. https://<ref>.supabase.co)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Error: set SUPABASE_SERVICE_ROLE_KEY}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/../docs/prompts/real_estate_agent_v1.txt"
if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found at $PROMPT_FILE" >&2
  exit 1
fi

# Build the JSON payload. node (already a project dependency) is used purely to
# JSON-encode the prompt text safely — it handles all quoting/newlines/{{ }}.
PAYLOAD="$(BUSINESS_ID="$BUSINESS_ID" PROMPT_FILE="$PROMPT_FILE" node -e '
  const fs = require("fs");
  const prompt_text = fs.readFileSync(process.env.PROMPT_FILE, "utf8");
  process.stdout.write(JSON.stringify({
    business_id: process.env.BUSINESS_ID,
    prompt_text,
    prompt_type: "hybrid",
  }));
')"

echo "Pushing prompt to update-agent-prompt (business_id=$BUSINESS_ID)..." >&2

# --fail-with-body: non-2xx exits non-zero but still prints the response body.
curl --fail-with-body -sS -X POST \
  "${SUPABASE_URL%/}/functions/v1/update-agent-prompt" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  --data "$PAYLOAD"

echo

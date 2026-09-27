#!/usr/bin/env bash
# npm run deploy: ./check.sh, then wrangler pages deploy. Unattended-safe auth:
# exports the infra-only cloudflare_api_token/cloudflare_account_id from
# ~/.config/kb/config.json when set (INVARIANTS, "One auth, one secret");
# unset → wrangler's own OAuth login. wrangler is pinned and time-boxed.
set -euo pipefail
cd "$(dirname "$0")"
./check.sh
CFG=~/.config/kb/config.json
t="$(jq -r '.cloudflare_api_token // empty' "$CFG" 2>/dev/null || true)"
a="$(jq -r '.cloudflare_account_id // empty' "$CFG" 2>/dev/null || true)"
if [ -n "$t" ]; then export CLOUDFLARE_API_TOKEN="$t"; fi
if [ -n "$a" ]; then export CLOUDFLARE_ACCOUNT_ID="$a"; fi
timeout 300 npx --yes wrangler@4.141.0 pages deploy site --project-name margin

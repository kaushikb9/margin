#!/usr/bin/env bash
# The one verb. ~0.5s, no network. Exit 0 = safe to hand back.
# brain contract (every quote really said within ±45s) + node --test.
set -euo pipefail
cd "$(dirname "$0")"
node scripts/check-brain.mjs
node --test 'tests/*.test.js'

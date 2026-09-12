#!/usr/bin/env bash
#
# Offline validation of every Maestro flow — no device, no build, no EAS credits.
#
# `maestro check-syntax` parses a flow and validates its commands without touching a simulator,
# so this is the one Maestro check that can run on any machine at any time. It catches malformed
# YAML, unknown commands and bad selector shapes; it CANNOT tell you whether a selector matches
# anything in the real app — only a run against a build carrying the current code can do that.
#
# The CLI takes one file at a time, hence the loop. Windows users can substitute maestro.bat.
set -uo pipefail
cd "$(dirname "$0")/../.."

: "${JAVA_HOME:=}"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

FAILED=0
for f in qa/native/flows/*.yaml qa/native/flows/steps/*.yaml; do
  if maestro check-syntax "$f" >/tmp/maestro-check.out 2>&1; then
    echo "OK    $f"
  else
    FAILED=1
    echo "FAIL  $f"
    head -20 /tmp/maestro-check.out
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "== MAESTRO SYNTAX CHECK FAILED =="
  exit 1
fi
echo "== ALL MAESTRO FLOWS PARSE =="

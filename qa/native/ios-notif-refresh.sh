#!/usr/bin/env bash
#
# Phase 4E.2 — Notification-center refresh journey (iOS Simulator).
#
# Replays Android Phase 4E.1 defect #1 (foreground notification list did not refresh)
# on iOS, as far as the simulator genuinely allows. Uses the REAL in-app Notifications
# screen and QA notification data:
#
#   1. Seed notification "A" (initial) via the QA service role.
#   2. Flow A: log the QA customer in, open Notifications → assert the initial list
#      loaded and shows "A"; assert the not-yet-created "B" is absent.
#   3. Seed notification "B" (refresh) AFTER the screen has mounted.
#   4. Flow B: SAME running session (no relaunch) → pull-to-refresh → assert "B" appears
#      and "A" is still present.
#   5. Verify EXACTLY ONE row per title (no duplicate notifications).
#   6. Clean up both seeded rows.
#
# This proves in-app refresh only. It does NOT — and must not — assert real APNs delivery,
# device token registration, or a physical notification banner (all PHYSICAL-ONLY).
#
# Requires: maestro on PATH, a booted iOS simulator with com.quickserve.app installed,
# node + jq, and QA_* + QA_CUSTOMER_* creds in the environment (CI secrets).
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
STAMP="$(date +%s)"
TITLE_INIT="QA Initial $STAMP"
TITLE_REFRESH="QA Refresh $STAMP"
BODY_INIT="Seeded before the screen mounted ($STAMP)"
BODY_REFRESH="Created mid-session; must appear via pull-to-refresh ($STAMP)"

echo "::group::Phase 4E.2 notification-center refresh — stamp $STAMP"

req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY \
         QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

# Always clean up the seeded rows, even on failure.
cleanup() {
  echo "::group::Notif cleanup (stamp $STAMP)"
  $BE notif-clean customer "$TITLE_INIT"    || echo "cleanup A error (non-fatal)"
  $BE notif-clean customer "$TITLE_REFRESH" || echo "cleanup B error (non-fatal)"
  echo "::endgroup::"
}
trap cleanup EXIT

CID=$($BE provider-id customer | jq -r '.id')
echo "QA customer id: $CID"

# Idempotent pre-clean (in case a prior run left rows with the same stamp — unlikely).
$BE notif-clean customer "$TITLE_INIT"    >/dev/null || true
$BE notif-clean customer "$TITLE_REFRESH" >/dev/null || true

# ── 1. Seed the INITIAL notification, then prove the screen loads it on mount ──
echo "== [1] Seed initial notification =="
$BE notify customer "$TITLE_INIT" "$BODY_INIT" | jq '{id, title}'

echo "== [2] Flow A: login + Notifications initial load =="
maestro test "$FLOWS/notifications-refresh-a.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" \
  -e TITLE_INIT="$TITLE_INIT" -e TITLE_REFRESH="$TITLE_REFRESH"

# ── 3. Create the REFRESH notification mid-session (screen already mounted) ────
echo "== [3] Seed refresh notification (after mount) =="
$BE notify customer "$TITLE_REFRESH" "$BODY_REFRESH" | jq '{id, title}'

# ── 4. Flow B: same session, pull-to-refresh surfaces it (no restart) ─────────
echo "== [4] Flow B: pull-to-refresh (same running session) =="
maestro test "$FLOWS/notifications-refresh-b.yaml" \
  -e TITLE_INIT="$TITLE_INIT" -e TITLE_REFRESH="$TITLE_REFRESH"

# ── 5. No-duplicate verification: exactly one row per title ────────────────────
echo "== [5] Verify no duplicate notification rows =="
CI_COUNT=$($BE notif-count customer "$TITLE_INIT"    | jq -r '.count')
CR_COUNT=$($BE notif-count customer "$TITLE_REFRESH" | jq -r '.count')
echo "row counts: initial=$CI_COUNT refresh=$CR_COUNT"
[ "$CI_COUNT" = "1" ] || { echo "FAIL: expected exactly 1 initial row, got $CI_COUNT"; exit 1; }
[ "$CR_COUNT" = "1" ] || { echo "FAIL: expected exactly 1 refresh row, got $CR_COUNT"; exit 1; }

echo "== NOTIFICATION-CENTER REFRESH JOURNEY PASSED (stamp $STAMP) =="
echo "::endgroup::"
# cleanup runs on EXIT (trap)

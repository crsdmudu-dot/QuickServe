#!/usr/bin/env bash
#
# Phase 3H — iOS customer/provider native journey orchestration (macOS / iOS Simulator).
#
# Runs the Phase 3F Maestro journeys against a BOOTED iOS simulator with the app installed,
# using the QA backend for setup-verification, the admin-API assignment prerequisite, and
# cleanup (never for the behaviour under test). Designed for the GitHub Actions macOS runner
# (.github/workflows/ios-native-journeys.yml) but runnable on any macOS with:
#   - `maestro` on PATH, a booted iOS simulator with ke.co.hiredcorp.quickserve installed
#   - node, jq
#   - QA_* + provider/customer creds in the environment (from CI secrets)
#
# Credentials are read from the environment and passed to Maestro via -e; never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
MARKER="P3H-$(date +%s)"
FAILED=0

echo "::group::Phase 3H iOS journeys — marker $MARKER"

# Always attempt cleanup, even on failure.
cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual bookings: $($BE find "$MARKER" | jq -r '.count')"
  echo "::endgroup::"
}
trap cleanup EXIT

req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY \
         QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD QA_PROVIDER1_EMAIL QA_PROVIDER1_PASSWORD; do req "$v"; done

# ── 1. Customer journey: create the booking through the iOS UI ────────────────
echo "== [1] Customer journey (create booking via UI) =="
maestro test "$FLOWS/customer-journey.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e MARKER="$MARKER"

# ── 2. Backend verify: exactly one booking, correct fields ────────────────────
echo "== [2] Backend verify booking =="
FIND=$($BE find "$MARKER")
COUNT=$(echo "$FIND" | jq -r '.count')
[ "$COUNT" = "1" ] || { echo "FAIL: expected 1 booking, got $COUNT"; exit 1; }
BID=$(echo "$FIND" | jq -r '.bookings[0].id')
echo "$FIND" | jq '{count, service:.bookings[0].service_id, status:.bookings[0].status, customer:.bookings[0].customer_id, assigned:.bookings[0].assigned_provider_id}'
[ "$(echo "$FIND" | jq -r '.bookings[0].service_id')" = "house-cleaning" ] || { echo "FAIL: wrong service"; exit 1; }
[ "$(echo "$FIND" | jq -r '.bookings[0].status')" = "pending" ] || { echo "FAIL: expected pending"; exit 1; }
[ "$(echo "$FIND" | jq -r '.bookings[0].assigned_provider_id')" = "null" ] || { echo "FAIL: should be unassigned"; exit 1; }

# ── 3. Assignment prerequisite (certified admin connected-helper API) ─────────
echo "== [3] Assign to Provider One (admin API setup, not a new admin cert) =="
P1=$($BE provider-id provider1)
PID=$(echo "$P1" | jq -r '.id'); PNAME=$(echo "$P1" | jq -r '.full_name'); PPHONE=$(echo "$P1" | jq -r '.phone // ""')
$BE assign "$BID" "$PID" "$PNAME" "$PPHONE" | jq '{status:.row.status, assigned:.row.assigned_provider_id, name:.row.assigned_provider_name}'
[ "$($BE read "$BID" | jq -r '.status')" = "provider_assigned" ] || { echo "FAIL: assignment"; exit 1; }

# ── 4. Provider progression through the iOS UI (verify each state in backend) ──
echo "== [4] Provider status progression (UI + backend) =="
advance() { # $1 = button label, $2 = expected backend status
  maestro test "$FLOWS/provider-advance.yaml" \
    -e PROV_EMAIL="$QA_PROVIDER1_EMAIL" -e PROV_PW="$QA_PROVIDER1_PASSWORD" -e NEXT="$1"
  sleep 6
  local st; st=$($BE read "$BID" | jq -r '.status')
  local ap; ap=$($BE read "$BID" | jq -r '.assigned_provider_id')
  echo "   after '$1': status=$st assigned=$ap"
  [ "$st" = "$2" ] || { echo "FAIL: expected $2, got $st"; exit 1; }
  [ "$ap" = "$PID" ] || { echo "FAIL: assigned_provider_id changed"; exit 1; }
}
advance "On the way"  on_the_way
advance "In progress" in_progress
advance "Completed"   completed

# ── 5. Customer completion + review through the iOS UI ────────────────────────
echo "== [5] Customer review (via UI) =="
maestro test "$FLOWS/customer-review.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e COMMENT="P3H-review-$MARKER"
sleep 4
REV=$($BE review "$BID")
echo "$REV" | jq '{count, rating:.reviews[0].rating, provider:.reviews[0].provider_id}'
[ "$(echo "$REV" | jq -r '.count')" = "1" ] || { echo "FAIL: expected 1 review"; exit 1; }
[ "$(echo "$REV" | jq -r '.reviews[0].rating')" = "5" ] || { echo "FAIL: expected rating 5"; exit 1; }
AGG=$($BE provider-rating "$PID")
echo "provider aggregate: $AGG"
[ "$(echo "$AGG" | jq -r '.review_count')" = "1" ] || { echo "FAIL: review_count not 1"; exit 1; }

echo "== ALL iOS JOURNEYS PASSED (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT (trap)

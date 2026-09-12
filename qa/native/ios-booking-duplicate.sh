#!/usr/bin/env bash
#
# Phase 4E.2 — iOS Simulator booking duplicate-warning + idempotency journey.
# Runs booking-duplicate.yaml (creates booking A, then B → warning → "Book another anyway"),
# verifies BOTH bookings exist, then deletes the disposable rows by marker. No payment/provider.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
MARKER="P4E2DUP-$(date +%s)"

echo "::group::Booking duplicate journey — marker $MARKER"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual: $($BE find "$MARKER" | jq -r '.count')"
  echo "::endgroup::"
}
trap cleanup EXIT

maestro test "$FLOWS/booking-duplicate.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e MARKER="$MARKER"

# Both bookings must exist: A (first Place Booking) + B (Book another anyway).
CNT=$($BE find "$MARKER" | jq -r '.count')
echo "bookings created with marker: $CNT"
[ "$CNT" = "2" ] || { echo "FAIL: expected 2 bookings (A + Book Anyway), got $CNT"; exit 1; }

echo "== BOOKING DUPLICATE JOURNEY PASSED (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT

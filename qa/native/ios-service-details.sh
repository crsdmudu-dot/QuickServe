#!/usr/bin/env bash
#
# Service Details V1.5 — iOS Simulator orchestration for the Service Details flows.
#
# Two groups, deliberately separated:
#   1. READ-ONLY flows. They stop at the Address or Review step and never tap Place Booking, so
#      they create NO QA data and need no cleanup. Safe to run repeatedly.
#   2. The distinct-duplicate flow, which DOES create two bookings and is therefore marker-scoped
#      and cleaned up on exit, exactly like ios-booking-duplicate.sh.
#
# Requires (same as the other iOS runners): `maestro` on PATH, a booted iOS simulator with
# ke.co.hiredcorp.kwikserve installed, node, jq, and QA_* credentials in the environment.
#
# IMPORTANT: the installed simulator artifact must actually contain the V1.3/V1.4 Service Details
# code. Running these against an older build proves nothing — they will fail at "Step 1 of 5".
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
MARKER="SDV15-$(date +%s)"

echo "::group::Service Details flows — marker $MARKER"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual: $($BE find "$MARKER" | jq -r '.count')"
  echo "::endgroup::"
}
trap cleanup EXIT

run() { # $1 = flow file (read-only; no marker needed)
  echo "== $1 =="
  maestro test "$FLOWS/$1" -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD"
}

# ── 1. Read-only Service Details coverage ─────────────────────────────────────
run service-details-house-cleaning.yaml
run service-details-grocery.yaml
run service-details-massage.yaml
run service-details-towing-safety.yaml
run service-details-address-back.yaml

# ── 2. Duplicate warning must NOT fire for a different primary request ────────
echo "== booking-duplicate-distinct.yaml =="
maestro test "$FLOWS/booking-duplicate-distinct.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e MARKER="$MARKER"

# Both bookings must exist: the second was created WITHOUT the customer confirming a warning.
CNT=$($BE find "$MARKER" | jq -r '.count')
echo "bookings created with marker: $CNT"
[ "$CNT" = "2" ] || { echo "FAIL: expected 2 bookings (standard + laundry), got $CNT"; exit 1; }

echo "== ALL SERVICE DETAILS FLOWS PASSED (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT

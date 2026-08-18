#!/usr/bin/env bash
#
# Service Details V1.6 — iOS Simulator runner for the GROCERY flow, in isolation.
#
# Grocery is separated from ios-service-details.sh purely as EVIDENCE ORDERING. The flow itself is
# unchanged and still fatal: it has a reproducible Maestro/iOS limitation where, deep in the
# longest form in the suite, the accessibility hierarchy goes stale while the target is visibly
# rendered on screen (runs 32117403697 and 32130617551 failed at the same substitution scroll, both
# with screenshots showing the element present). Because every runner is fail-fast, that one
# environmental ceiling was preventing four unrelated legacy regression steps from ever executing.
#
# Running Grocery last of all means it can still fail the workflow — which it should, since its
# substitution / media / Continue-to-Address coverage is genuinely unproven — without costing the
# evidence from everything ahead of it.
#
# What Grocery HAS proven at runtime: shop_for_me, two item lines, quantities and units, the
# deterministic item-brand-* selector, Brookside capture and its survival across adding Item 2,
# Item 1 preservation, the maximum-goods-budget wording, the delivery/service fee separation, the
# absence of total/payment language, and the budget keyboard dismissal.
#
# Marker/cleanup are carried here in full rather than shared, matching every other runner in this
# directory (ios-journeys.sh, ios-booking-duplicate.sh, ios-notif-refresh.sh each own theirs).
# Grocery creates no booking before its known failure point, but the cleanup is kept so that
# remains true by construction rather than by luck.
#
# Requires: `maestro` on PATH, a booted iOS simulator with ke.co.hiredcorp.kwikserve installed,
# node, jq, and QA_* credentials in the environment.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
MARKER="SDV16GR-$(date +%s)"

echo "::group::Grocery Service Details flow — marker $MARKER"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual: $($BE find "$MARKER" | jq -r '.count')"
  echo "::endgroup::"
}
trap cleanup EXIT

echo "== service-details-grocery.yaml =="
maestro test "$FLOWS/service-details-grocery.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD"

echo "== GROCERY SERVICE DETAILS FLOW PASSED (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT

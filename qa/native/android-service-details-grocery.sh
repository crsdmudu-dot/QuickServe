#!/usr/bin/env bash
#
# Service Details V1.6 — Android emulator runner for the GROCERY flow, in isolation.
#
# Android counterpart of ios-service-details-grocery.sh, preserving the isolation rationale: the
# Grocery form is the longest in the suite, so it runs LAST OF ALL and its failure stays fatal.
# Separating it is evidence ORDERING only — the flow is unchanged, its exit code is NOT swallowed,
# and there is deliberately no continue-on-error. A Grocery failure still fails the certification.
#
# On iOS this flow reached Address / Step 2 of 5 in run 32190197188 after a required-label selector
# fix. Nothing about that transfers automatically: Android reports only on-screen nodes in its
# accessibility hierarchy, where iOS also reports frames scrolled outside the ScrollView clip, so
# viewport assumptions that passed on iOS can genuinely fail here. Judge this run on its own
# evidence.
#
# KNOWN COVERAGE LIMITATION, carried forward unchanged and deliberately NOT closed here:
#   option-substitution-call        — exercised
#   option-substitution-substitute  — NOT runtime-certified
#   option-substitution-skip        — NOT runtime-certified
#
# Marker/cleanup are carried in full rather than shared, matching every other runner in this
# directory. Grocery creates no booking on the certified path (it stops at Address), but the
# cleanup is kept so that remains true by construction rather than by luck.
#
# Requires: `maestro` and `adb` on PATH, a booted Android emulator with ke.co.hiredcorp.kwikserve
# installed, node, and QA_* credentials in the environment.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
# SDVA16GR- (Android) so this can never collide with, or clean up after, the iOS SDV16GR- runner.
MARKER="SDVA16GR-$(date +%s)"

echo "::group::Android Grocery Service Details flow — marker $MARKER"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

# Read `count` out of a backend.mjs JSON response. jq is unavailable here; node is not optional.
count_of() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(String(JSON.parse(s).count))})'; }

# ── Device resolution ─────────────────────────────────────────────────────────
DEVICE="${ANDROID_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(adb devices | awk '$2=="device" {print $1}' | tr -d '\r')
  [ "$(printf '%s\n' "$DEVICE" | grep -c .)" = "1" ] || {
    echo "FAIL: expected exactly one attached Android device (or set ANDROID_DEVICE), got:"; adb devices; exit 1; }
fi
echo "device: $DEVICE"

APP_ID="ke.co.hiredcorp.kwikserve"
adb -s "$DEVICE" shell pm list packages 2>/dev/null | tr -d '\r' | grep -qx "package:$APP_ID" || {
  echo "FAIL: $APP_ID is not installed on $DEVICE"; exit 1; }
# MSYS_NO_PATHCONV: Git Bash rewrites the /data argument into a Windows path before adb sees it.
echo "storage before: $(MSYS_NO_PATHCONV=1 adb -s "$DEVICE" shell df /data | tail -1 | tr -d '\r')"

cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual: $($BE find "$MARKER" | count_of)"
  echo "storage after: $(MSYS_NO_PATHCONV=1 adb -s "$DEVICE" shell df /data | tail -1 | tr -d '\r')"
  echo "::endgroup::"
}
trap cleanup EXIT

echo "== service-details-grocery.yaml =="
maestro --platform android --device "$DEVICE" test "$FLOWS/service-details-grocery.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD"

echo "== ANDROID GROCERY SERVICE DETAILS FLOW PASSED (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT

#!/usr/bin/env bash
#
# Service Details V1.6 — Android emulator orchestration for the CORE Service Details flows.
#
# The Android counterpart of ios-service-details.sh, with the same contract and the same two
# groups:
#   1. READ-ONLY flows. They stop at the Address step and never tap Place Booking, so they create
#      NO QA data and need no cleanup. Safe to run repeatedly.
#   2. The distinct-duplicate flow, which DOES create two bookings and is therefore marker-scoped
#      and cleaned up on exit.
#
# Grocery is deliberately NOT here, mirroring the iOS split: it is the longest form in the suite
# and runs separately so it can never block independent evidence.
#
# Two deliberate differences from the iOS runner, both forced by the environment rather than by
# choice, and neither weakening the contract:
#   - Marker prefix is SDVA- (Android) so a run can never be confused with, or clean up after, an
#     iOS SDV15- run against the same QA project.
#   - JSON is parsed with node, not jq. jq is not present on this Windows machine; node is, and is
#     already a hard dependency via backend.mjs.
#
# This runner is LOCAL: it targets a booted Android emulator on the developer machine. There is no
# GitHub Actions Android workflow.
#
# Requires: `maestro` and `adb` on PATH, a booted Android emulator with ke.co.hiredcorp.kwikserve
# installed, node, and QA_* credentials in the environment (same five as the iOS runners).
#
# IMPORTANT: the installed APK must actually contain the Service Details implementation. Android
# build c59c7ac1 (commit 444a9d9) does NOT — it predates the feature entirely, and these flows will
# fail at "Step 1 of 5" against it. Use a build from a commit that carries src/constants/service-forms.ts.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
MARKER="SDVA-$(date +%s)"

echo "::group::Core Service Details flows on Android — marker $MARKER"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

# Read `count` out of a backend.mjs JSON response. jq is unavailable here; node is not optional.
count_of() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(String(JSON.parse(s).count))})'; }

# ── Device resolution ─────────────────────────────────────────────────────────
# Resolve explicitly rather than letting Maestro guess: a second emulator or a plugged-in phone
# would otherwise make the target ambiguous, and a certification run must know what it ran on.
DEVICE="${ANDROID_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(adb devices | awk '$2=="device" {print $1}' | tr -d '\r')
  [ "$(printf '%s\n' "$DEVICE" | grep -c .)" = "1" ] || {
    echo "FAIL: expected exactly one attached Android device, got:"; adb devices; exit 1; }
fi
echo "device: $DEVICE"

APP_ID="ke.co.hiredcorp.kwikserve"
adb -s "$DEVICE" shell pm list packages 2>/dev/null | tr -d '\r' | grep -qx "package:$APP_ID" || {
  echo "FAIL: $APP_ID is not installed on $DEVICE"; exit 1; }
echo "android: $(adb -s "$DEVICE" shell getprop ro.build.version.release | tr -d '\r') (API $(adb -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r')) $(adb -s "$DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r')"
# MSYS_NO_PATHCONV: Git Bash rewrites the /data argument into a Windows path before adb sees it,
# so the device-side df reads C:/Program Files/Git/data and fails. Storage reporting only.
echo "storage before: $(MSYS_NO_PATHCONV=1 adb -s "$DEVICE" shell df /data | tail -1 | tr -d '\r')"

cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual: $($BE find "$MARKER" | count_of)"
  echo "storage after: $(MSYS_NO_PATHCONV=1 adb -s "$DEVICE" shell df /data | tail -1 | tr -d '\r')"
  echo "::endgroup::"
}
trap cleanup EXIT

run() { # $1 = flow file (read-only; no marker needed)
  echo "== $1 =="
  maestro --platform android --device "$DEVICE" test "$FLOWS/$1" \
    -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD"
}

# ── 1. Read-only Service Details coverage ─────────────────────────────────────
run service-details-house-cleaning.yaml
run service-details-massage.yaml
run service-details-towing-safety.yaml
run service-details-address-back.yaml

# ── 2. Duplicate warning must NOT fire for a different primary request ────────
echo "== booking-duplicate-distinct.yaml =="
maestro --platform android --device "$DEVICE" test "$FLOWS/booking-duplicate-distinct.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e MARKER="$MARKER"

# Both bookings must exist: the second was created WITHOUT the customer confirming a warning.
CNT=$($BE find "$MARKER" | count_of)
echo "bookings created with marker: $CNT"
[ "$CNT" = "2" ] || { echo "FAIL: expected 2 bookings (standard + laundry), got $CNT"; exit 1; }

echo "== ALL CORE SERVICE DETAILS FLOWS PASSED ON ANDROID (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT

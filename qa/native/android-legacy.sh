#!/usr/bin/env bash
#
# Service Details V1.6 — Android emulator orchestration for the LEGACY NON-PUSH regressions.
#
# Android counterpart of ios-notif-refresh.sh + ios-booking-duplicate.sh plus the address journey
# (which has never had a runner on either platform — the iOS workflow invokes it inline). Grouped
# into one runner because they share a device, a login and a cleanup boundary.
#
# NON-PUSH BY CONSTRUCTION. The Android APK under test (build bd6c51a5) was built WITHOUT
# GOOGLE_SERVICES_JSON, so it has no FCM configuration. Nothing here touches push:
#   - notification refresh certifies the IN-APP notification list only — rows are seeded through
#     the QA service role and the screen is asserted to load them on mount and surface a
#     mid-session row on pull-to-refresh.
#   - it does NOT assert FCM token registration, push delivery, terminated/background push, push
#     tap routing, or a physical banner. Those are physical-device concerns and remain uncertified.
# Do not add a push claim to this runner without a push-capable build.
#
# Requires: `maestro` and `adb` on PATH, a booted Android emulator with ke.co.hiredcorp.kwikserve
# installed, node, and QA_* credentials in the environment.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
STAMP="$(date +%s)"
# Android-distinct marker/titles so a run can never collide with, or clean up after, the iOS
# runners (P4E2DUP-, "QA Initial ...") against the shared QA project.
MARKER="P4E2DUPA-$STAMP"
TITLE_INIT="QA-A Initial $STAMP"
TITLE_REFRESH="QA-A Refresh $STAMP"
BODY_INIT="Seeded before the screen mounted ($STAMP)"
BODY_REFRESH="Created mid-session; must appear via pull-to-refresh ($STAMP)"

echo "::group::Android legacy non-push regressions — stamp $STAMP marker $MARKER"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD; do req "$v"; done

# Read a dotted path out of a backend.mjs JSON response. jq is not present on this Windows host;
# node already is, via backend.mjs itself.
jval() { node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let v=JSON.parse(s);
  for (const k of process.argv[1].split(".")) {
    if (!k) continue;
    const m=/^([A-Za-z_]+)\[(\d+)\]$/.exec(k);
    v = m ? (v?.[m[1]]||[])[+m[2]] : v?.[k];
    if (v===undefined || v===null) { v=null; break; }
  }
  process.stdout.write(v===null||v===undefined?"null":String(v));
})' "$1"; }

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
  echo "::group::Cleanup (stamp $STAMP marker $MARKER)"
  $BE notif-clean customer "$TITLE_INIT"    || echo "notif cleanup A error (non-fatal)"
  $BE notif-clean customer "$TITLE_REFRESH" || echo "notif cleanup B error (non-fatal)"
  $BE cleanup "$MARKER" || echo "booking cleanup error (non-fatal)"
  echo "residual bookings: $($BE find "$MARKER" | jval 'count')"
  echo "storage after: $(MSYS_NO_PATHCONV=1 adb -s "$DEVICE" shell df /data | tail -1 | tr -d '\r')"
  echo "::endgroup::"
}
trap cleanup EXIT

mt() { maestro --platform android --device "$DEVICE" test "$@"; }

# ── 1. Notification-center refresh (IN-APP ONLY, no push) ─────────────────────
# The `|| true` below is on the idempotent PRE-clean, never on a certification command: it removes
# rows a prior aborted run may have left under the same titles.
$BE notif-clean customer "$TITLE_INIT"    >/dev/null || true
$BE notif-clean customer "$TITLE_REFRESH" >/dev/null || true

echo "== [1] Seed initial notification =="
$BE notify customer "$TITLE_INIT" "$BODY_INIT" >/dev/null
echo "seeded: $TITLE_INIT"

echo "== [2] Flow A: login + Notifications initial load =="
mt "$FLOWS/notifications-refresh-a.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" \
  -e TITLE_INIT="$TITLE_INIT" -e TITLE_REFRESH="$TITLE_REFRESH"

echo "== [3] Seed refresh notification (after mount) =="
$BE notify customer "$TITLE_REFRESH" "$BODY_REFRESH" >/dev/null
echo "seeded: $TITLE_REFRESH"

echo "== [4] Flow B: pull-to-refresh (same running session) =="
mt "$FLOWS/notifications-refresh-b.yaml" \
  -e TITLE_INIT="$TITLE_INIT" -e TITLE_REFRESH="$TITLE_REFRESH"

echo "== [5] Verify no duplicate notification rows =="
CI_COUNT=$($BE notif-count customer "$TITLE_INIT"    | jval 'count')
CR_COUNT=$($BE notif-count customer "$TITLE_REFRESH" | jval 'count')
echo "row counts: initial=$CI_COUNT refresh=$CR_COUNT"
[ "$CI_COUNT" = "1" ] || { echo "FAIL: expected exactly 1 initial row, got $CI_COUNT"; exit 1; }
[ "$CR_COUNT" = "1" ] || { echo "FAIL: expected exactly 1 refresh row, got $CR_COUNT"; exit 1; }

# ── 2. Delivery-address journey (read-only: stops at Review, places nothing) ───
echo "== [6] address-journey.yaml =="
mt "$FLOWS/address-journey.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD"

# ── 3. Duplicate warning + idempotency (creates TWO bookings under $MARKER) ────
echo "== [7] booking-duplicate.yaml =="
mt "$FLOWS/booking-duplicate.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e MARKER="$MARKER"

# Both bookings must exist: A (first Place Booking) + B ("Book another anyway").
CNT=$($BE find "$MARKER" | jval 'count')
echo "bookings created with marker: $CNT"
[ "$CNT" = "2" ] || { echo "FAIL: expected 2 bookings (A + Book Anyway), got $CNT"; exit 1; }

echo "== ALL ANDROID LEGACY NON-PUSH REGRESSIONS PASSED (stamp $STAMP marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT

#!/usr/bin/env bash
#
# Service Details V1.6 — Android emulator orchestration for the Phase 3F customer/provider
# journeys. Android counterpart of ios-journeys.sh, preserving every stage and every backend
# assertion.
#
# The QA backend is used for setup-verification, the admin-API assignment prerequisite, and
# cleanup — never for the behaviour under test, which is driven entirely through the UI.
#
# NON-PUSH. This APK has no FCM configuration; nothing here asserts push. The customer review
# stage exercises the in-app review form only.
#
# Requires: `maestro` and `adb` on PATH, a booted Android emulator with ke.co.hiredcorp.kwikserve
# installed, node, and QA_* + provider/customer credentials in the environment. Credentials are
# read from the environment and passed to Maestro via -e; never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"
BE="node qa/native/backend.mjs"
# P3HA- (Android) so this can never collide with, or clean up after, an iOS P3H- run against the
# shared QA project.
MARKER="P3HA-$(date +%s)"

echo "::group::Android Phase 3F journeys — marker $MARKER"

# Read a dotted path out of a backend.mjs JSON response. jq is not present on this Windows host;
# node already is, via backend.mjs itself. Supports `a.b`, `a[0].b`, and returns "null" for misses
# so the string comparisons below behave exactly as the jq -r versions did.
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

req() { : "${!1:?Missing required env var $1}"; }
for v in QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SERVICE_ROLE_KEY \
         QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD QA_PROVIDER1_EMAIL QA_PROVIDER1_PASSWORD; do req "$v"; done

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

# Always attempt cleanup, even on failure. Deleting the booking removes its review too.
cleanup() {
  echo "::group::Cleanup (marker $MARKER)"
  $BE cleanup "$MARKER" || echo "cleanup error (non-fatal)"
  echo "residual bookings: $($BE find "$MARKER" | jval 'count')"
  echo "storage after: $(MSYS_NO_PATHCONV=1 adb -s "$DEVICE" shell df /data | tail -1 | tr -d '\r')"
  echo "::endgroup::"
}
trap cleanup EXIT

mt() { maestro --platform android --device "$DEVICE" test "$@"; }

# ── 1. Customer journey: create the booking through the Android UI ────────────
echo "== [1] Customer journey (create booking via UI) =="
mt "$FLOWS/customer-journey.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e MARKER="$MARKER"

# ── 2. Backend verify: exactly one booking, correct fields ────────────────────
echo "== [2] Backend verify booking =="
FIND=$($BE find "$MARKER")
COUNT=$(printf '%s' "$FIND" | jval 'count')
[ "$COUNT" = "1" ] || { echo "FAIL: expected 1 booking, got $COUNT"; exit 1; }
BID=$(printf '%s' "$FIND" | jval 'bookings[0].id')
echo "  booking=$BID service=$(printf '%s' "$FIND" | jval 'bookings[0].service_id') status=$(printf '%s' "$FIND" | jval 'bookings[0].status') assigned=$(printf '%s' "$FIND" | jval 'bookings[0].assigned_provider_id')"
[ "$(printf '%s' "$FIND" | jval 'bookings[0].service_id')" = "house-cleaning" ] || { echo "FAIL: wrong service"; exit 1; }
[ "$(printf '%s' "$FIND" | jval 'bookings[0].status')" = "pending" ] || { echo "FAIL: expected pending"; exit 1; }
[ "$(printf '%s' "$FIND" | jval 'bookings[0].assigned_provider_id')" = "null" ] || { echo "FAIL: should be unassigned"; exit 1; }

# ── 3. Assignment prerequisite (certified admin connected-helper API) ─────────
echo "== [3] Assign to Provider One (admin API setup, not a new admin cert) =="
P1=$($BE provider-id provider1)
PID=$(printf '%s' "$P1" | jval 'id')
PNAME=$(printf '%s' "$P1" | jval 'full_name')
PPHONE=$(printf '%s' "$P1" | jval 'phone'); [ "$PPHONE" = "null" ] && PPHONE=""
$BE assign "$BID" "$PID" "$PNAME" "$PPHONE" >/dev/null
[ "$($BE read "$BID" | jval 'status')" = "provider_assigned" ] || { echo "FAIL: assignment"; exit 1; }
echo "  assigned to $PID"

# ── 4. Provider progression through the Android UI (verify each state) ────────
echo "== [4] Provider status progression (UI + backend) =="
advance() { # $1 = button label, $2 = expected backend status
  mt "$FLOWS/provider-advance.yaml" \
    -e PROV_EMAIL="$QA_PROVIDER1_EMAIL" -e PROV_PW="$QA_PROVIDER1_PASSWORD" -e NEXT="$1"
  sleep 6
  local st ap
  st=$($BE read "$BID" | jval 'status')
  ap=$($BE read "$BID" | jval 'assigned_provider_id')
  echo "   after '$1': status=$st assigned=$ap"
  [ "$st" = "$2" ] || { echo "FAIL: expected $2, got $st"; exit 1; }
  [ "$ap" = "$PID" ] || { echo "FAIL: assigned_provider_id changed"; exit 1; }
}
advance "On the way"  on_the_way
advance "In progress" in_progress
advance "Completed"   completed

# ── 5. Customer completion + review through the Android UI ────────────────────
echo "== [5] Customer review (via UI) =="
mt "$FLOWS/customer-review.yaml" \
  -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD" -e COMMENT="P3HA-review-$MARKER"
sleep 4
REV=$($BE review "$BID")
echo "  reviews=$(printf '%s' "$REV" | jval 'count') rating=$(printf '%s' "$REV" | jval 'reviews[0].rating')"
[ "$(printf '%s' "$REV" | jval 'count')" = "1" ] || { echo "FAIL: expected 1 review"; exit 1; }
[ "$(printf '%s' "$REV" | jval 'reviews[0].rating')" = "5" ] || { echo "FAIL: expected rating 5"; exit 1; }
AGG=$($BE provider-rating "$PID")
echo "  provider review_count=$(printf '%s' "$AGG" | jval 'review_count')"
[ "$(printf '%s' "$AGG" | jval 'review_count')" = "1" ] || { echo "FAIL: review_count not 1"; exit 1; }

echo "== ALL ANDROID PHASE 3F JOURNEYS PASSED (marker $MARKER) =="
echo "::endgroup::"
# cleanup runs on EXIT (trap)

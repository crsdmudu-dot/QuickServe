#!/usr/bin/env bash
#
# Item M — focused iOS Simulator gate for the kwikserve:// deep-link scheme (commit 060df7e).
#
# WHAT THIS GATE CAN AND CANNOT CERTIFY — read before interpreting a pass.
#
#   CAN:  kwikserve:// is registered in the native artifact and routes into the app; expo-router
#         resolves /admin from it; the J guard REFUSES a customer session and ADMITS an admin;
#         the retained quickserve:// scheme still routes (backward compatibility).
#
#   CANNOT: anything about the legacy-app collision. The simulator has ONLY KwikServe installed,
#         so quickserve:// is UNCONTESTED here and item M cannot even arise, let alone be proven
#         resolved. Only a physical device holding BOTH apps can demonstrate that. A green run
#         here does NOT close item M and does NOT make quickserve:// unambiguous anywhere.
#
# All three flows are READ-ONLY. Nothing is placed, nothing is mutated, and no admin control is
# tapped — so unlike the Service Details runners there is no marker and no cleanup trap, because
# there is no QA data to clean up. If a future edit adds a booking or an admin write here, it must
# also add marker scoping and cleanup; do not let this stay trap-less by accident.
#
# The auto-generated ke.co.hiredcorp.kwikserve:// scheme is deliberately NOT covered. It is an
# Expo-generated alternate entry point, not one we authored, and the J guard is scheme-agnostic —
# it operates on the resolved route after expo-router parses the URL, identically for every
# scheme. A per-scheme test would add zero guard coverage while pinning third-party generated
# behaviour we neither chose nor control.
#
# Requires: `maestro` on PATH, a booted iOS simulator with ke.co.hiredcorp.kwikserve installed
# from the intended build, and QA_* credentials in the environment.
#
# IMPORTANT: the installed artifact must actually contain the dual-scheme registration. Running
# this against a build older than 060df7e proves nothing — S1 and S3 will fail to route at all.
set -euo pipefail
cd "$(dirname "$0")/../.."

FLOWS="qa/native/flows"

echo "::group::Item M — kwikserve:// focused scheme gate"
req() { : "${!1:?Missing required env var $1}"; }
for v in QA_CUSTOMER_EMAIL QA_CUSTOMER_PASSWORD QA_ADMIN_EMAIL QA_ADMIN_PASSWORD; do req "$v"; done

cust() { # $1 = flow file needing a customer session
  echo "== $1 =="
  maestro test "$FLOWS/$1" -e CUST_EMAIL="$QA_CUSTOMER_EMAIL" -e CUST_PW="$QA_CUSTOMER_PASSWORD"
}

admin() { # $1 = flow file needing an admin session
  echo "== $1 =="
  maestro test "$FLOWS/$1" -e ADMIN_EMAIL="$QA_ADMIN_EMAIL" -e ADMIN_PW="$QA_ADMIN_PASSWORD"
}

# S1 first: it is the check Phase 7B could not execute, and the reason this gate exists.
cust item-m-customer-rejection.yaml

# S2: proves the retained legacy scheme still routes. Routing evidence ONLY — see header.
cust item-m-scheme-compat.yaml

# S3: admission through the same new scheme, so S1 cannot be explained by the scheme
# routing nowhere at all.
admin item-m-admin-admission.yaml

echo "== ITEM M FOCUSED SCHEME GATE PASSED =="
echo "== NOTE: registration/routing/guard only — item M remains NOT CLOSED =="
echo "::endgroup::"

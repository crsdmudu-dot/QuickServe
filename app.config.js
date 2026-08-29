// app.config.js — dynamic Expo config (Phase 4E.1).
//
// Base configuration still lives in app.json; Expo reads it first and passes it
// here as `config`. The ONLY thing this file adds is the Android FCM client file
// (google-services.json) for push notifications, resolved from — in priority order:
//
//   1. process.env.GOOGLE_SERVICES_JSON — set by EAS at build time from the
//      file-type environment variable on the `preview`/QA environment. EAS writes
//      the uploaded google-services.json to a temp path and exposes that PATH here.
//   2. ./google-services.json — a local copy (git-ignored) for local Android builds.
//   3. undefined — when neither exists (CI, web export, other devs). In that case
//      `googleServicesFile` is left unset so nothing changes from app.json alone
//      and no "file not found" error is raised.
//
// The file is never committed (see .gitignore); it reaches EAS only through the
// GOOGLE_SERVICES_JSON file env var.
//
// PRODUCTION FAIL-LOUD GUARD.
// Case 3 above is deliberate tolerance, and it is correct for web export, local dev
// and any machine without the file — but it is WRONG for a release build. A
// production build that resolves no Firebase config still succeeds, installs and
// launches looking completely healthy, while push notifications are dead:
// getExpoPushTokenAsync fails and src/lib/push.ts returns null by design (correct
// for Expo Go, but it also masks a real misconfiguration). Nothing surfaces the
// problem until someone manually tests push on a device after release.
//
// So on the `production` EAS build profile ONLY, this file validates instead of
// tolerating. It checks the resolved file actually EXISTS — not merely that the env
// var is a non-empty string — and that it identifies the approved Firebase project
// and carries the production Android package. Those two identity checks convert the
// other silent failure (right file shape, wrong project) into a build-time error.
//
// The project id and package below are production INVARIANTS, not secrets: they are
// the same values already committed in app.json and the QA phase reports. No API
// key, OAuth client id or file content is read into the error path or printed.
const fs = require('fs');

/** Production Firebase invariants — see docs/qa/PHASE-5E and PHASE-7A. */
const PROD_FIREBASE_PROJECT_ID = 'quickserve-1bfa9';
const PROD_ANDROID_PACKAGE = 'ke.co.hiredcorp.kwikserve';

/**
 * Fail the build unless `file` is a readable google-services.json for the approved
 * production Firebase project and Android package.
 *
 * Throws with a classification only — never the file's contents.
 */
function assertProductionFirebaseConfig(file) {
  if (!file) {
    throw new Error(
      'production Firebase config missing: neither GOOGLE_SERVICES_JSON nor ./google-services.json resolved. ' +
        'Set the GOOGLE_SERVICES_JSON file variable on the EAS production environment.',
    );
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      'production Firebase config missing: the resolved google-services.json path does not exist. ' +
        'GOOGLE_SERVICES_JSON must point at a real file at config-evaluation time.',
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // Deliberately does not echo the parser message: it can quote file content.
    throw new Error('production Firebase config unreadable/invalid JSON.');
  }

  const projectId = parsed && parsed.project_info && parsed.project_info.project_id;
  if (projectId !== PROD_FIREBASE_PROJECT_ID) {
    throw new Error(
      `Firebase project mismatch: expected ${PROD_FIREBASE_PROJECT_ID}, got ${
        projectId ? String(projectId) : '(none)'
      }.`,
    );
  }

  const packages = Array.isArray(parsed.client)
    ? parsed.client.map(
        (c) =>
          c &&
          c.client_info &&
          c.client_info.android_client_info &&
          c.client_info.android_client_info.package_name,
      )
    : [];
  if (!packages.includes(PROD_ANDROID_PACKAGE)) {
    throw new Error(
      `Firebase Android package mismatch: no client for ${PROD_ANDROID_PACKAGE} in the resolved config.`,
    );
  }
}

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);

  // Release builds validate; every other profile keeps the tolerant behaviour above.
  //
  // Prefix match, not equality. An exact `=== 'production'` check silently skipped the guard for
  // `production-internal` — a profile that extends `production`, uses the production environment
  // and the production Supabase backend, and therefore needs the Firebase check just as much. A
  // production-connected build must not lose this protection because its profile has a different
  // name. Every `production*` profile is enforced.
  //
  // Residual gap, deliberately accepted for now: a future production-connected profile named
  // without that prefix (say `store-candidate`) would still bypass this. Keying on the resolved
  // environment instead of the profile name would close it — the production env vars are provably
  // loaded at config-evaluation time — and is the right change when such a profile is added.
  if ((process.env.EAS_BUILD_PROFILE ?? '').startsWith('production')) {
    assertProductionFirebaseConfig(googleServicesFile);
  }

  if (googleServicesFile) {
    config.android = { ...(config.android || {}), googleServicesFile };
  }

  return config;
};

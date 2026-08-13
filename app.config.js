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
const fs = require('fs');

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);

  if (googleServicesFile) {
    config.android = { ...(config.android || {}), googleServicesFile };
  }

  return config;
};

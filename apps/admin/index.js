// index.js — entry point for the admin application.
//
// WHY THIS FILE EXISTS. `main` used to be "expo-router/entry" directly, exactly as the consumer
// app declares it. That works at the repository root, where node_modules sits inside the project
// root, but it cannot work here: the admin project root is apps/admin and the install is hoisted,
// so the entry resolves to <repo>/node_modules/expo-router/entry.js — OUTSIDE the project root.
//
// Expo's web dev server emits the entry as a root-relative script URL, which then becomes
//
//     /../../node_modules/expo-router/entry.bundle
//
// and a browser normalises that to /node_modules/expo-router/entry.bundle, silently dropping the
// "../../". Metro resolves the normalised path against the project root, looks for
// apps/admin/node_modules/expo-router/entry, does not find it, and answers 404 with a JSON
// UnableToResolveError. The browser refuses to execute a script served as application/json, so
// the page stops at "Bundling..." and no React tree ever mounts — every locator on /login then
// times out, with no clue that the application never rendered.
//
// Re-exporting the entry from a file INSIDE the project root keeps the emitted URL relative
// (/index.bundle), so no path escape is needed and nothing is lost to normalisation. Metro still
// resolves expo-router itself through resolver.nodeModulesPaths in metro.config.js.
import 'expo-router/entry';

// metro.config.js — KwikServe Admin (web-only Expo Router app).
//
// The admin application owns its routes (apps/admin/src/app) and its admin-only components
// (apps/admin/src/components), and REUSES the repository's shared layer (src/lib, src/hooks,
// src/constants, src/components/ui, src/auth, src/services) rather than copying it. Metro
// therefore has to watch the repository root and resolve two aliases:
//
//   @admin/*  -> apps/admin/src/*   (admin-only code)
//   @/*       -> <repo>/src/*       (shared layer)
//
// The consumer app is unaffected: it has no import edge into apps/admin, so none of this code
// can reach the Android/iOS bundle.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the repository root so the shared layer is part of this app's graph.
config.watchFolders = [repoRoot];

// Resolve packages from the repository's single node_modules install.
config.resolver.nodeModulesPaths = [path.resolve(repoRoot, 'node_modules')];

config.resolver.alias = {
  ...(config.resolver.alias ?? {}),
  '@admin': path.resolve(projectRoot, 'src'),
  '@': path.resolve(repoRoot, 'src'),
};

// Keep the isolated QA workspace and the marketing site out of the admin graph; without this
// Metro crawls the whole repository and can mis-resolve the entry.
//
// The consumer route tree needs no block: Expo Router enumerates routes with a require.context
// rooted at THIS project (apps/admin/src/app), so <repo>/src/app is never treated as routes here.
// A path-based block on "src/app" would also match this app's own routes.
const block = [/[\\/]qa[\\/].*/, /[\\/]apps[\\/]website[\\/].*/];
const prev = config.resolver.blockList;
config.resolver.blockList = Array.isArray(prev) ? [...prev, ...block] : prev ? [prev, ...block] : block;

module.exports = config;

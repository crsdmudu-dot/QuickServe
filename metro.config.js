// metro.config.js — Expo default Metro config, with the isolated QA workspace
// (`qa/`, a standalone package with its own node_modules) excluded from the app
// bundle graph. Without this, Metro crawls `qa/` and mis-resolves the app entry
// during `expo export`. Build-tool exclusion only — changes no application
// behaviour (mirrors the additive `qa` exclusions in jest.config.js / tsconfig.json).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Block the top-level `qa/` workspace (any OS separator) from Metro's graph.
const qaBlock = /[\\/]qa[\\/].*/;
const prev = config.resolver.blockList;
config.resolver.blockList = Array.isArray(prev)
  ? [...prev, qaBlock]
  : prev
    ? [prev, qaBlock]
    : qaBlock;

module.exports = config;

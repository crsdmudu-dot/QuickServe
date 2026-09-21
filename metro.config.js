// metro.config.js — Expo default Metro config for the CONSUMER application, with sibling
// workspaces excluded from the bundle graph:
//
//   qa/          a standalone package with its own node_modules. Without this, Metro crawls it
//                and mis-resolves the app entry during `expo export`.
//   apps/admin/  the separated administrative web application. It has its own Metro config and
//                its own route tree; nothing in src/app imports it, so it is already unreachable.
//                Blocking it is belt-and-braces so administrative code can never be pulled into
//                an Android/iOS bundle by an accidental import.
//
// Build-tool exclusion only — changes no application behaviour (mirrors the additive exclusions
// in jest.config.js / tsconfig.json).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const qaBlock = /[\\/]qa[\\/].*/;
const adminAppBlock = /[\\/]apps[\\/]admin[\\/].*/;
const prev = config.resolver.blockList;
config.resolver.blockList = Array.isArray(prev)
  ? [...prev, qaBlock, adminAppBlock]
  : prev
    ? [prev, qaBlock, adminAppBlock]
    : [qaBlock, adminAppBlock];

module.exports = config;

// Metro monorepo config. Since SDK 52, expo/metro-config detects the pnpm workspace and watches the
// repo root, so @kummie/core, @kummie/brand, @kummie/i18n and data/seed resolve without extra options.
// Do not add watchFolders / extraNodeModules / disableHierarchicalLookup (pre-SDK 52 setup).
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);

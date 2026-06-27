// babel.config.js
// Extends babel-preset-expo and ensures dynamic import() is transformed to
// require() in the Jest (CommonJS) environment, so jest.mock() can intercept
// the module (otherwise Jest throws ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG).
//
// In Metro (bundler: 'metro') dynamic imports are handled natively — this plugin
// is a no-op there because the file marker is only consumed by
// @babel/plugin-transform-modules-commonjs when it runs in CJS mode.

// A tiny marker plugin that registers "@babel/plugin-proposal-dynamic-import"
// on the Babel file object. @babel/plugin-transform-modules-commonjs checks for
// this marker before converting import() → Promise.resolve().then(()=>require()).
const markDynamicImportPlugin = {
  name: 'mark-dynamic-import',
  pre(file) {
    file.set('@babel/plugin-proposal-dynamic-import', true);
  },
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [markDynamicImportPlugin],
  };
};

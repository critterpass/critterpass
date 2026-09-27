// Metro/Babel load this file as CommonJS, so it must use require()/module.exports regardless of the
// repo's ESM convention (matches metro.config.js's own comment for the same reason).
const path = require('node:path');

const { getConfig } = require('@lingui/conf');

module.exports = function (api) {
  api.cache(true);
  // Read directly instead of api.env('test'): Jest calls this function more than once per process
  // (once for its own cache-key computation, once to actually transform), and Babel's api.cache.using
  // rejects being invoked from more than one of those calls ("Cannot change caching after evaluation
  // has completed"). process.env.NODE_ENV is stable for the whole process either way (Metro and Jest
  // never share one), so api.cache(true) — cache for this process's lifetime — stays correct.
  const isTest = process.env.NODE_ENV === 'test';
  // The babel plugin's own config auto-discovery searches from this file's cwd, which never finds
  // packages/i18n/lingui.config.ts (a different package); pass it explicitly instead.
  const linguiConfig = getConfig({ cwd: path.resolve(__dirname, '../../packages/i18n') });
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Compiles `t`/`Trans`/`plural`/`select` macros (imported from `@lingui/core/macro` and
      // `@lingui/react/macro`) into plain `i18n._`/`Trans` calls. `descriptorFields: 'message'`
      // overrides the plugin's production default (id-only): the design's missing-translation
      // fallback relies on the call site's own `message` staying in the compiled bundle so a
      // not-yet-translated locale shows English instead of a raw id (docs/code-standards.md §8).
      ['@lingui/babel-plugin-lingui-macro', { descriptorFields: 'message', linguiConfig }],
      // Metro (and real browsers/Node) run `import()` natively; Jest's CommonJS runtime cannot
      // without the (test-runner-wide) `--experimental-vm-modules` flag, which this app does not
      // set. Rewriting dynamic imports to a Jest-compatible form only for the test env, so
      // Metro/production builds keep the real, native `import()` this package's catalog registry
      // (packages/i18n/src/catalog-registry/) relies on.
      ...(isTest ? ['babel-plugin-dynamic-import-node'] : []),
    ],
  };
};

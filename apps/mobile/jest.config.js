// Jest loads this file as CommonJS: the app package keeps Node's default module type for Metro and Babel.
// Loaded directly (rather than `preset: 'jest-expo'`) so its `transform`/`transformIgnorePatterns`
// can be extended below instead of replaced outright.
const jestExpoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...jestExpoPreset,
  moduleNameMapper: {
    ...jestExpoPreset.moduleNameMapper,
    // react-native's "exports" map only exposes "react-native/asset-registry", while the Jest preset maps
    // to the pre-exports path relative to the requesting file, which pnpm's isolated node_modules cannot
    // satisfy; point the mapper at the resolved file instead.
    '^react-native/asset-registry$': require.resolve('react-native/asset-registry'),
    // Workspace packages (e.g. @cp/i18n) export their TypeScript source directly and, per this
    // repo's convention, import their own siblings with an explicit ".js" extension so bundlers
    // (Metro, Vite/Vitest, tsx) resolve it to the ".ts" file. Jest's resolver does not do that
    // mapping itself, so a relative "./x.js" import fails to resolve at all when Jest loads such a
    // package's source directly; strip the extension and let Jest's own moduleFileExtensions try
    // ".ts" next.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    ...jestExpoPreset.transform,
    // @lingui/core and @lingui/react ship ESM-only `.mjs` builds ("type": "module", no CommonJS
    // build); the preset's own babel-jest entry only matches `.js`/`.jsx`/`.ts`/`.tsx`, so `.mjs`
    // files have no transformer registered at all, even once transformIgnorePatterns (below) stops
    // treating them as an ignored third-party dependency. Reuses the exact babel-jest transformer
    // and options the preset already resolved, rather than reconstructing them.
    '\\.mjs$': jestExpoPreset.transform['\\.[jt]sx?$'],
  },
  transformIgnorePatterns: jestExpoPreset.transformIgnorePatterns.map((pattern, index) =>
    // Only the first entry is the node_modules allowlist (jest-expo/jest-preset.js); the rest are
    // unrelated exclusions (the reanimated babel plugin, @react-native/babel-preset) left untouched.
    // @messageformat/* is @lingui/core's own ICU parsing dependency, also ESM-only.
    index === 0
      ? pattern.replace('standard-navigation', 'standard-navigation|@lingui|@messageformat')
      : pattern,
  ),
};

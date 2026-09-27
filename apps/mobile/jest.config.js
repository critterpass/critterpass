// Jest loads this file as CommonJS: the app package keeps Node's default module type for Metro and Babel.
// Loaded directly (rather than `preset: 'jest-expo'`) so its `transform`/`transformIgnorePatterns`
// can be extended below instead of replaced outright.
const jestExpoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  ...jestExpoPreset,
  setupFiles: [
    ...jestExpoPreset.setupFiles,
    // The package's own official Jest setup: mocks the native `RNGestureHandlerModule` and wires
    // `fireGestureHandler`'s `DeviceEventEmitter` events to declarative `Gesture.*()` callbacks, so
    // `src/motion/gestures`' hooks run their real Pan/LongPress/Tap logic under Jest.
    require.resolve('react-native-gesture-handler/jestSetup'),
  ],
  moduleNameMapper: {
    ...jestExpoPreset.moduleNameMapper,
    // Reanimated's own shipped `/mock` re-exports several names from its real entry point, which at
    // 4.7.0 unconditionally reaches web/DOM layout-animation code with no native module, `document`
    // or `window.matchMedia` to fall back to under Jest — see reanimated-mock.ts's own comment for
    // the open upstream issue this substitutes for.
    '^react-native-reanimated$': require.resolve('./src/motion/test-support/reanimated-mock.ts'),
    // Worklets' native binding has nothing to load under Jest either; unlike Reanimated's, Worklets'
    // own mock is self-contained (no real-module imports), so it is used as shipped (its own docs,
    // "Mock Implementation (Recommended)").
    '^react-native-worklets$': 'react-native-worklets/src/mock',
    // react-native-mmkv's own `createMMKV` correctly returns an in-memory mock under Jest, but
    // reaching that check means first evaluating an unconditional import of this package, whose real
    // entry point looks up its native HybridObject binding at import time — see
    // nitro-modules-mock.ts's own comment for why an empty stub is enough.
    '^react-native-nitro-modules$':
      require.resolve('./src/motion/test-support/nitro-modules-mock.ts'),
    // expo-audio's real entry point patches `AudioModule.AudioPlayer.prototype` at import time,
    // which needs a native `ExpoAudio` module Jest never registers — see expo-audio-mock.ts's own
    // comment for why a hand-rolled mock (the same class of exception as the Reanimated one above)
    // is used instead of the shipped module.
    '^expo-audio$': require.resolve('./src/motion/test-support/expo-audio-mock.ts'),
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

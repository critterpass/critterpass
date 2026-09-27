// Manual Jest mock for `react-native-nitro-modules`, mapped in this package's `jest.config.js`
// (`moduleNameMapper`). `react-native-mmkv`'s own `createMMKV` correctly returns an in-memory mock
// under Jest (its `isTest()` check) without ever calling into this module — but reaching that check
// means first evaluating `getMMKVFactory.ts`'s unconditional `import { NitroModules } from
// 'react-native-nitro-modules'`, and that package's own real entry point looks up its native
// HybridObject binding at module-evaluation time (same class of problem as Reanimated/Worklets: a
// safe "running under Jest" branch exists deeper in the call graph, but an unconditional import
// above it reaches for a native module first). Nothing here needs to do anything, since the real
// `NitroModules.createHybridObject` this stands in for is never actually called under `isTest()`.
export const NitroModules = {};

import { createRequire } from 'node:module';

import type { Config } from 'jest';

// react-native's package.json "exports" map only exposes the clean "react-native/asset-registry"
// specifier; @react-native/jest-preset still maps to the pre-exports "react-native/src/asset-registry"
// path and resolves it relative to whichever react-native source file requested it, which pnpm's
// isolated node_modules cannot satisfy. Pointing the mapper at the real resolved file sidesteps that.
const require = createRequire(import.meta.url);
const assetRegistryPath = require.resolve('react-native/asset-registry');

const config: Config = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^react-native/asset-registry$': assetRegistryPath,
  },
};

export default config;

// Jest loads this file as CommonJS: the app package keeps Node's default module type for Metro and Babel.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // react-native's "exports" map only exposes "react-native/asset-registry", while the Jest preset maps
    // to the pre-exports path relative to the requesting file, which pnpm's isolated node_modules cannot
    // satisfy; point the mapper at the resolved file instead.
    '^react-native/asset-registry$': require.resolve('react-native/asset-registry'),
  },
};

// Metro loads this file with Node's CommonJS loader, so it must use require()/module.exports
// regardless of the repo's ESM convention.
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
/* eslint-enable @typescript-eslint/no-require-imports */

const config = getDefaultConfig(__dirname);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// docs/system-architecture.md "Dev routes": apps/mobile/src/app/(dev)/** only ever ships in
// non-production builds. Blocking the directory here means expo-router's require.context never
// sees those files when APP_VARIANT=production, so a release bundle cannot include them.
if (process.env.APP_VARIANT === 'production') {
  const devRouteDir = path.join(__dirname, 'src', 'app', '(dev)');
  const devRoutePattern = new RegExp(`^${escapeRegExp(devRouteDir)}`);
  const existingBlockList = config.resolver.blockList;
  const blockList = Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : [];

  config.resolver.blockList = [...blockList, devRoutePattern];
}

module.exports = config;

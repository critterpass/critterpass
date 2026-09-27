// Metro loads this file with Node's CommonJS loader, so it must use require()/module.exports
// regardless of the repo's ESM convention.
const path = require('node:path');

// Sentry's wrapper around Expo's default config adds debug ids to bundles and source maps, so
// errors symbolicate against the exact bundle that ran (embedded or an EAS update).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Metro's (and Expo's) default assetExts recognise `.caf`/`.m4a` but not `.ogg` — @cp/sound-art's
// Android SFX files (docs/decisions/20260927-in-house-procedural-audio.md: Ogg-encapsulated Opus,
// since this environment's ffmpeg build has no libvorbis encoder) would otherwise be treated as an
// unparseable JS source file and fail the bundle rather than being resolved as a binary asset.
config.resolver.assetExts = [...config.resolver.assetExts, 'ogg'];

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

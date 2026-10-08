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

// Inline requires: a module imported by name is evaluated where its export is first used rather
// than when the importing file loads, so screens and feature barrels the first frame never touches
// stay unevaluated at launch. Side-effect imports (`import './x'`) keep running in order. Kept eager
// (on top of Metro's own React/React Native list): the three feature registers the root layout
// imports by name, whose screen registrations must run at launch with the other registers rather
// than when the layout first renders their runtimes, and the i18n root, whose import starts the
// locale load.
const nonInlinedRequires = [
  'React',
  'react',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
  'react-compiler-runtime',
  'react-native',
  '@/features/trip/hub/register',
  '@/features/critters/register',
  '@/features/safety/register',
  '@/lib/i18n/I18nRoot',
];
const getTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = getTransformOptions ? await getTransformOptions(...args) : {};
  return {
    ...options,
    transform: { ...options.transform, inlineRequires: true, nonInlinedRequires },
  };
};

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

  // The app's catalog registry (packages/i18n/src/catalog-registry/index.native.ts) adds the
  // pseudo-locale through `./mobile/pseudo`; a production bundle gets the empty `no-pseudo` instead,
  // so the pseudo-locale's catalogs never ship to the store.
  const registryDir = path.resolve(__dirname, '../../packages/i18n/src/catalog-registry');
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const fromRegistry = path.dirname(context.originModulePath) === registryDir;
    const target =
      fromRegistry && moduleName === './mobile/pseudo' ? './mobile/no-pseudo' : moduleName;
    return resolveRequest
      ? resolveRequest(context, target, platform)
      : context.resolveRequest(context, target, platform);
  };
}

module.exports = config;

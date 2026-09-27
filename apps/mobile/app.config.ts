import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'staging' | 'production';

interface VariantConfig {
  name: string;
  bundleIdentifier: string;
  scheme: string;
}

const EAS_PROJECT_ID = 'c06dadf1-1916-4cf8-8189-f650eaf560ee';
const APPLE_TEAM_ID = 'YFND2EEW8S';

const VARIANTS: Record<AppVariant, VariantConfig> = {
  development: {
    name: 'CritterPass (Dev)',
    bundleIdentifier: 'app.critterpass.dev',
    scheme: 'critterpass-dev',
  },
  staging: {
    name: 'CritterPass (Staging)',
    bundleIdentifier: 'app.critterpass.staging',
    scheme: 'critterpass-staging',
  },
  production: {
    name: 'CritterPass',
    bundleIdentifier: 'app.critterpass',
    scheme: 'critterpass',
  },
};

function resolveVariant(): AppVariant {
  const raw: unknown = process.env.APP_VARIANT;
  if (raw === 'development' || raw === 'staging' || raw === 'production') return raw;
  return 'development';
}

const appVariant = resolveVariant();
const variant = VARIANTS[appVariant];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.name,
  owner: 'critterpass',
  slug: 'critterpass',
  scheme: variant.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    // The `development` variant is what the `e2e-test` EAS build profile ships (eas.json). Cloud
    // Maestro runs reuse the last build whose *native* fingerprint matches, but that build's
    // embedded JS bundle is frozen at build time and the fingerprint ignores JS-only changes — so a
    // JS-only edit would otherwise be tested against stale code. Blocking first launch on an update
    // check (rather than the default deferred/background check) makes a reused e2e-test build load
    // whatever was last published to its channel before the UI renders. `fallbackToCacheTimeout` is
    // generous for an EAS-hosted simulator's network path; on timeout it falls back to the embedded
    // bundle rather than hanging. Staging/production keep expo-updates' default deferred check —
    // this must never block a real user's launch.
    ...(appVariant === 'development'
      ? { checkAutomatically: 'ON_LOAD' as const, fallbackToCacheTimeout: 20000 }
      : {}),
  },
  ios: {
    bundleIdentifier: variant.bundleIdentifier,
    appleTeamId: APPLE_TEAM_ID,
    supportsTablet: false,
    usesAppleSignIn: true,
    entitlements: {
      'com.apple.security.application-groups': ['group.app.critterpass'],
      'keychain-access-groups': ['$(AppIdentifierPrefix)app.critterpass.shared'],
    },
  },
  android: {
    package: variant.bundleIdentifier,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#FFFFFF',
    },
  },
  plugins: [
    'expo-router',
    // Universal Links / App Links for this variant's link hosts (plugins/with-links.ts).
    ['./plugins/with-links', { variant: appVariant }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#FFFFFF',
      },
    ],
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/Archivo-W62-700.ttf',
          './assets/fonts/Archivo-W62-800.ttf',
          './assets/fonts/Archivo-W62-900.ttf',
          './assets/fonts/Archivo-W66-700.ttf',
          './assets/fonts/Archivo-W66-800.ttf',
          './assets/fonts/Archivo-W66-900.ttf',
          './assets/fonts/Archivo-W70-700.ttf',
          './assets/fonts/Archivo-W70-800.ttf',
          './assets/fonts/Archivo-W70-900.ttf',
          './assets/fonts/Archivo-W78-700.ttf',
          './assets/fonts/Archivo-W78-800.ttf',
          './assets/fonts/Archivo-W78-900.ttf',
          './assets/fonts/Archivo-W100-700.ttf',
          './assets/fonts/Archivo-W100-800.ttf',
          './assets/fonts/Archivo-W100-900.ttf',
          './assets/fonts/Geist-400.ttf',
          './assets/fonts/Geist-500.ttf',
          './assets/fonts/Geist-600.ttf',
          './assets/fonts/Geist-700.ttf',
          './assets/fonts/Geist-800.ttf',
          './assets/fonts/GeistMono-400.ttf',
          './assets/fonts/GeistMono-500.ttf',
          './assets/fonts/GeistMono-700.ttf',
          './assets/fonts/Caveat-600.ttf',
          './assets/fonts/Caveat-700.ttf',
          './assets/fonts/NotoSansThai-400.ttf',
          './assets/fonts/NotoSansThai-900.ttf',
        ],
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '26.0' },
        // Expo SDK 58 modules compile against API 37 (also needed to reference MetricStyle behind an
        // SDK_INT check); runtime behaviour still targets API 36.
        android: { compileSdkVersion: 37, targetSdkVersion: 36 },
      },
    ],
    '@bacons/apple-targets',
    // Communication Notifications for the notification service extension (entitlement +
    // NSUserActivityTypes).
    './modules/cp-notifications/plugin/with-communication-notifications',
    '@maplibre/maplibre-react-native',
    'expo-apple-authentication',
    [
      'expo-location',
      {
        // Trip-day While-In-Use session first (system-architecture.md §4 platform-physics table);
        // the spike's own "Always" upgrade flow prompts for this second, separate string only after
        // the user opts in — never requested together (Apple/Play both reject a combined ask).
        locationWhenInUsePermission:
          'CritterPass uses your location during an active trip day to track leave-by timing and nearby critter encounters.',
        locationAlwaysAndWhenInUsePermission:
          'CritterPass can keep tracking a trip day in the background so critter encounters and crew ETAs keep working while your phone is locked.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    'expo-sharing',
    [
      'expo-media-library',
      {
        // Share cards only ever add a new photo (`MediaLibrary.requestPermissionsAsync(true)`,
        // write-only) — never read or delete the camera roll, so only the "add" permission string
        // is set; there is no read-access string to configure.
        savePhotosPermission: 'Critterpass can save a share card to your photos when you tap Save.',
        isAccessMediaLocationEnabled: false,
      },
    ],
    // Last: copies the bake pipeline's generated critter art into the app + every extension target
    // (iOS) and Android res/ once every other plugin's prebuild output exists.
    './plugins/with-critter-art',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    ...config.extra,
    appVariant,
    eas: { projectId: EAS_PROJECT_ID },
  },
});

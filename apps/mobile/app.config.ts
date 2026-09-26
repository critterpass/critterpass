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
    name: 'Critterpass (Dev)',
    bundleIdentifier: 'app.critterpass.dev',
    scheme: 'critterpass-dev',
  },
  staging: {
    name: 'Critterpass (Staging)',
    bundleIdentifier: 'app.critterpass.staging',
    scheme: 'critterpass-staging',
  },
  production: {
    name: 'Critterpass',
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
  },
  ios: {
    bundleIdentifier: variant.bundleIdentifier,
    appleTeamId: APPLE_TEAM_ID,
    supportsTablet: false,
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
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#FFFFFF',
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '26.0' },
        android: { compileSdkVersion: 36, targetSdkVersion: 36 },
      },
    ],
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

/**
 * The device's onboarding services: the app's one auth client, Sign in with Apple (iOS), Google
 * Sign-In, the IP geo hint over the api, and the photo avatar pipeline where this binary has the
 * picker and subject lift (otherwise `photos: null` and the real-photo option is not offered).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, env names and error codes, never copy. */
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Updates from 'expo-updates';
import { DevSettings, Platform } from 'react-native';

import { geoHintSchema, type GeoHint } from '@cp/domain';

import { deviceAuth, sessionHeaders } from '@/data/app-session/device-session';
import type { NativeIdTokenProvider } from '@/data/auth';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { markInAppRestart } from '@/lib/links/launch-replay';

import { devicePhotoServices } from './photo/device-photos';
import type { AvatarLifter } from './photo/photo-pipeline';
import type { OnboardingServices } from './services';

class NotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED';
}

/** A native sign-in that ended without an account, with the code the save flow maps to a notice. */
class ProviderStoppedError extends Error {
  constructor(readonly code: 'SIGN_IN_CANCELLED' | 'PLAY_SERVICES_NOT_AVAILABLE') {
    super(code);
  }
}

const appleProvider: NativeIdTokenProvider = {
  async requestIdToken() {
    if (!(await AppleAuthentication.isAvailableAsync())) throw new NotConfiguredError('apple');
    const nonce = Crypto.randomUUID();
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      return credential.identityToken ? { idToken: credential.identityToken, nonce } : undefined;
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return undefined;
      throw error;
    }
  },
};

const googleProvider: NativeIdTokenProvider = {
  async requestIdToken() {
    // The web client id is the ID token's audience; iOS also needs its own client id, whose
    // reversed form app.config.ts registers as the callback URL scheme. Android needs none.
    const webClientId = process.env['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'];
    const iosClientId = process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'];
    if (!webClientId || (Platform.OS === 'ios' && !iosClientId))
      throw new NotConfiguredError('google');
    GoogleSignin.configure({
      webClientId,
      ...(Platform.OS === 'ios' && iosClientId ? { iosClientId } : {}),
      offlineAccess: false,
    });
    // Google's sheet can end without an account (none on the phone, "Checking info…" backed out):
    // that reads as a cancel, and is reported and explained rather than silently reset.
    const result = await GoogleSignin.signIn().catch((error: unknown) => {
      if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
        throw new ProviderStoppedError('PLAY_SERVICES_NOT_AVAILABLE');
      throw error;
    });
    if (isCancelledResponse(result)) throw new ProviderStoppedError('SIGN_IN_CANCELLED');
    if (!isSuccessResponse(result)) return undefined;
    const idToken = result.data.idToken;
    // Google Sign-In has no nonce parameter; the server skips the check for an empty one.
    return idToken ? { idToken, nonce: '' } : undefined;
  },
};

const GEO_TIMEOUT_MS = 4000;

async function geoHint(): Promise<GeoHint | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/v1/geo/hint`, {
      headers: await sessionHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const parsed = geoHintSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Restarts the JS so the app boots on the session now in storage. */
function restartApp(): void {
  // The link this process was opened with is not followed again: a sign-in lands on Home.
  markInAppRestart();
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  void Updates.reloadAsync();
}

let services: OnboardingServices | null = null;

/** `lifter`: the on-device subject lift, or null in a binary built without it. */
export function deviceOnboardingServices(lifter: AvatarLifter | null): OnboardingServices {
  services ??= {
    auth: deviceAuth(),
    apple: Platform.OS === 'ios' ? appleProvider : null,
    google: googleProvider,
    geoHint,
    photos: devicePhotoServices(lifter),
    restart: restartApp,
  };
  return services;
}

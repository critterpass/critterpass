/**
 * What onboarding talks to beyond the command queue: the auth flows (save your pass, phone
 * sign-in, returning sign-in), the native Apple/Google ID-token sheets, the IP geo hint and the
 * photo avatar pipeline. Screens read them from context so tests swap in doubles at the network
 * and native boundaries only.
 */
import type { GeoHint } from '@cp/domain';
import { createContext, useContext, type ReactNode } from 'react';

import type { AuthDataLayer, NativeIdTokenProvider } from '@/data/auth';

import type { PhotoServices } from './photo/photo-pipeline';

export type OnboardingAuth = Pick<
  AuthDataLayer,
  | 'linkApple'
  | 'linkGoogle'
  | 'sendOtp'
  | 'verifyOtp'
  | 'signInReturningPhone'
  | 'startMerge'
  | 'confirmMerge'
>;

export interface OnboardingServices {
  readonly auth: OnboardingAuth;
  /** Sign in with Apple; null where the platform has none. */
  readonly apple: NativeIdTokenProvider | null;
  readonly google: NativeIdTokenProvider | null;
  /** `GET /v1/geo/hint`; null when offline or unknown (the nearest row is then hidden). */
  readonly geoHint: () => Promise<GeoHint | null>;
  /** Null in a build without the photo picker: the real-photo option is not offered. */
  readonly photos: PhotoServices | null;
  /** Restarts the app's JavaScript, so it starts again on the session now in storage. */
  readonly restart: () => void;
}

export const OnboardingServicesContext = createContext<OnboardingServices | null>(null);
const ServicesContext = OnboardingServicesContext;

export function OnboardingServicesProvider({
  services,
  children,
}: {
  readonly services: OnboardingServices;
  readonly children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useOnboardingServices(): OnboardingServices {
  const services = useContext(ServicesContext);
  if (services === null) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- developer-facing error, never copy.
    throw new Error('useOnboardingServices needs an OnboardingServicesProvider above it');
  }
  return services;
}

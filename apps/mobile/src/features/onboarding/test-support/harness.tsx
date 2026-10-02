/**
 * Renders onboarding screens the way the app does: Lingui, gestures, analytics (a recording
 * client) and the onboarding services, with doubles only at the auth, geo and photo boundaries.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AnalyticsClient } from '@/lib/analytics/client';
import { AnalyticsProvider } from '@/lib/analytics';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { OnboardingServicesProvider, type OnboardingServices } from '../services';

export interface RecordedEvent {
  readonly event: string;
  readonly props: unknown;
}

export function recordingAnalytics(): AnalyticsClient & { readonly events: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  const client = {
    events,
    capture: (event: string, props: unknown) => {
      events.push({ event, props });
    },
  };
  return new Proxy(client, {
    get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined),
  }) as unknown as AnalyticsClient & { readonly events: RecordedEvent[] };
}

export function fakeServices(overrides: Partial<OnboardingServices> = {}): OnboardingServices {
  return {
    auth: {
      linkApple: () => Promise.resolve({ kind: 'linked' }),
      linkGoogle: () => Promise.resolve({ kind: 'linked' }),
      sendOtp: () => Promise.resolve({ kind: 'sent', channel: 'whatsapp' }),
      verifyOtp: () => Promise.resolve({ kind: 'verified' }),
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a test uid, never copy.
      signInReturningPhone: () => Promise.resolve({ kind: 'signed_in', userId: 'u-existing' }),
      startMerge: () => Promise.resolve({ kind: 'preview', crews: [], trips: [] }),
      confirmMerge: () => Promise.resolve({ kind: 'merged', userId: 'u-existing' }),
    },
    apple: { requestIdToken: () => Promise.resolve({ idToken: 'apple-token', nonce: 'n' }) },
    google: { requestIdToken: () => Promise.resolve({ idToken: 'google-token', nonce: '' }) },
    geoHint: () => Promise.resolve(null),
    photos: null,
    restart: () => undefined,
    ...overrides,
  };
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface RenderOptions {
  readonly services?: OnboardingServices;
  readonly analytics?: AnalyticsClient;
  readonly locale?: string;
}

export async function renderOnboarding(
  ui: ReactElement,
  {
    services = fakeServices(),
    analytics = recordingAnalytics(),
    locale = 'en',
  }: RenderOptions = {},
): Promise<RenderResult> {
  i18n.loadAndActivate({ locale, messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <AnalyticsProvider client={analytics}>
            <OnboardingServicesProvider services={services}>
              <ScreenJoltProvider>{ui}</ScreenJoltProvider>
            </OnboardingServicesProvider>
          </AnalyticsProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

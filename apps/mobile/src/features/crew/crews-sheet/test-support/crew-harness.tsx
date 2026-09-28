/**
 * Renders crew screens the way the app does (Lingui, safe area, gestures, the jolt provider, the
 * crew services and the local-first stack), with the api answered by recorded responses at the
 * transport and the native share, clipboard and messaging boundaries recorded.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are wire values. */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';
import type { SyncTransport, TransportResponse } from '@/data/powersync/transport';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { CrewServicesProvider, type CrewServices } from '../crew-services';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function recordedApi(
  answers: Readonly<Record<string, TransportResponse>>,
): SyncTransport & { readonly sent: { path: string; body: unknown }[] } {
  const sent: { path: string; body: unknown }[] = [];
  return {
    sent,
    postJson(path, body) {
      sent.push({ path, body });
      return Promise.resolve(answers[path.split('/').at(-1) ?? ''] ?? { status: 503, body: null });
    },
  };
}

export const applied = (result: unknown): TransportResponse => ({
  status: 200,
  body: { status: 'applied', result },
});

export const rejected = (code: string, http: number, detail?: unknown): TransportResponse => ({
  status: http,
  body: { error: { code, message: code, retryable: false, ...(detail ? { detail } : {}) } },
});

export interface RecordingServices extends CrewServices {
  readonly shared: string[];
  readonly copied: string[];
  readonly opened: string[];
}

export function recordingServices(uid: string): RecordingServices {
  const shared: string[] = [];
  const copied: string[] = [];
  const opened: string[] = [];
  return {
    shared,
    copied,
    opened,
    uid: () => Promise.resolve(uid),
    share: (message) => {
      shared.push(message);
      return Promise.resolve();
    },
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    openUrl: (url) => {
      opened.push(url);
      return Promise.resolve(true);
    },
    inviteUrl: (code) => `https://critterpass.app/i/${code}`,
    referralUrl: (code) => `https://critterpass.app/r/${code}`,
  };
}

export function renderWithCrew(ui: ReactElement, stack: TestLocalFirst, services: CrewServices) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <CrewServicesProvider services={services}>
            <LocalFirstProvider value={stack.value}>
              <ScreenJoltProvider>{ui}</ScreenJoltProvider>
            </LocalFirstProvider>
          </CrewServicesProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

/** The payload of the first queued op for `cmd` in the local command queue. */
export async function queuedPayload(stack: TestLocalFirst, cmd: string): Promise<unknown> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    'SELECT envelope FROM commands WHERE cmd = ? ORDER BY seq LIMIT 1',
    [cmd],
  );
  return rows[0] === undefined
    ? undefined
    : (JSON.parse(rows[0].envelope) as { payload: unknown }).payload;
}

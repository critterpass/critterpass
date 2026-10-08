/**
 * The app root keeps this install's push registration fresh: `register_device` goes out for the
 * session's uid once the session is up, and again when the app leaves the foreground. The OS
 * push module and the api transport are the stand-ins (native and network boundaries); the
 * session itself starts on a real database.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resetOnSignOutHooksForTests } from '../../auth/sign-out-hooks';
import type { RegisterDeviceEnvelope } from '../../push/register';
import type { PushLifecycleDeps } from '../../push/use-push-lifecycle';
import { AppSessionRoot } from '../AppSessionRoot';
import { sessionHarness, type SessionHarness } from '../test-support/session-deps';

let harness: SessionHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
  resetOnSignOutHooksForTests();
});

function pushDeps(uid: () => Promise<string | undefined>, harnessed: SessionHarness) {
  const sent: { cmd: string; envelope: RegisterDeviceEnvelope }[] = [];
  const installIds = new Map<string, string>();
  const deps: PushLifecycleDeps = {
    native: {
      getPermission: () => Promise.resolve({ granted: true, provisional: false }),
      getDevicePushToken: () => Promise.resolve({ type: 'ios', data: 'apns-token' }),
      onTokenChange: () => () => undefined,
      getApnsEnvironment: () => Promise.resolve('production'),
    },
    transport: (cmd, envelope) => {
      sent.push({ cmd, envelope });
      return Promise.resolve({ status: 200 });
    },
    storage: {
      getItemAsync: (key) => Promise.resolve(installIds.get(key) ?? null),
      setItemAsync: (key, value) => {
        installIds.set(key, value);
        return Promise.resolve();
      },
    },
    currentUid: uid,
    platform: 'ios',
    appVersion: '1.0.0',
    locale: () => 'en-SG',
    timeZone: () => 'Asia/Singapore',
    subscribeAppState: (listener) => {
      const subscription = harnessed.appState.addEventListener('change', listener);
      return () => subscription.remove();
    },
  };
  return { deps, sent };
}

describe('push registration from the app root', () => {
  it('registers the device for the session uid on launch and when the app leaves the foreground', async () => {
    harness = sessionHarness({ online: true });
    const started = harness.start();
    const { deps, sent } = pushDeps(() => started.then((session) => session.uid), harness);

    await render(
      <AppSessionRoot
        start={() => started}
        appState={harness.appState}
        onError={() => undefined}
        push={deps}
      >
        <Text>app</Text>
      </AppSessionRoot>,
    );

    await waitFor(() => expect(sent).toHaveLength(1), { timeout: 10_000 });
    expect(sent[0]?.cmd).toBe('register_device');
    expect(sent[0]?.envelope.actor.uid).toBe('uid-online');
    expect(sent[0]?.envelope.payload).toMatchObject({
      push_token: 'apns-token',
      tz: 'Asia/Singapore',
      locale: 'en-SG',
      foreground: true,
    });

    harness.appState.emit('background');
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.envelope.payload).toMatchObject({ foreground: false });
  });
});

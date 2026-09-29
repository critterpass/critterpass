import { describe, expect, it } from '@jest/globals';

import {
  buildRegisterDeviceEnvelope,
  getOrCreateInstallId,
  HEARTBEAT_INTERVAL_MS,
  shouldRegister,
  type CommandTransport,
  type RegisterDeviceEnvelope,
} from '../register';
import { readPushToken, toApnsEnv, type NativeDevicePushToken, type PushNative } from '../tokens';
import { createPushLifecycle, type AppStateStatus } from '../use-push-lifecycle';

const INSTALL = '0192f0c1-7a2b-7c3d-8e4f-a1b2c3d4e5f6';
const UID = '0192f0c1-0000-7000-8000-000000000001';

function fakeNative(overrides: Partial<PushNative> = {}) {
  let tokenListener: ((token: NativeDevicePushToken) => void) | undefined;
  let current = 'abc123';
  const native: PushNative = {
    getPermission: () => Promise.resolve({ granted: true, provisional: false }),
    getDevicePushToken: () => Promise.resolve({ type: 'ios', data: current }),
    onTokenChange: (listener) => {
      tokenListener = listener;
      return () => {
        tokenListener = undefined;
      };
    },
    getApnsEnvironment: () => Promise.resolve('development'),
    ...overrides,
  };
  const rotate = (data: string) => {
    current = data;
    tokenListener?.({ type: 'ios', data });
  };
  return { native, rotate };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItemAsync: (key: string) => Promise.resolve(values.get(key) ?? null),
    setItemAsync: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
}

function recordingTransport(status = 200) {
  const sent: RegisterDeviceEnvelope[] = [];
  const transport: CommandTransport = (_cmd, envelope) => {
    sent.push(envelope);
    return Promise.resolve({ status });
  };
  return { sent, transport };
}

describe('readPushToken', () => {
  it('returns nothing when notifications are denied', async () => {
    const { native } = fakeNative({
      getPermission: () => Promise.resolve({ granted: false, provisional: false }),
    });
    expect(await readPushToken(native)).toBeUndefined();
  });

  it('still reads a token under provisional authorisation', async () => {
    const { native } = fakeNative({
      getPermission: () => Promise.resolve({ granted: false, provisional: true }),
    });
    expect(await readPushToken(native)).toEqual({ token: 'abc123', apnsEnv: 'sandbox' });
  });

  it('treats a failing native token call as no token yet', async () => {
    const { native } = fakeNative({
      getDevicePushToken: () => Promise.reject(new Error('no aps-environment')),
    });
    expect(await readPushToken(native)).toBeUndefined();
  });

  it('maps build signing to the APNs host', () => {
    expect(toApnsEnv('development')).toBe('sandbox');
    expect(toApnsEnv('production')).toBe('prod');
    expect(toApnsEnv(null)).toBe('prod');
  });
});

describe('install id', () => {
  it('is created once and reused', async () => {
    const storage = memoryStorage();
    const first = await getOrCreateInstallId(storage, () => INSTALL);
    const second = await getOrCreateInstallId(storage, () => 'other');
    expect(first).toBe(INSTALL);
    expect(second).toBe(INSTALL);
  });
});

describe('buildRegisterDeviceEnvelope', () => {
  it('keys the envelope by the install id and carries the token with its APNs host', () => {
    const envelope = buildRegisterDeviceEnvelope(
      {
        uid: UID,
        installId: INSTALL,
        platform: 'ios',
        appVersion: '1.2.0',
        tz: 'Asia/Ho_Chi_Minh',
        locale: 'vi',
        foreground: true,
        pushToken: 'abc123',
        apnsEnv: 'sandbox',
      },
      new Date('2026-09-27T12:00:00Z'),
      'op-1',
    );
    expect(envelope).toEqual({
      op_id: 'op-1',
      cmd: 'register_device',
      v: 1,
      actor: { uid: UID, via: 'app' },
      device: { id: INSTALL, platform: 'ios', app_version: '1.2.0', tz: 'Asia/Ho_Chi_Minh' },
      client_ts: '2026-09-27T12:00:00.000Z',
      payload: {
        platform: 'ios',
        tz: 'Asia/Ho_Chi_Minh',
        locale: 'vi',
        app_version: '1.2.0',
        foreground: true,
        capabilities: {},
        push_token: 'abc123',
        apns_env: 'sandbox',
      },
    });
  });
});

describe('shouldRegister', () => {
  const last = { at: 0, foreground: true, token: 't' };
  it('always registers on launch and token rotation', () => {
    expect(shouldRegister('launch', last, 1, 't')).toBe(true);
    expect(shouldRegister('token_change', last, 1, 't')).toBe(true);
  });
  it('heartbeats on foreground at most once per 10 minutes', () => {
    expect(shouldRegister('foreground', last, HEARTBEAT_INTERVAL_MS - 1, 't')).toBe(false);
    expect(shouldRegister('foreground', last, HEARTBEAT_INTERVAL_MS, 't')).toBe(true);
  });
  it('reports going to the background once', () => {
    expect(shouldRegister('background', last, 1, 't')).toBe(true);
    expect(shouldRegister('background', { ...last, foreground: false }, 1, 't')).toBe(false);
  });
  it('registers whenever the token differs from what the server has', () => {
    expect(shouldRegister('foreground', last, 1, 'new')).toBe(true);
  });
});

describe('createPushLifecycle', () => {
  function setup() {
    let clock = 1_000;
    let appStateListener: ((state: AppStateStatus) => void) | undefined;
    const { native, rotate } = fakeNative();
    const { sent, transport } = recordingTransport();
    const lifecycle = createPushLifecycle({
      native,
      transport,
      storage: memoryStorage({ 'cp.install_id': INSTALL }),
      currentUid: () => Promise.resolve(UID),
      platform: 'ios',
      appVersion: '1.0.0',
      locale: () => 'en',
      timeZone: () => 'Asia/Ho_Chi_Minh',
      subscribeAppState: (listener) => {
        appStateListener = listener;
        return () => {
          appStateListener = undefined;
        };
      },
      now: () => clock,
    });
    return {
      lifecycle,
      sent,
      rotate,
      setAppState: (state: AppStateStatus) => appStateListener?.(state),
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  it('registers on launch, throttles foreground heartbeats and follows token rotation', async () => {
    const { lifecycle, sent, rotate, setAppState, advance } = setup();
    await lifecycle.start();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ push_token: 'abc123', foreground: true });

    setAppState('background');
    await lifecycle.trigger('foreground');
    expect(sent.map((envelope) => envelope.payload['foreground'])).toEqual([true, false]);

    advance(60_000);
    setAppState('active');
    await lifecycle.trigger('background');
    // The minute-later foreground was throttled; the background report after it was not needed.
    expect(sent).toHaveLength(2);

    rotate('def456');
    await lifecycle.trigger('foreground');
    expect(sent).toHaveLength(3);
    expect(sent.at(-1)?.payload).toMatchObject({ push_token: 'def456' });

    lifecycle.stop();
    setAppState('active');
    advance(HEARTBEAT_INTERVAL_MS);
    expect(sent).toHaveLength(3);
  });

  it('never registers in a loop when every token read also fires the rotation listener (iOS)', async () => {
    let listener: ((token: NativeDevicePushToken) => void) | undefined;
    let reads = 0;
    let current = 'abc123';
    const native: PushNative = {
      ...fakeNative().native,
      // What expo-notifications does on iOS: the read registers with APNs, whose answer resolves
      // the read and fires the token listener with the same token.
      getDevicePushToken: () => {
        reads += 1;
        const data = current;
        setTimeout(() => listener?.({ type: 'ios', data }), 0);
        return Promise.resolve({ type: 'ios', data });
      },
      onTokenChange: (next) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
    };
    const { sent, transport } = recordingTransport();
    const lifecycle = createPushLifecycle({
      native,
      transport,
      storage: memoryStorage({ 'cp.install_id': INSTALL }),
      currentUid: () => Promise.resolve(UID),
      platform: 'ios',
      appVersion: '1.0.0',
      locale: () => 'en',
      timeZone: () => 'UTC',
      subscribeAppState: () => () => undefined,
    });
    await lifecycle.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await lifecycle.trigger('foreground');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toBe(2);
    expect(sent).toHaveLength(1);

    current = 'rotated';
    listener?.({ type: 'ios', data: 'rotated' });
    await lifecycle.trigger('background');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent.map((envelope) => envelope.payload['push_token'])).toEqual([
      'abc123',
      'rotated',
      'rotated',
    ]);
    // The rotation registered the token it carried; only the background report read it again.
    expect(reads).toBe(3);
    lifecycle.stop();
  });

  it('never registers before a session exists', async () => {
    const { native } = fakeNative();
    const { sent, transport } = recordingTransport();
    const lifecycle = createPushLifecycle({
      native,
      transport,
      storage: memoryStorage(),
      currentUid: () => Promise.resolve(undefined),
      platform: 'android',
      appVersion: '1.0.0',
      locale: () => 'en',
      timeZone: () => 'UTC',
      subscribeAppState: () => () => undefined,
    });
    await lifecycle.start();
    expect(sent).toEqual([]);
  });

  it('reports a failed registration and tries again on the next trigger', async () => {
    const errors: unknown[] = [];
    let status = 503;
    const sent: RegisterDeviceEnvelope[] = [];
    const lifecycle = createPushLifecycle({
      native: fakeNative().native,
      transport: (_cmd, envelope) => {
        sent.push(envelope);
        return Promise.resolve({ status });
      },
      storage: memoryStorage(),
      currentUid: () => Promise.resolve(UID),
      platform: 'ios',
      appVersion: '1.0.0',
      locale: () => 'en',
      timeZone: () => 'UTC',
      subscribeAppState: () => () => undefined,
      onError: (error) => errors.push(error),
    });
    await lifecycle.start();
    expect(errors).toHaveLength(1);
    status = 200;
    await lifecycle.trigger('foreground');
    expect(sent).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });
});

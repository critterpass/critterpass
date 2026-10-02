/**
 * Flags as a screen reads them (`useFlag`) over the real server-flag store: the api's answer comes
 * first, PostHog's own value second, the catalog default last. The api's answer is the recorded
 * `GET /v1/config/bootstrap` body (the one services/api/test/routes/config.db.test.ts asserts);
 * PostHog's HTTP boundary is unreachable and records every attempt (the SDK still tries to load
 * the project's remote config from PostHog's asset host, which carries nothing about the device).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  AnalyticsProvider,
  applyServerFlags,
  clearServerFlags,
  createAnalyticsClient,
  refreshServerFlags,
  serverFlag,
  useFlag,
  type AnalyticsClient,
} from '../index';
import bootstrap from '../test-support/config-bootstrap.json';

const requests: string[] = [];
const realFetch = global.fetch;
beforeEach(() => {
  requests.length = 0;
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    requests.push(input instanceof Request ? input.url : input.toString());
    return Promise.reject(new Error('network down'));
  });
});
const created: AnalyticsClient[] = [];
afterEach(async () => {
  clearServerFlags();
  await Promise.all(
    created.splice(0).map((client) => client.posthog?._shutdown(1_000) ?? Promise.resolve()),
  );
  global.fetch = realFetch;
});

/** The app's client as the root creates it: nobody has decided on analytics, so it is opted out. */
function client(posthogFlags?: Record<string, boolean>): AnalyticsClient {
  const analytics = createAnalyticsClient({
    apiKey: 'phc_test',
    dev: true,
    ...(posthogFlags ? { bootstrapFlags: posthogFlags } : {}),
    sdkOverrides: {
      persistence: 'memory',
      flushAt: 1,
      flushInterval: 0,
      captureAppLifecycleEvents: false,
      disableRemoteConfig: true,
      disableSurveys: true,
      disableCompression: true,
      fetchRetryCount: 0,
      featureFlagsRequestMaxRetries: 0,
    },
  });
  created.push(analytics);
  return analytics;
}

function Receipts() {
  const on = useFlag('money.receipts');
  return <Text>{on ? 'scan on' : 'scan off'}</Text>;
}

function screen(analytics: AnalyticsClient) {
  return render(
    <AnalyticsProvider client={analytics}>
      <Receipts />
    </AnalyticsProvider>,
  );
}

describe('flags from the api', () => {
  it("turns a flag on when the api's answer arrives, with PostHog opted out and never asked", async () => {
    const view = await screen(client());
    expect(view.getByText('scan off')).toBeTruthy();

    await act(async () => {
      await refreshServerFlags(() => Promise.resolve({ status: 200, body: bootstrap }));
    });

    expect(view.getByText('scan on')).toBeTruthy();
    // Nobody consented: the app has not asked PostHog to evaluate anything for this device.
    expect(requests.filter((url) => /\/(flags|decide)\b/u.test(url))).toEqual([]);
  });

  it("falls back to PostHog's value, then the catalog default, when the api has not answered", async () => {
    expect(serverFlag('money.receipts')).toBeUndefined();
    expect((await screen(client({ 'money.receipts': true }))).getByText('scan on')).toBeTruthy();
    expect((await screen(client())).getByText('scan off')).toBeTruthy();
  });

  it("puts the api's value before PostHog's, and ignores a value the catalog does not accept", async () => {
    const view = await screen(client({ 'money.receipts': true }));

    await act(() => {
      applyServerFlags({ flags: { ...bootstrap.flags, 'money.receipts': false } });
    });
    expect(view.getByText('scan off')).toBeTruthy();

    await act(() => {
      applyServerFlags({ flags: { ...bootstrap.flags, 'money.receipts': 'yes' } });
    });
    expect(serverFlag('money.receipts')).toBeUndefined();
    expect(view.getByText('scan on')).toBeTruthy();
  });

  it('keeps the last values when a refresh fails', async () => {
    applyServerFlags(bootstrap);
    const view = await screen(client());

    await act(async () => {
      await expect(
        refreshServerFlags(() => Promise.reject(new Error('Network request failed'))),
      ).rejects.toThrow('Network request failed');
      await refreshServerFlags(() =>
        Promise.resolve({ status: 500, body: { error: { code: 'INTERNAL' } } }),
      );
      await refreshServerFlags(() => Promise.resolve({ status: 200, body: null }));
    });

    expect(serverFlag('money.receipts')).toBe(true);
    expect(view.getByText('scan on')).toBeTruthy();
  });

  it('forgets the values when the account signs out, and drops an answer still on its way', async () => {
    applyServerFlags(bootstrap);
    const view = await screen(client());
    expect(view.getByText('scan on')).toBeTruthy();

    let answer: (response: { status: number; body: unknown }) => void = () => undefined;
    const inFlight = refreshServerFlags(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await act(() => {
      clearServerFlags();
    });
    expect(view.getByText('scan off')).toBeTruthy();

    await act(async () => {
      answer({ status: 200, body: bootstrap });
      await inFlight;
    });
    expect(serverFlag('money.receipts')).toBeUndefined();
    expect(view.getByText('scan off')).toBeTruthy();
  });
});

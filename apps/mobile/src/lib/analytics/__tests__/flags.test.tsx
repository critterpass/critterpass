import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AnalyticsProvider, createAnalyticsClient, useFlag, type AnalyticsClient } from '../index';

/** PostHog's HTTP boundary: unreachable, and every attempted request recorded. */
const requests: { url: string; body: string }[] = [];
const realFetch = global.fetch;
beforeEach(() => {
  requests.length = 0;
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
    return Promise.reject(new Error('network down'));
  });
});
afterEach(() => {
  global.fetch = realFetch;
});

function client(bootstrapFlags?: Record<string, boolean>): AnalyticsClient {
  return createAnalyticsClient({
    apiKey: 'phc_test',
    dev: true,
    initialConsent: 'granted',
    ...(bootstrapFlags ? { bootstrapFlags } : {}),
    sdkOverrides: {
      persistence: 'memory',
      flushAt: 1,
      flushInterval: 0,
      captureAppLifecycleEvents: false,
      disableRemoteConfig: true,
      disableSurveys: true,
      disableCompression: true,
      fetchRetryCount: 0,
    },
  });
}

function Replay() {
  const on = useFlag('analytics.replay');
  return <Text>{on ? 'replay on' : 'replay off'}</Text>;
}

describe('useFlag', () => {
  it('returns the catalog default when PostHog is unreachable', async () => {
    const analytics = client();
    const view = await render(
      <AnalyticsProvider client={analytics}>
        <Replay />
      </AnalyticsProvider>,
    );
    expect(view.getByText('replay off')).toBeTruthy();
  });

  it('uses the api-bootstrapped value on first render and reports exposure after it', async () => {
    const analytics = client({ 'analytics.replay': true });
    const exposure = jest.spyOn(analytics, 'exposure');
    const view = await render(
      <AnalyticsProvider client={analytics}>
        <Replay />
      </AnalyticsProvider>,
    );
    expect(view.getByText('replay on')).toBeTruthy();
    expect(exposure).toHaveBeenCalledWith('analytics.replay', true);
    await analytics.flush();
    expect(requests.some((request) => request.body.includes('$feature_flag_called'))).toBe(true);
  });
});

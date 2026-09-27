import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  createAnalyticsClient,
  decisionFromRows,
  type AnalyticsClient,
  type AnalyticsClientOptions,
} from '../index';

const PID = 'a'.repeat(64);
const TRIP = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

interface SentBatch {
  readonly url: string;
  readonly events: { event: string; properties: Record<string, unknown>; distinct_id?: string }[];
}

/** PostHog's HTTP boundary: every request the SDK makes is recorded here, none leaves the test. */
let sent: SentBatch[] = [];
const realFetch = global.fetch;

beforeEach(() => {
  sent = [];
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const events = (body['batch'] as SentBatch['events'] | undefined) ?? [];
    sent.push({ url, events });
    const payload = url.includes('/flags')
      ? { featureFlags: {}, featureFlagPayloads: {} }
      : { status: 1 };
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
  });
});

/** Every client a test creates, shut down afterwards so no SDK timer outlives the test. */
const created: AnalyticsClient[] = [];
afterEach(async () => {
  // Drains queued sends and stops the SDK's timers before the test environment is torn down.
  await Promise.all(
    created.splice(0).map((client) => client.posthog?._shutdown(1_000) ?? Promise.resolve()),
  );
  global.fetch = realFetch;
});

function client(overrides: Partial<AnalyticsClientOptions> = {}) {
  const analytics = createAnalyticsClient({
    apiKey: 'phc_test',
    dev: true,
    sdkOverrides: {
      persistence: 'memory',
      flushAt: 1,
      flushInterval: 0,
      captureAppLifecycleEvents: false,
      preloadFeatureFlags: false,
      disableRemoteConfig: true,
      disableSurveys: true,
      disableCompression: true,
    },
    ...overrides,
  });
  created.push(analytics);
  return analytics;
}

const capturedEvents = () => sent.flatMap((batch) => batch.events);

describe('analytics client consent gate', () => {
  it('sends nothing before a decision and does not queue it for later', async () => {
    const analytics = client();
    analytics.capture('crew_created', {});
    await analytics.flush();
    expect(sent.filter((batch) => batch.url.includes('/batch'))).toEqual([]);

    analytics.setConsent(true);
    analytics.capture('ballot_cast', { poll_kind: 'place' });
    await analytics.flush();
    expect(capturedEvents().map((event) => event.event)).toEqual(['ballot_cast']);
  });

  it('sends catalog events with common props after consent, to the EU host', async () => {
    const analytics = client({ initialConsent: 'granted' });
    analytics.setCommonProps({ platform: 'ios', trip_id: TRIP, surface: 'app' });
    analytics.capture('im_up', { source: 'la', min_before: 5 });
    await analytics.flush();
    const event = capturedEvents().find((candidate) => candidate.event === 'im_up');
    expect(capturedEvents().map((candidate) => candidate.event)).toEqual(['im_up']);
    expect(event?.properties).toMatchObject({
      platform: 'ios',
      trip_id: TRIP,
      source: 'la',
      min_before: 5,
    });
    expect(sent.every((batch) => new URL(batch.url).hostname.startsWith('eu'))).toBe(true);
  });

  it('stops sending on revocation', async () => {
    const analytics = client({ initialConsent: 'granted' });
    analytics.setConsent(false);
    analytics.capture('crew_created', {});
    await analytics.flush();
    expect(capturedEvents()).toEqual([]);
  });

  it('identifies only a saved account after consent, with the pid', async () => {
    const analytics = client();
    analytics.setIdentity({ userPid: PID, anonymous: false });
    analytics.setConsent(true);
    analytics.capture('crew_created', {});
    await analytics.flush();
    const identify = capturedEvents().find((event) => event.event === '$identify');
    expect(identify?.distinct_id).toBe(PID);
    expect(capturedEvents().find((event) => event.event === 'crew_created')?.distinct_id).toBe(PID);
  });

  it('keeps anonymous pass holders on an anonymous distinct id', async () => {
    const analytics = client({ initialConsent: 'granted' });
    analytics.setIdentity({ userPid: PID, anonymous: true });
    analytics.capture('crew_created', {});
    await analytics.flush();
    expect(capturedEvents().some((event) => event.event === '$identify')).toBe(false);
    expect(capturedEvents()[0]?.distinct_id).not.toBe(PID);
  });

  it('forgets the person and the decision on sign-out', async () => {
    const analytics = client({ initialConsent: 'granted' });
    analytics.setIdentity({ userPid: PID, anonymous: false });
    await analytics.flush();
    await analytics.reset();
    expect(analytics.consent.decision()).toBe('undecided');
    sent = [];
    analytics.capture('crew_created', {});
    await analytics.flush();
    expect(capturedEvents()).toEqual([]);
  });
});

describe('catalog violations', () => {
  it('throw in development builds', () => {
    const analytics = client({ initialConsent: 'granted' });
    expect(() =>
      analytics.capture('crew_created', { email: 'a@b.co' } as unknown as Record<string, never>),
    ).toThrow(/forbidden_key: email/u);
  });

  it('are dropped and reported in release builds', async () => {
    const onViolation = jest.fn();
    const analytics = client({ dev: false, onViolation, initialConsent: 'granted' });
    analytics.capture('help_opened', { entry: 'free text from the user' });
    await analytics.flush();
    expect(capturedEvents()).toEqual([]);
    expect(onViolation).toHaveBeenCalledWith({
      event: 'help_opened',
      reason: 'invalid_props',
      detail: 'entry',
    });
  });
});

describe('decisionFromRows', () => {
  const row = (granted: string | null, revoked: string | null, updated: string) => ({
    purpose: 'analytics',
    granted_at: granted,
    revoked_at: revoked,
    updated_at: updated,
  });

  it('reads the latest analytics row', () => {
    expect(decisionFromRows([])).toBe('undecided');
    expect(
      decisionFromRows([{ ...row('2026-01-01', null, '2026-01-01'), purpose: 'marketing' }]),
    ).toBe('undecided');
    expect(decisionFromRows([row('2026-01-01', null, '2026-01-01')])).toBe('granted');
    expect(
      decisionFromRows([
        row('2026-01-01', null, '2026-01-01'),
        row('2026-01-01', '2026-02-01', '2026-02-01'),
      ]),
    ).toBe('denied');
  });
});

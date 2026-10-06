import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  choice,
  createDecisionClient,
  createGateway,
  GatewayConfigError,
  GatewayError,
  JEV_MODEL,
  noul,
  score,
  TYPESAFE_API_URL,
  type AiUsageRecord,
  type DecisionClientOptions,
  type FallbackReason,
} from '../../src';
import { fixtureTransport } from '../fixture-transport';

const AT = new Date('2026-09-28T01:00:00Z');
const STATE =
  'Our boat trip to Ha Long got cancelled this morning and nobody has told us how we get the money back.';
// The exact questions the fixtures were recorded with.
const QUESTIONS = {
  topic: choice('Which help topic does this message need?', {
    refund: 'getting money back for a booking or payment',
    booking_change: 'changing dates, people or times of a booking',
    safety: 'danger, injury, police or medical help',
    other: null,
  }),
  urgent: noul('Does the writer need help within the next hour?'),
  frustration: score('How frustrated is the writer?', ['Calm', 'Annoyed', 'Angry']),
};

interface Harness {
  readonly records: AiUsageRecord[];
  readonly fallbacks: FallbackReason[];
  readonly sleeps: number[];
  readonly jev: ReturnType<typeof fixtureTransport>;
  readonly twin: ReturnType<typeof fixtureTransport>;
}

function harness(
  jevFixtures: readonly string[],
  twinFixtures: readonly string[] = [],
  overrides: Partial<DecisionClientOptions> = {},
) {
  const records: AiUsageRecord[] = [];
  const fallbacks: FallbackReason[] = [];
  const sleeps: number[] = [];
  const onUsage = (record: AiUsageRecord) => {
    records.push(record);
    return Promise.resolve();
  };
  const jev = fixtureTransport(jevFixtures, { dir: 'typesafe' });
  const twin = fixtureTransport(twinFixtures);
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: twin.fetch,
    onUsage,
    now: () => AT,
  });
  const client = createDecisionClient({
    apiKey: 'fixture-key',
    gateway,
    fetch: jev.fetch,
    onUsage,
    onFallback: (_route, reason) => fallbacks.push(reason),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    now: () => AT,
    ...overrides,
  });
  const h: Harness = { records, fallbacks, sleeps, jev, twin };
  return { client, h };
}

describe('decide on Jev', () => {
  it('round-trips a choice, a noul and a score to typed answers', async () => {
    const { client } = harness(['jev-help-intent']);
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });

    expect(decision.answered_by).toBe('jev');
    expect(decision.fallbackReason).toBeUndefined();
    expect(decision.model).toBe(JEV_MODEL);
    expect(decision.answers.topic).toEqual({
      type: 'choice',
      choice: 'refund',
      probabilities: { refund: 1, booking_change: 0, safety: 0, other: 0 },
      confidence: 1,
    });
    expect(decision.answers.urgent.noul).toBe(0.44);
    expect(decision.answers.urgent.confidence).toBeCloseTo(0.12);
    expect(decision.answers.frustration).toMatchObject({ type: 'score', score: 1.05 });
    expectTypeOf(decision.answers.topic.choice).toEqualTypeOf<
      'refund' | 'booking_change' | 'safety' | 'other'
    >();
    expectTypeOf(decision.answers.urgent.noul).toEqualTypeOf<number>();
  });

  it('sends one fan-out request to the pinned origin and model', async () => {
    const { client, h } = harness(['jev-help-intent']);
    await client.decide('help.intent_classifier', { state: STATE, questions: QUESTIONS });
    expect(h.jev.urls).toEqual([TYPESAFE_API_URL]);
    expect(h.jev.requests).toEqual([{ state: STATE, model: 'jev-1.13.0', questions: QUESTIONS }]);
  });

  it('writes one jev usage row billed on input tokens only', async () => {
    const { client, h } = harness(['jev-help-intent']);
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    // 431 input tokens × 42,000 micros per million tokens = 18.1 → 18; output is free.
    expect(h.records).toEqual([
      expect.objectContaining({
        model: JEV_MODEL,
        tier: 'jev',
        tokensIn: 431,
        tokensOut: 80,
        cacheRead: 0,
        costMicros: 18,
      }),
    ]);
    expect(decision.costMicros).toBe(18);
  });

  it('rejects a response whose answers do not match the question map', async () => {
    const { client, h } = harness(['jev-help-intent'], ['flash-decision-twin']);
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: { topic: QUESTIONS.topic, urgent: QUESTIONS.urgent },
    });
    // The recorded reply carries an unknown `frustration` key, so the twin answers instead.
    expect(h.fallbacks).toEqual(['invalid_response']);
    expect(decision.answered_by).toBe('fast');
  });

  it('refuses a generation route and malformed questions before any request', async () => {
    const { client, h } = harness([]);
    await expect(
      // @ts-expect-error guide.chat is not a decision route
      client.decide('guide.chat', { state: STATE, questions: QUESTIONS }),
    ).rejects.toThrow(GatewayConfigError);
    await expect(
      client.decide('help.intent_classifier', {
        state: STATE,
        questions: { level: score('How?', ['only one']) },
      }),
    ).rejects.toThrow(GatewayConfigError);
    expect(h.jev.urls).toEqual([]);
  });
});

describe('decide falls back to the fast-tier twin', () => {
  it('on 529 after one retry, answering with the same shape', async () => {
    const { client, h } = harness(
      ['jev-overloaded-529', 'jev-overloaded-529'],
      ['flash-decision-twin'],
    );
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    expect(h.jev.urls).toHaveLength(2);
    expect(h.fallbacks).toEqual(['overloaded']);
    expect(decision.answered_by).toBe('fast');
    expect(decision.fallbackReason).toBe('overloaded');
    expect(decision.answers.topic).toEqual({
      type: 'choice',
      choice: 'refund',
      probabilities: null,
      confidence: 0.9,
    });
    expect(decision.answers.urgent).toEqual({ type: 'noul', noul: 0, confidence: 1 });
    // The twin was not sure of the level, so its label-only confidence is the low one.
    expect(decision.answers.frustration).toEqual({
      type: 'score',
      score: 1,
      probabilities: null,
      confidence: 0.4,
    });
    // Jev billed nothing; the twin's own fast-tier row is the only usage.
    expect(h.records.map((r) => r.tier)).toEqual(['fast']);
  });

  it('retries a 429 after its retry-after and answers from Jev', async () => {
    const { client, h } = harness(['jev-rate-limited-429', 'jev-help-intent']);
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    expect(h.sleeps).toEqual([300]);
    expect(decision.answered_by).toBe('jev');
  });

  it('does not wait out a long retry-after', async () => {
    const { client, h } = harness(['jev-rate-limited-429-long'], ['flash-decision-twin']);
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    expect(h.sleeps).toEqual([]);
    expect(h.fallbacks).toEqual(['rate_limited']);
    expect(decision.answered_by).toBe('fast');
  });

  it('when Jev does not answer within 800 ms', async () => {
    // The budget is a timeout signal created before the request goes out, so the wait is measured
    // from before the call: it is never shorter than the budget, give or take the timer's 1 ms
    // rounding. The upper bound only proves the wait is not open-ended, so it leaves room for a
    // slow runner.
    const reasons: string[] = [];
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const reason = init.signal?.reason as Error;
          reasons.push(reason.name);
          reject(reason);
        });
      });
    const { client, h } = harness([], ['flash-decision-twin'], { fetch: hang });
    const started = performance.now();
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    const waited = performance.now() - started;
    expect(h.fallbacks).toEqual(['timeout']);
    expect(decision.answered_by).toBe('fast');
    expect(reasons).toEqual(['TimeoutError']);
    expect(waited).toBeGreaterThanOrEqual(800 - 5);
    expect(waited).toBeLessThan(5_000);
  });

  it('on a transport error and on a rejected key', async () => {
    const broken: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    const first = harness([], ['flash-decision-twin'], { fetch: broken });
    await first.client.decide('help.intent_classifier', { state: STATE, questions: QUESTIONS });
    expect(first.h.fallbacks).toEqual(['transport_error']);

    const second = harness(['jev-unauthorized-401'], ['flash-decision-twin']);
    await second.client.decide('help.intent_classifier', { state: STATE, questions: QUESTIONS });
    expect(second.h.fallbacks).toEqual(['unauthorized']);
  });

  it('without a key, never calling Jev', async () => {
    const { client, h } = harness([], ['flash-decision-twin'], { apiKey: undefined });
    const decision = await client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    expect(h.jev.urls).toEqual([]);
    expect(h.fallbacks).toEqual(['missing_key']);
    expect(decision.answered_by).toBe('fast');
  });

  it('raises AI_UNAVAILABLE when no twin can run', async () => {
    const jev = fixtureTransport(['jev-overloaded-529', 'jev-overloaded-529'], {
      dir: 'typesafe',
    });
    const client = createDecisionClient({
      apiKey: 'fixture-key',
      fetch: jev.fetch,
      sleep: () => Promise.resolve(),
    });
    const attempt = client.decide('help.intent_classifier', {
      state: STATE,
      questions: QUESTIONS,
    });
    await expect(attempt).rejects.toBeInstanceOf(GatewayError);
    await expect(attempt).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});

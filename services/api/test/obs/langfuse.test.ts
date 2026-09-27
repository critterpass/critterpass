import { readFileSync } from 'node:fs';

import type { GenerationSpan } from '@cp/ai';
import type { AnalyticsEventProps } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { createLlmObservability, maskOutput } from '../../src/obs/langfuse';
import type { MetricsRecorder } from '../../src/obs/metrics';

const SCORE_CREATED = readFileSync(
  new URL('../fixtures/langfuse/score-created.json', import.meta.url),
  'utf8',
);
const TRIP = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
const CREW = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c';

function harness() {
  /** Langfuse's HTTP boundary: OTLP traces answer 200 empty, scores answer the recorded body. */
  const requests: { url: string; body: string; auth: string | null }[] = [];
  const fetchStub: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      body: typeof init?.body === 'string' ? init.body : '',
      auth: headers.get('authorization'),
    });
    return Promise.resolve(
      url.endsWith('/api/public/scores')
        ? new Response(SCORE_CREATED, { status: 200 })
        : new Response(null, { status: 200 }),
    );
  };
  const points: { name: string; value: number; labels: Record<string, string> }[] = [];
  const metrics: MetricsRecorder = {
    record: (name, value, labels) => points.push({ name, value, labels }),
    recordCommand: () => undefined,
  };
  const events: AnalyticsEventProps<'llm_call'>[] = [];
  const observability = createLlmObservability({
    publicKey: 'pk-lf-test',
    secretKey: 'sk-lf-test',
    environment: 'test',
    metrics,
    trackLlmCall: (props) => events.push(props),
    fetch: fetchStub,
    flushIntervalMs: 0,
  });
  return { observability, requests, points, events };
}

const span: GenerationSpan = {
  route: 'guide.chat',
  model: 'deepseek-flash',
  tier: 'fast',
  usage: {
    inputTokens: 1200,
    outputTokens: 300,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  costMicros: 2_700,
  startedAt: new Date('2026-09-28T01:00:00.000Z'),
  endedAt: new Date('2026-09-28T01:00:01.250Z'),
  stopReason: 'end_turn',
  userId: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6d',
  tripId: TRIP,
  crewId: CREW,
  output: {
    question: 'can we skip the temple, Anna is allergic to incense',
    budget_max: 900,
    action: 'swap',
  },
};

describe('llm observability', () => {
  it('turns one call into a trace, two metric points and one llm_call event', async () => {
    const { observability, requests, points, events } = harness();
    const traceId = observability.recordGeneration(span);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/u);
    await observability.flush();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://cloud.langfuse.com/api/public/otel/v1/traces');
    expect(requests[0]?.body).toContain(traceId);
    expect(requests[0]?.body).not.toContain('incense');
    expect(requests[0]?.body).not.toContain('900');

    expect(points).toEqual([
      {
        name: 'cp_llm_cost_micros_total',
        value: 2_700,
        labels: { feature: 'guide.chat', tier: 'fast' },
      },
      {
        name: 'cp_llm_latency_ms',
        value: 1_250,
        labels: { feature: 'guide.chat', model: 'deepseek-flash' },
      },
    ]);
    expect(events).toEqual([
      {
        feature: 'guide.chat',
        model: 'deepseek-flash',
        tier: 'fast',
        latency: 1_250,
        cost_est: 2_700,
        trip_id: TRIP,
        crew_id: CREW,
      },
    ]);
  });

  it('masks user text and registry columns in structured output', () => {
    expect(maskOutput(span.output)).toEqual({
      question: '[user text: 51 chars]',
      budget_max: '[redacted]',
      action: 'swap',
    });
  });

  it('posts answer ratings as scores', async () => {
    const { observability, requests } = harness();
    await observability.scoreTrace('trace-1', { name: 'answer_rating', value: 1 });
    expect(requests[0]?.url).toBe('https://cloud.langfuse.com/api/public/scores');
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
      traceId: 'trace-1',
      name: 'answer_rating',
      value: 1,
      dataType: 'NUMERIC',
    });
    expect(requests[0]?.auth).toMatch(/^Basic /u);
  });
});

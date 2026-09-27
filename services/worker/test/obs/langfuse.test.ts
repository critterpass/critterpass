import type { GenerationSpan } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import { createPostHogSink, type PostHogEvent } from '../../src/analytics-export';
import { createWorkerLlmObservability } from '../../src/obs/langfuse';
import type { MetricsRecorder } from '../../src/obs/metrics';

const TRIP = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

describe('worker llm observability', () => {
  it('turns one call into a masked trace, metric points and an anonymous llm_call', async () => {
    /** Langfuse and PostHog HTTP boundaries: every request recorded, answered 200. */
    const requests: { url: string; body: string }[] = [];
    const fetchStub: typeof fetch = (input, init) => {
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        body: typeof init?.body === 'string' ? init.body : '',
      });
      return Promise.resolve(new Response('{"status":1}', { status: 200 }));
    };
    const points: string[] = [];
    const metrics: MetricsRecorder = {
      record: (name, value) => points.push(`${name}=${value}`),
      recordCommand: () => undefined,
    };
    const telemetry = createWorkerLlmObservability({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      environment: 'test',
      metrics,
      sink: createPostHogSink({ apiKey: 'phc_test', fetch: fetchStub }),
      fetch: fetchStub,
      flushIntervalMs: 0,
    });
    const span: GenerationSpan = {
      route: 'guide.chat',
      model: 'deepseek-flash',
      tier: 'fast',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      costMicros: 40,
      startedAt: new Date('2026-09-28T01:00:00.000Z'),
      endedAt: new Date('2026-09-28T01:00:00.400Z'),
      stopReason: 'end_turn',
      tripId: TRIP,
      output: { draft: 'Meet Anna at 7 near her hotel', kind: 'nudge' },
    };
    const traceId = telemetry.recordGeneration(span);
    await telemetry.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(traceId).toMatch(/^[0-9a-f]{32}$/u);
    expect(points).toEqual(['cp_llm_cost_micros_total=40', 'cp_llm_latency_ms=400']);
    const langfuse = requests.find((request) => request.url.includes('langfuse'));
    expect(langfuse?.body).toContain('[user text: 29 chars]');
    expect(langfuse?.body).not.toContain('Anna');
    const posthog = requests.find((request) => request.url.includes('posthog'));
    const [event] = (JSON.parse(posthog?.body ?? '{}') as { batch: PostHogEvent[] }).batch;
    expect(event).toMatchObject({
      event: 'llm_call',
      properties: {
        feature: 'guide.chat',
        cost_est: 40,
        trip_id: TRIP,
        $process_person_profile: false,
      },
    });
  });
});

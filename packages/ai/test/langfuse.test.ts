import { describe, expect, it } from 'vitest';

import {
  createGateway,
  createLangfuseTelemetry,
  NOOP_TELEMETRY,
  type AiUsageRecord,
  type GenerationSpan,
} from '../src';
import { fixtureTransport } from './fixture-transport';

const TRIP = '0190f0a0-0000-7000-8000-0000000000b1';
const CREW = '0190f0a0-0000-7000-8000-0000000000c1';

const span: GenerationSpan = {
  route: 'guide.chat',
  model: 'deepseek-flash',
  tier: 'fast',
  usage: { inputTokens: 23, cacheWriteTokens: 0, cacheReadTokens: 4410, outputTokens: 12 },
  costMicros: 24,
  startedAt: new Date('2026-09-27T10:00:00Z'),
  endedAt: new Date('2026-09-27T10:00:01Z'),
  stopReason: 'end_turn',
  tripId: TRIP,
  crewId: CREW,
  output: [{ name: 'propose_expense', input: { amount_minor: 1200, dietary_notes: 'no pork' } }],
};

interface Exported {
  readonly url: string;
  readonly headers: Headers;
  readonly body: {
    resourceSpans: {
      scopeSpans: {
        spans: {
          traceId: string;
          attributes: { key: string; value: Record<string, unknown> }[];
        }[];
      }[];
    }[];
  };
}

function capture(status = 200) {
  const sent: Exported[] = [];
  const send = (url: unknown, init?: RequestInit) => {
    sent.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Exported['body'],
    });
    return Promise.resolve(new Response(null, { status }));
  };
  return { sent, fetch: send as typeof fetch };
}

describe('Langfuse telemetry', () => {
  it('is a no-op without keys: no trace id, nothing sent', async () => {
    const { sent, fetch } = capture();
    const telemetry = createLangfuseTelemetry({ publicKey: '', secretKey: undefined, fetch });
    expect(telemetry).toBe(NOOP_TELEMETRY);
    expect(telemetry.recordGeneration(span)).toBeNull();
    await telemetry.flush();
    expect(sent).toEqual([]);
  });

  it('exports a redacted generation span tagged with its crew and trip cost', async () => {
    const { sent, fetch } = capture();
    const telemetry = createLangfuseTelemetry({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      fetch,
      flushIntervalMs: 0,
      redactKeys: ['dietary_notes'],
    });
    const traceId = telemetry.recordGeneration(span);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    await telemetry.flush();

    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe('https://cloud.langfuse.com/api/public/otel/v1/traces');
    expect(request?.headers.get('authorization')).toBe(
      `Basic ${Buffer.from('pk-lf-test:sk-lf-test').toString('base64')}`,
    );
    const exported = request?.body.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(exported?.traceId).toBe(traceId);
    const attributes = Object.fromEntries(
      (exported?.attributes ?? []).map((a) => [a.key, Object.values(a.value)[0]]),
    );
    expect(attributes).toMatchObject({
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'deepseek-flash',
      'langfuse.session.id': TRIP,
      'langfuse.trace.metadata.crew_id': CREW,
      'langfuse.trace.metadata.cost_micros': '24',
      'langfuse.observation.cost_details': JSON.stringify({ total: 0.000024 }),
      'langfuse.trace.tags': {
        values: [
          { stringValue: 'route:guide.chat' },
          { stringValue: 'tier:fast' },
          { stringValue: `trip:${TRIP}` },
          { stringValue: `crew:${CREW}` },
        ],
      },
    });
    const output = String(attributes['langfuse.observation.output']);
    expect(output).toContain('amount_minor');
    expect(output).not.toContain('dietary_notes');
    expect(output).not.toContain('no pork');
  });

  it('reports a failed export without throwing', async () => {
    const { fetch } = capture(503);
    const errors: unknown[] = [];
    const telemetry = createLangfuseTelemetry({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      fetch,
      flushIntervalMs: 0,
      onError: (error) => errors.push(error),
    });
    telemetry.recordGeneration(span);
    await expect(telemetry.flush()).resolves.toBeUndefined();
    expect(String(errors[0])).toMatch(/HTTP 503/);
  });

  it('stamps the trace id of every gateway call on its usage record', async () => {
    const { sent, fetch } = capture();
    const telemetry = createLangfuseTelemetry({
      publicKey: 'pk-lf-test',
      secretKey: 'sk-lf-test',
      fetch,
      flushIntervalMs: 0,
    });
    const records: AiUsageRecord[] = [];
    const transport = fixtureTransport(['flash-basic']);
    const gateway = createGateway({
      apiKey: 'fixture-key',
      fetch: transport.fetch,
      telemetry,
      onUsage: (record) => (records.push(record), Promise.resolve()),
    });
    await gateway.callModel(
      'guide.chat',
      { messages: [{ role: 'user', content: 'hi' }] },
      { tripId: TRIP },
    );
    await telemetry.flush();
    const exported = sent[0]?.body.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(records[0]?.langfuseTraceId).toBe(exported?.traceId);
    expect(records[0]?.langfuseTraceId).toMatch(/^[0-9a-f]{32}$/);
  });
});

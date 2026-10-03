/**
 * Guide job fixtures: a runtime over a fake network boundary (every Messages API call answered by
 * `reply(body)`, the recorded shape of a DeepSeek reply), and a crew on a trip.
 */
import {
  createDecisionClient,
  createGateway,
  createToolRegistry,
  registerGuideToolExecutors,
} from '@cp/ai';
import type pg from 'pg';

import type { JobContext } from '../../src/boss';
import { guideReader, type GuideRuntime } from '../../src/jobs/guide/runtime';

/** A tool call the fake model makes instead of answering. */
export interface ToolCallReply {
  readonly tool: string;
  readonly input: Record<string, unknown>;
}

export type Reply = (request: {
  system?: unknown;
  messages: unknown[];
  stream?: boolean;
}) => string | ToolCallReply;

function sse(events: readonly { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

const MESSAGE_START = {
  event: 'message_start',
  data: {
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'deepseek-flash',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  },
};

function toolStreamBody(call: ToolCallReply): string {
  return sse([
    MESSAGE_START,
    {
      event: 'content_block_start',
      data: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_test', name: call.tool, input: {} },
      },
    },
    {
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) },
      },
    },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ]);
}

function streamBody(text: string): string {
  const events = [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'deepseek-flash',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
    },
    {
      event: 'content_block_start',
      data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    },
    {
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    },
    { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
    {
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
    },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ];
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

export interface FakeModel {
  readonly fetch: typeof fetch;
  readonly requests: Record<string, unknown>[];
}

export function fakeModel(reply: Reply): FakeModel {
  const requests: Record<string, unknown>[] = [];
  const fetch = (_input: unknown, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
      string,
      unknown
    > & {
      messages: unknown[];
      stream?: boolean;
    };
    requests.push(body);
    const text = reply(body);
    if (typeof text !== 'string') {
      if (body.stream !== true) throw new Error('the fake model calls tools only when streaming');
      return Promise.resolve(
        new Response(toolStreamBody(text), { headers: { 'content-type': 'text/event-stream' } }),
      );
    }
    if (body.stream === true) {
      return Promise.resolve(
        new Response(streamBody(text), { headers: { 'content-type': 'text/event-stream' } }),
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'deepseek-flash',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
  };
  return { fetch: fetch, requests };
}

export function testRuntime(pool: pg.Pool, model: FakeModel): GuideRuntime {
  const gateway = createGateway({ apiKey: 'test', fetch: model.fetch, maxAttempts: 1 });
  const registry = createToolRegistry();
  registerGuideToolExecutors(registry, guideReader(pool));
  return {
    pool,
    gateway,
    decisions: createDecisionClient({ apiKey: undefined, gateway }),
    registry,
    assertRouteOn: () => Promise.resolve(),
  };
}

export const jobContext = {} as JobContext;

/** A crew of `members` on a trip under way, with its guide. */
export async function crewTrip(
  pool: pg.Pool,
  members: readonly string[],
): Promise<{ crewId: string; tripId: string }> {
  const { rows: crews } = await pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Bali', $1) RETURNING id",
    [members[0]],
  );
  const crewId = crews[0]!.id;
  const { rows: trips } = await pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status, tz) VALUES ($1, 'setup', 'Asia/Makassar') RETURNING id",
    [crewId],
  );
  const tripId = trips[0]!.id;
  for (const [index, uid] of members.entries()) {
    const role = index === 0 ? 'organiser' : 'member';
    await pool.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      uid,
      role,
    ]);
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, role],
    );
  }
  return { crewId, tripId };
}

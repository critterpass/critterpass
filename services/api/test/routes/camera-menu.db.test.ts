/**
 * `POST /v1/camera/menu` on a migrated Postgres with real sessions: the reading comes back keyed
 * by the lines the phone sent, as one JSON body or as `item` events followed by `done` for a
 * caller that accepts an event stream; dietary flags appear only for a crew member whose flags
 * are shared, even when the model names someone else; a menu the guide read costs one question
 * and one that could not be read costs none; and a trip the caller is not on is refused before
 * the model is asked. The model is a recorded DeepSeek answer at the network boundary.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGateway, type Gateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCameraRoutes } from '../../src/routes/camera';
import { seedGuideTrip } from '../ai/guide-action-seed';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

/** The recorded reading of the noodle-shop menu below, with flags for Alex and Jordan. */
const RECORDED = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../packages/ai/evals/menu/fixtures/menu-01.json', import.meta.url),
    ),
    'utf8',
  ),
) as { response: { status: number; body: unknown } };

const LINES = [
  { id: 'l0', text: 'QUÁN MÌ QUẢNG BÀ MUA', bbox: [0.05, 0.08, 0.5, 0.04] },
  { id: 'l1', text: 'Mì Quảng gà 45.000', bbox: [0.05, 0.16, 0.5, 0.04] },
  { id: 'l2', text: 'Mì Quảng tôm thịt 50.000', bbox: [0.05, 0.24, 0.5, 0.04] },
  { id: 'l3', text: 'Gỏi cuốn chay 30.000', bbox: [0.05, 0.32, 0.5, 0.04] },
  { id: 'l4', text: 'Đậu hũ sốt đậu phộng 35.000', bbox: [0.05, 0.4, 0.5, 0.04] },
];

let harness: CommandDoorsHarness;
let modelCalls = 0;
let modelStatus = 200;

const gateway: Pick<Gateway, 'callModel'> = createGateway({
  apiKey: 'fixture-key',
  fetch: () => {
    modelCalls += 1;
    return Promise.resolve(
      modelStatus === 200
        ? Response.json(RECORDED.response.body, { status: RECORDED.response.status })
        : Response.json(
            { type: 'error', error: { type: 'api_error', message: 'down' } },
            {
              status: modelStatus,
            },
          ),
    );
  },
  maxAttempts: 1,
});

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) =>
      registerCameraRoutes(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        redis: deps.redis,
        gateway,
        heartbeatMs: 60_000,
      }),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

interface Crew {
  readonly alex: SignedIn;
  readonly jordan: SignedIn;
  readonly tripId: string;
}

/** Alex shares a peanut flag with the crew; Jordan is on the trip and shares nothing. */
async function crew(): Promise<Crew> {
  const alex = await harness.signInAnonymously();
  const jordan = await harness.signInAnonymously();
  await harness.pool.query("UPDATE users SET display_name = 'Alex Tran' WHERE id = $1", [alex.uid]);
  await harness.pool.query("UPDATE users SET display_name = 'Jordan Lee' WHERE id = $1", [
    jordan.uid,
  ]);
  const { tripId } = await seedGuideTrip(harness.pool, {
    organiser: alex.uid,
    members: [jordan.uid],
  });
  await harness.pool.query(
    "INSERT INTO participant_dietary_flags (trip_id, user_id, flags) VALUES ($1, $2, '{no_peanuts}')",
    [tripId, alex.uid],
  );
  return { alex, jordan, tripId };
}

const scan = (cookie: string, body: unknown, accept?: string): Promise<Response> =>
  harness.request('/v1/camera/menu', {
    method: 'POST',
    headers: {
      cookie,
      'x-cp-tz': 'Asia/Ho_Chi_Minh',
      ...(accept === undefined ? {} : { accept }),
    },
    body: JSON.stringify(body),
  });

async function questionsUsed(uid: string): Promise<number> {
  const { rows } = await harness.pool.query<{ used: number }>(
    `SELECT coalesce(sum(count), 0)::int AS used FROM usage_counters
      WHERE subject_id = $1 AND metric = 'guide_answers'`,
    [uid],
  );
  return rows[0]?.used ?? 0;
}

interface Item {
  readonly ocr_line_id: string;
  readonly flags: readonly { member: string; verdict: string }[];
  readonly price: { amount_minor: number | null; currency: string | null } | null;
}

function frames(text: string): { type: string; data: Record<string, unknown> }[] {
  return text
    .split('\n\n')
    .filter((block) => block.includes('event: '))
    .map((block) => ({
      type: /^event: (.*)$/mu.exec(block)?.[1] ?? '',
      data: JSON.parse(/^data: (.*)$/mu.exec(block)?.[1] ?? '{}') as Record<string, unknown>,
    }));
}

describe('POST /v1/camera/menu', () => {
  it('answers the reading as JSON, with flags only for the member who shares theirs', async () => {
    const { jordan, tripId } = await crew();
    const response = await scan(jordan.cookie, {
      trip_id: tripId,
      ocr_lines: LINES,
      currency_hint: 'VND',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = (await response.json()) as {
      status: string;
      items: Item[];
      checked_members: string[];
      source_language: string | null;
    };
    expect(body.status).toBe('ok');
    expect(body.checked_members).toEqual(['Alex']);
    expect(body.source_language).toBe('vi');
    expect(body.items.map((item) => item.ocr_line_id)).toEqual(['l1', 'l2', 'l3', 'l4']);
    // The recorded reading flags Jordan too; nothing of his is shared, so none of it is shown.
    const members = new Set(body.items.flatMap((item) => item.flags.map((flag) => flag.member)));
    expect([...members]).toEqual(['Alex']);
    expect(body.items.find((item) => item.ocr_line_id === 'l4')?.flags).toEqual([
      expect.objectContaining({ member: 'Alex', verdict: 'clash' }),
    ]);
    expect(body.items.map((item) => item.price?.amount_minor)).toEqual([
      45000, 50000, 30000, 35000,
    ]);
    expect(await questionsUsed(jordan.uid)).toBe(1);
  });

  it('streams one item per dish and then done to a caller that accepts events', async () => {
    const { alex, tripId } = await crew();
    const response = await scan(
      alex.cookie,
      { trip_id: tripId, ocr_lines: LINES, currency_hint: 'VND' },
      'text/event-stream',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = frames(await response.text());
    expect(events.map((event) => event.type)).toEqual(['item', 'item', 'item', 'item', 'done']);
    expect(events.slice(0, 4).map((event) => event.data['ocr_line_id'])).toEqual([
      'l1',
      'l2',
      'l3',
      'l4',
    ]);
    expect(events[0]?.data['price']).toMatchObject({ amount_minor: 45000, currency: 'VND' });
    expect(events[4]?.data).toMatchObject({
      status: 'ok',
      checked_members: ['Alex'],
      source_language: 'vi',
      ai_generated: true,
    });
    expect(events[4]?.data).not.toHaveProperty('items');
    expect(await questionsUsed(alex.uid)).toBe(1);
  });

  it('checks nobody on a scan outside a trip', async () => {
    const me = await harness.signInAnonymously();
    const response = await scan(me.cookie, { trip_id: null, ocr_lines: LINES });
    const body = (await response.json()) as { items: Item[]; checked_members: string[] };
    expect(body.checked_members).toEqual([]);
    expect(body.items.flatMap((item) => item.flags)).toEqual([]);
  });

  it('counts nothing when the menu could not be read', async () => {
    const { alex, tripId } = await crew();
    modelStatus = 500;
    try {
      const json = await scan(alex.cookie, { trip_id: tripId, ocr_lines: LINES });
      expect(json.status).toBe(200);
      expect(await json.json()).toMatchObject({ status: 'failed', items: [] });
      const stream = await scan(
        alex.cookie,
        { trip_id: tripId, ocr_lines: LINES },
        'text/event-stream',
      );
      const events = frames(await stream.text());
      expect(events.map((event) => event.type)).toEqual(['done']);
      expect(events[0]?.data).toMatchObject({ status: 'failed' });
    } finally {
      modelStatus = 200;
    }
    expect(await questionsUsed(alex.uid)).toBe(0);
  });

  it('refuses a trip the caller is not on before the model is asked', async () => {
    const { tripId } = await crew();
    const stranger = await harness.signInAnonymously();
    const before = modelCalls;
    const response = await scan(
      stranger.cookie,
      { trip_id: tripId, ocr_lines: LINES },
      'text/event-stream',
    );
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect(modelCalls).toBe(before);
    expect(await questionsUsed(stranger.uid)).toBe(0);
  });

  it('refuses a scan with no lines', async () => {
    const me = await harness.signInAnonymously();
    const response = await scan(me.cookie, { trip_id: null, ocr_lines: [] });
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('VALIDATION');
  });
});

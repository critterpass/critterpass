/**
 * The voice consent on the server: the speech token, a spoken guide turn and the phrase practice
 * tip all send a traveller's speech (or its words) to a vendor, so each answers `CONSENT_REQUIRED`
 * unless that person's `ai_voice` consent stands: granted and not withdrawn. Real sessions and a
 * migrated Postgres; Deepgram's grant and the model stream are recorded answers at the network
 * boundary. Typed turns never need the consent.
 */
import { randomUUID } from 'node:crypto';

import { createGateway, createToolRegistry, type Gateway } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiCompliance } from '../../src/ai/compliance';
import { createKillSwitches } from '../../src/ops/kill-switches';
import { registerGuideTurnRoute } from '../../src/routes/guide';
import { deepgramTokenMinter, registerSttTokenRoutes } from '../../src/routes/stt-token';
import { registerPhraseFeedbackRoute } from '../../src/routes/voice';
import { startCommandDoors, type CommandDoorsHarness } from './command-doors-harness';

/** Deepgram's documented grant answer: a JWT and its lifetime in seconds. */
const GRANT = { access_token: 'eyJhbGciOiJIUzI1NiJ9.grant.signature', expires_in: 60 };

let harness: CommandDoorsHarness;
let grants = 0;
let modelCalls = 0;

/** A fresh replay of the recorded model stream for each turn that reaches the model. */
const gateway: Gateway = {
  streamModel: (...args) => {
    modelCalls += 1;
    return replay().streamModel(...args);
  },
  callModel: (...args) => {
    modelCalls += 1;
    return replay().callModel(...args);
  },
};
const replay = (): Gateway =>
  createGateway({
    apiKey: 'fixture-key',
    fetch: fixtureTransport(['flash-stream']).fetch,
    maxAttempts: 1,
  });

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => {
      const grant = (() => {
        grants += 1;
        return Promise.resolve(Response.json(GRANT));
      }) as unknown as typeof fetch;
      registerSttTokenRoutes(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        redis: deps.redis,
        mint: deepgramTokenMinter('dg-key', grant),
      });
      registerPhraseFeedbackRoute(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        redis: deps.redis,
        gateway,
      });
      const switches = createKillSwitches(deps.pool);
      const logger = pino({ level: 'silent' });
      registerGuideTurnRoute(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        redis: deps.redis,
        turn: {
          gateway,
          switches,
          registry: createToolRegistry(),
          compliance: createApiCompliance({
            pool: deps.pool,
            typesafeApiKey: undefined,
            gateway: undefined,
            switches,
            logger,
          }),
          logger,
          heartbeatMs: 60_000,
        },
      });
    },
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

type Standing = 'granted' | 'never' | 'withdrawn';

/** A signed-in traveller whose `ai_voice` consent is in the given state. */
async function traveller(standing: Standing): Promise<{ cookie: string; uid: string }> {
  const me = await harness.signInAnonymously();
  if (standing !== 'never') {
    await harness.pool.query(
      `INSERT INTO consents (user_id, purpose, granted_at, revoked_at)
       VALUES ($1, 'ai_voice', now() - interval '2 days', $2)`,
      [me.uid, standing === 'withdrawn' ? new Date() : null],
    );
  }
  return me;
}

async function refusal(response: Response): Promise<unknown> {
  expect(response.status).toBe(403);
  const body = (await response.json()) as { error: Record<string, unknown> };
  return body.error;
}

const CONSENT_REQUIRED = {
  code: 'CONSENT_REQUIRED',
  retryable: false,
  detail: { purpose: 'ai_voice' },
};

const post = (cookie: string, path: string, body?: unknown): Promise<Response> =>
  harness.request(path, {
    method: 'POST',
    headers: { cookie, 'x-cp-tz': 'Asia/Ho_Chi_Minh' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('POST /v1/stt/token', () => {
  it('gives a token while the voice consent stands', async () => {
    const me = await traveller('granted');
    const response = await post(me.cookie, '/v1/stt/token');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: GRANT.access_token, scheme: 'bearer' });
  });

  it.each(['never', 'withdrawn'] as const)(
    'refuses, and asks Deepgram for nothing (consent: %s)',
    async (standing) => {
      const me = await traveller(standing);
      const before = grants;
      expect(await refusal(await post(me.cookie, '/v1/stt/token'))).toMatchObject(CONSENT_REQUIRED);
      expect(grants).toBe(before);
    },
  );

  it("does not take another purpose's consent for the voice one", async () => {
    const me = await traveller('never');
    await harness.pool.query(
      "INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'analytics', now())",
      [me.uid],
    );
    expect(await refusal(await post(me.cookie, '/v1/stt/token'))).toMatchObject(CONSENT_REQUIRED);
  });
});

describe('a guide turn', () => {
  const turn = (cookie: string, threadId: string, mode: 'voice' | 'text') =>
    post(cookie, `/v1/guide/threads/${threadId}/turns`, { text: 'Hi Tokek', mode });

  async function stored(threadId: string): Promise<number> {
    const { rows } = await harness.pool.query<{ n: number }>(
      `SELECT (SELECT count(*) FROM guide_threads WHERE id = $1)::int
            + (SELECT count(*) FROM guide_messages WHERE thread_id = $1)::int AS n`,
      [threadId],
    );
    return rows[0]?.n ?? 0;
  }

  it.each(['never', 'withdrawn'] as const)(
    'spoken is refused before anything is stored, counted or sent (consent: %s)',
    async (standing) => {
      const me = await traveller(standing);
      const threadId = randomUUID();
      const before = modelCalls;
      expect(await refusal(await turn(me.cookie, threadId, 'voice'))).toMatchObject(
        CONSENT_REQUIRED,
      );
      expect(modelCalls).toBe(before);
      expect(await stored(threadId)).toBe(0);
      const { rows } = await harness.pool.query(
        "SELECT 1 FROM usage_counters WHERE subject_id = $1 AND metric = 'guide_answers'",
        [me.uid],
      );
      expect(rows).toEqual([]);
    },
  );

  it('spoken is answered while the consent stands', async () => {
    const me = await traveller('granted');
    const response = await turn(me.cookie, randomUUID(), 'voice');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('event: done');
  });

  it('typed is answered without the consent', async () => {
    const me = await traveller('never');
    const response = await turn(me.cookie, randomUUID(), 'text');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('event: done');
  });
});

describe('POST /v1/guide/phrase-feedback', () => {
  const attempt = { phrase_id: randomUUID(), language: 'vi', recognised: 'cam on' };

  it.each(['never', 'withdrawn'] as const)(
    'refuses what the device heard (consent: %s)',
    async (standing) => {
      const me = await traveller(standing);
      const before = modelCalls;
      expect(
        await refusal(await post(me.cookie, '/v1/guide/phrase-feedback', attempt)),
      ).toMatchObject(CONSENT_REQUIRED);
      expect(modelCalls).toBe(before);
    },
  );

  it('goes on to the phrase while the consent stands', async () => {
    const me = await traveller('granted');
    // No such card: the consent check passed and the lookup answered.
    const response = await post(me.cookie, '/v1/guide/phrase-feedback', attempt);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });
});

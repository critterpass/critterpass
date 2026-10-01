/**
 * The guide in crew chat against a migrated Postgres, with the model answered at the network
 * boundary: a mention is answered once, streamed to the crew and posted as the guide, on the
 * asker's meter unless a crewmate has Pass+ (then only the silent fair-use counter moves). A
 * proactive offer carries the trigger's numbers from the template, sends the model no supplier
 * text, never searches the web, books nothing, respects the crew's daily cap and stays quiet when
 * the classifier is unsure.
 */
import { randomUUID } from 'node:crypto';

import { GUIDE_PROACTIVE_CAP_KEY, type GuideProactiveJob } from '@cp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { guideMentionJob } from '../../src/jobs/guide/mention';
import { guideProactiveJob } from '../../src/jobs/guide/proactive';
import { insertEvent, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { crewTrip, fakeModel, jobContext, testRuntime, type Reply } from './guide-fixtures';

let db: NotifyDb;

beforeAll(async () => {
  db = await startNotifyDb();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function mention(crewId: string, tripId: string, asker: string, body: string) {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO messages (crew_id, trip_id, sender_kind, sender_id, type, body, mentions_guide)
     VALUES ($1, $2, 'user', $3, 'text', $4, true) RETURNING id`,
    [crewId, tripId, asker, body],
  );
  const messageId = rows[0]!.id;
  const eventId = await insertEvent(
    db.pool,
    'chat.guide_mentioned',
    { crew_id: crewId, message_id: messageId, trip_id: tripId, asker_id: asker },
    { crewId, tripId, actorId: asker },
  );
  return { messageId, eventId };
}

async function answerMention(reply: Reply, eventId: string) {
  const model = fakeModel(reply);
  const job = guideMentionJob(testRuntime(db.pool, model));
  const result = await job.handler({ event_id: eventId }, jobContext);
  return { result, model };
}

async function guideAnswers(uid: string): Promise<number> {
  const { rows } = await db.pool.query<{ count: number }>(
    "SELECT coalesce(sum(count), 0)::int AS count FROM usage_counters WHERE subject_id = $1 AND metric = 'guide_answers'",
    [uid],
  );
  return rows[0]?.count ?? 0;
}

describe('ai.guide_mention', () => {
  it('answers on the asker’s meter, streams to the crew and posts the reply once', async () => {
    const asker = await insertUser(db.pool);
    const mate = await insertUser(db.pool);
    const { crewId, tripId } = await crewTrip(db.pool, [asker, mate]);
    const { messageId, eventId } = await mention(crewId, tripId, asker, '@Tokek dinner ideas?');

    const { result, model } = await answerMention(() => 'Try Warung Biah, crew!', eventId);
    expect(result).toEqual({ outcome: 'answered' });
    expect(await guideAnswers(asker)).toBe(1);

    const reply = await db.pool.query<{ body: string; reply_to_id: string; sender_kind: string }>(
      "SELECT body, reply_to_id, sender_kind FROM messages WHERE crew_id = $1 AND sender_kind = 'guide'",
      [crewId],
    );
    expect(reply.rows).toEqual([
      { body: 'Try Warung Biah, crew!', reply_to_id: messageId, sender_kind: 'guide' },
    ]);
    const tokens = await db.pool.query<{ payload: { type: string } }>(
      'SELECT payload FROM rt_outbox WHERE channel = $1 ORDER BY id',
      [`crew_chat:${crewId}`],
    );
    expect(tokens.rows.map((row) => row.payload.type)).toEqual([
      'typing',
      'guide.token',
      'message.created',
    ]);
    // An @mention may search the web; the offered tools read or propose only.
    const request = model.requests[0] as { tools: { name: string }[]; tool_choice?: unknown };
    expect(request.tools.map((tool) => tool.name)).toContain('web_search');
    expect(request.tool_choice).toBeUndefined();

    const again = await answerMention(() => 'twice?', eventId);
    expect(again.result).toEqual({ outcome: 'already_answered' });
    expect(again.model.requests).toHaveLength(0);
  });

  it('is unmetered when a crewmate has Pass+, counting only the silent fair-use cap', async () => {
    const asker = await insertUser(db.pool);
    const mate = await insertUser(db.pool);
    await db.pool.query(
      'INSERT INTO user_entitlements (user_id, guide_unlimited_global) VALUES ($1, true)',
      [mate],
    );
    const { crewId, tripId } = await crewTrip(db.pool, [asker, mate]);
    const { eventId } = await mention(crewId, tripId, asker, '@Tokek is it going to rain?');

    const { result } = await answerMention(() => 'Clear skies till four.', eventId);
    expect(result).toEqual({ outcome: 'answered' });
    expect(await guideAnswers(asker)).toBe(0);
    const fairUse = await db.pool.query<{ count: number }>(
      "SELECT count FROM fair_use_counters WHERE user_id = $1 AND metric = 'guide_tokens'",
      [asker],
    );
    expect(fairUse.rows).toEqual([{ count: 1 }]);
    const turn = await db.pool.query<{ metered: boolean; status: string }>(
      'SELECT metered, status FROM guide_crew_turns WHERE asker_id = $1',
      [asker],
    );
    expect(turn.rows).toEqual([{ metered: false, status: 'answered' }]);
  });
});

describe('guide.proactive', () => {
  let crewId: string;
  let tripId: string;
  let poiId: string;

  const yesThenLine: Reply = (request) =>
    JSON.stringify(request.system ?? '').includes('<state>') ||
    JSON.stringify(request.messages).includes('<state>')
      ? JSON.stringify({ chime_in: { answer: 'yes' } })
      : 'Fancy a slow spa afternoon?';

  function trigger(offerRef: string): GuideProactiveJob {
    return {
      crew_id: crewId,
      trip_id: tripId,
      trigger: {
        kind: 'bookable_slot',
        poi_id: poiId,
        offer_ref: offerRef,
        starts_at: new Date(Date.now() + 6 * 3_600_000).toISOString(),
        slots: 3,
        price_from_minor: 350_000,
        currency: 'IDR',
      },
    };
  }

  beforeEach(async () => {
    const a = await insertUser(db.pool);
    const b = await insertUser(db.pool);
    ({ crewId, tripId } = await crewTrip(db.pool, [a, b]));
    const { rows } = await db.pool.query<{ id: string }>(
      `WITH d AS (
         INSERT INTO destinations (slug, name, coverage, tz)
         VALUES ('bali-' || substr(md5(random()::text), 1, 8), 'Bali', 'live', 'Asia/Makassar')
         RETURNING id
       )
       INSERT INTO pois (destination_id, name, category, lat, lng)
       SELECT id, 'Karsa Spa', 'temple_shrine', -8.5, 115.26 FROM d RETURNING id`,
    );
    poiId = rows[0]!.id;
  });

  it('posts a templated offer, sends no supplier text and books nothing', async () => {
    const model = fakeModel(yesThenLine);
    const job = guideProactiveJob(testRuntime(db.pool, model));
    const result = await job.handler(trigger('viator:SUPPLIER-XYZ-123'), jobContext);
    expect(result).toMatchObject({ outcome: 'posted', source: 'model' });

    const posted = await db.pool.query<{ body: string; type: string }>(
      "SELECT body, type FROM messages WHERE crew_id = $1 AND sender_kind = 'guide'",
      [crewId],
    );
    expect(posted.rows[0]?.type).toBe('guide_offer');
    expect(posted.rows[0]?.body).toMatch(
      /^Fancy a slow spa afternoon\? Karsa Spa has 3 slots at \d{2}:\d{2}, from Rp\s350,000 each\./u,
    );
    expect(JSON.stringify(model.requests)).not.toContain('SUPPLIER-XYZ');
    // Unasked, the guide never searches the web: no request offers a tool.
    expect(model.requests.every((request) => request['tools'] === undefined)).toBe(true);
    const offer = await db.pool.query<{ slots_taken: number; status: string }>(
      'SELECT slots_taken, status FROM guide_offers WHERE trip_id = $1',
      [tripId],
    );
    expect(offer.rows).toEqual([{ slots_taken: 0, status: 'open' }]);
    const claims = await db.pool.query('SELECT 1 FROM guide_offer_claims WHERE trip_id = $1', [
      tripId,
    ]);
    expect(claims.rowCount).toBe(0);
  });

  it('keeps to the crew’s daily cap and never repeats a trigger', async () => {
    await db.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ($1, '1'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = '1'::jsonb`,
      [GUIDE_PROACTIVE_CAP_KEY],
    );
    try {
      const job = guideProactiveJob(testRuntime(db.pool, fakeModel(yesThenLine)));
      const first = trigger(`ref-${randomUUID()}`);
      expect(await job.handler(first, jobContext)).toMatchObject({ outcome: 'posted' });
      expect(await job.handler(first, jobContext)).toEqual({ outcome: 'quiet' });
      expect(await job.handler(trigger(`ref-${randomUUID()}`), jobContext)).toEqual({
        outcome: 'quiet',
      });
    } finally {
      await db.pool.query('DELETE FROM ops.ops_config WHERE key = $1', [GUIDE_PROACTIVE_CAP_KEY]);
    }
  });

  it('stays quiet when the chime-in classifier is not sure', async () => {
    const model = fakeModel(() => JSON.stringify({ chime_in: { answer: 'likely_yes' } }));
    const job = guideProactiveJob(testRuntime(db.pool, model));
    expect(await job.handler(trigger(`ref-${randomUUID()}`), jobContext)).toEqual({
      outcome: 'quiet',
    });
    const posted = await db.pool.query(
      "SELECT 1 FROM messages WHERE crew_id = $1 AND sender_kind = 'guide'",
      [crewId],
    );
    expect(posted.rowCount).toBe(0);
  });
});

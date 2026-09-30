/**
 * `guide.proactive`: the guide offers a bookable slot in crew chat ("Karsa Spa has three
 * slots at 14:00. Tap in and I'll book it and split it"). Unmetered system work, and quiet by
 * default: nothing is posted while the kill switch is off, once the crew's daily cap is spent,
 * when most of the crew asked the guide to be quiet, or unless the chime-in classifier is sure.
 * The facts come from the trigger's numbers through a template; supplier text never reaches the
 * model. Posting books nothing: each member taps I'M IN, and a booking or split needs its own
 * confirm. Never searches the web.
 */
import { packFor, shouldChimeIn, writeGuideOffer, type OfferFacts } from '@cp/ai';
import { emitEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  GUIDE_PROACTIVE_CAP_KEY,
  GUIDE_PROACTIVE_DEFAULT_CAP,
  GUIDE_PROACTIVE_SWITCH,
  GUIDE_QUEUES,
  guideProactiveJobSchema,
  proactiveAllowed,
  type GuideProactiveJob,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob } from '../../boss';
import { guideReader, type GuideRuntime } from './runtime';

async function config(tx: pg.PoolClient, key: string): Promise<unknown> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM ops.ops_config WHERE key = $1',
    [key],
  );
  return rows[0]?.value;
}

/** Claims the trigger for this crew when the guide may still chime in today; null otherwise. */
async function claim(tx: pg.PoolClient, data: GuideProactiveJob): Promise<string | null> {
  const cap = await config(tx, GUIDE_PROACTIVE_CAP_KEY);
  const { rows: posted } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM guide_crew_turns
      WHERE crew_id = $1 AND kind = 'proactive' AND status = 'answered'
        AND created_at > now() - interval '24 hours'`,
    [data.crew_id],
  );
  const { rows: crew } = await tx.query<{ members: number; quiet: number }>(
    `SELECT count(*)::int AS members,
            count(*) FILTER (WHERE s.chattiness = 'quiet')::int AS quiet
       FROM crew_members cm LEFT JOIN user_settings s ON s.user_id = cm.user_id
      WHERE cm.crew_id = $1 AND cm.status = 'active'`,
    [data.crew_id],
  );
  const allowed = proactiveAllowed({
    enabled: (await config(tx, GUIDE_PROACTIVE_SWITCH)) !== false,
    postedToday: posted[0]?.n ?? 0,
    cap: typeof cap === 'number' ? cap : GUIDE_PROACTIVE_DEFAULT_CAP,
    members: crew[0]?.members ?? 0,
    quietMembers: crew[0]?.quiet ?? 0,
  });
  if (!allowed) return null;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO guide_crew_turns (crew_id, trip_id, kind, trigger_key)
     VALUES ($1, $2, 'proactive', $3) ON CONFLICT (crew_id, trigger_key) WHERE trigger_key IS NOT NULL
     DO NOTHING RETURNING id`,
    [data.crew_id, data.trip_id, `${data.trigger.offer_ref}@${data.trigger.starts_at}`],
  );
  return rows[0]?.id ?? null;
}

interface TripFacts {
  readonly place_name: string | null;
  readonly tz: string;
  readonly guide_id: string | null;
  readonly guide_slug: string | null;
  readonly organiser_id: string;
}

async function tripFacts(
  tx: pg.PoolClient,
  data: GuideProactiveJob,
): Promise<TripFacts | undefined> {
  const { rows } = await tx.query<TripFacts>(
    `SELECT p.name AS place_name, coalesce(t.tz, d.tz, 'UTC') AS tz, t.guide_id, g.slug AS guide_slug,
            (SELECT user_id FROM trip_participants WHERE trip_id = t.id AND role = 'organiser' LIMIT 1)
              AS organiser_id
       FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
       LEFT JOIN pois p ON p.id = $2
      WHERE t.id = $1 AND t.crew_id = $3`,
    [data.trip_id, data.trigger.poi_id, data.crew_id],
  );
  return rows[0];
}

export function guideProactiveJob(runtime: GuideRuntime) {
  return defineJob({
    queue: GUIDE_QUEUES.proactive,
    schema: guideProactiveJobSchema,
    singletonKey: (data) => `${data.crew_id}:${data.trigger.offer_ref}@${data.trigger.starts_at}`,
    async handler(data) {
      const { pool } = runtime;
      const setup = await withSystem(pool, async (tx) => {
        const facts = await tripFacts(tx, data);
        if (facts?.place_name === null || facts === undefined) return null;
        const turnId = await claim(tx, data);
        return turnId === null ? null : { turnId, facts };
      });
      if (setup === null) return { outcome: 'quiet' };
      const { turnId, facts } = setup;
      const offer: OfferFacts = {
        placeName: facts.place_name ?? '',
        slots: data.trigger.slots,
        startsAt: data.trigger.starts_at,
        tz: facts.tz,
        priceFromMinor: data.trigger.price_from_minor,
        currency: data.trigger.currency,
      };
      const usage = { crewId: data.crew_id, tripId: data.trip_id };
      if (!(await shouldChimeIn(runtime.decisions, offer, usage))) {
        await withSystem(pool, (tx) =>
          tx.query("UPDATE guide_crew_turns SET status = 'skipped' WHERE id = $1", [turnId]),
        );
        return { outcome: 'quiet' };
      }
      const pack = await packFor(
        guideReader(pool),
        facts.organiser_id,
        data.trip_id,
        facts.guide_slug,
      );
      const text = await writeGuideOffer(runtime.gateway, pack, offer, usage);
      const posted = await withSystem(pool, async (tx) => {
        const { rows: offers } = await tx.query<{ id: string }>(
          `INSERT INTO guide_offers (trip_id, kind, slots_total, expires_at, target_ref)
           VALUES ($1, 'book_activity', $2, $3, $4) RETURNING id`,
          [
            data.trip_id,
            data.trigger.slots,
            data.trigger.starts_at,
            JSON.stringify({
              poi_id: data.trigger.poi_id,
              offer_ref: data.trigger.offer_ref,
              starts_at: data.trigger.starts_at,
              price_from_minor: data.trigger.price_from_minor,
              currency: data.trigger.currency,
            }),
          ],
        );
        const offerId = offers[0]?.id as string;
        const { rows: messages } = await tx.query<{ id: string; seq: string }>(
          `INSERT INTO messages (crew_id, trip_id, sender_kind, guide_id, type, body, ref_kind, ref_id)
           VALUES ($1, $2, 'guide', $3, 'guide_offer', $4, 'guide_offer', $5) RETURNING id, seq`,
          [data.crew_id, data.trip_id, facts.guide_id, text.text, offerId],
        );
        const message = messages[0] as { id: string; seq: string };
        await tx.query('UPDATE guide_offers SET message_id = $1 WHERE id = $2', [
          message.id,
          offerId,
        ]);
        await tx.query(
          "UPDATE guide_crew_turns SET status = 'answered', reply_message_id = $2 WHERE id = $1",
          [turnId, message.id],
        );
        await outbox(tx, channelName('crew_chat', data.crew_id), 'message.created', {
          crew_id: data.crew_id,
          message_id: message.id,
          seq: Number(message.seq),
        });
        await emitEvent(tx, {
          type: 'guide.offer_posted',
          aggregateKind: 'guide_offer',
          aggregateId: offerId,
          actorKind: 'guide',
          actorId: null,
          crewId: data.crew_id,
          tripId: data.trip_id,
          payload: {
            crew_id: data.crew_id,
            trip_id: data.trip_id,
            offer_id: offerId,
            message_id: message.id,
          },
        });
        return { offerId, messageId: message.id, source: text.source };
      });
      return { outcome: 'posted', ...posted };
    },
  });
}

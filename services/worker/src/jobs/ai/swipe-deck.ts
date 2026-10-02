/**
 * `ai.swipe_deck` (docs/api-contracts-async.md §2): builds a new swipe session's deck. Ranking is
 * code (`rankDeck`): the destination's curated places minus those already in the plan, by the
 * crew's taste tags, crew saves, must-sees and distance from the stay. The guide then notes each
 * card in one batch that sees only card ids and our own place data (never supplier content or crew
 * chat); a failed or rejected call leaves the cards without notes. The session goes live after.
 */
import { personaIdSchema, recordUsage, writeDeckNotes, type DeckNoteCard } from '@cp/ai';
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  EXPLORE_QUEUES,
  rankDeck,
  SWIPE_RT,
  swipeDeckJobSchema,
  type CrewTaste,
  type DeckCandidate,
  type SwipeCard,
  type SwipeDeckJob,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import type { GatewayFactory } from '../explore';

interface SessionFacts {
  readonly trip_id: string;
  readonly destination_id: string;
  readonly destination: string;
  readonly version_id: string | null;
  readonly guide: string | null;
  readonly status: string;
}

interface PlaceRow {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string;
  readonly tags: string[];
  readonly must_see: boolean;
  readonly why_go: string | null;
  readonly distance_m: number | null;
  readonly crew_saves: number;
  readonly in_plan: boolean;
}

async function sessionFacts(
  tx: pg.PoolClient,
  sessionId: string,
): Promise<SessionFacts | undefined> {
  const { rows } = await tx.query<SessionFacts>(
    `SELECT s.trip_id, s.destination_id, d.name AS destination, t.current_version_id AS version_id,
            g.slug AS guide, s.status
       FROM swipe_sessions s JOIN trips t ON t.id = s.trip_id
       JOIN destinations d ON d.id = s.destination_id LEFT JOIN guides g ON g.id = t.guide_id
      WHERE s.id = $1`,
    [sessionId],
  );
  return rows[0];
}

/** The destination's curated places with the plan, stay and crew signals the ranking needs. */
async function candidates(tx: pg.PoolClient, facts: SessionFacts): Promise<PlaceRow[]> {
  const { rows } = await tx.query<PlaceRow>(
    `WITH plan AS (
       SELECT i.poi_id, p.category, p.lat, p.lng FROM plan_items i JOIN pois p ON p.id = i.poi_id
        WHERE i.version_id = $2
     ), stay AS (SELECT lat, lng FROM plan WHERE category = 'stay' LIMIT 1),
     crew AS (
       SELECT user_id FROM trip_participants WHERE trip_id = $3 AND rsvp IS DISTINCT FROM 'out'
     )
     SELECT p.id AS poi_id, p.name, p.category, p.tags,
            coalesce((p.editorial->>'must_see')::boolean, false) AS must_see,
            p.editorial->>'why_go' AS why_go,
            (SELECT round(ST_Distance(p.location, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326)::geography))::int
               FROM stay s) AS distance_m,
            (SELECT count(*)::int FROM saved_items si
              WHERE si.kind = 'poi' AND si.ref_id = p.id AND si.user_id IN (SELECT user_id FROM crew))
              AS crew_saves,
            EXISTS (SELECT 1 FROM plan WHERE plan.poi_id = p.id) AS in_plan
       FROM pois p
      WHERE p.destination_id = $1 AND p.curation = 'editorial' AND p.status = 'active'
        AND p.merged_into_id IS NULL AND p.category NOT IN ('stay', 'transit', 'health')`,
    [facts.destination_id, facts.version_id, facts.trip_id],
  );
  return rows;
}

/** How many of the going crew hold each taste tag; tags a member hid from the crew never count. */
export async function crewTaste(
  tx: pg.PoolClient,
  tripId: string,
): Promise<{ taste: CrewTaste; size: number }> {
  const { rows } = await tx.query<{ tag: string | null; n: number; size: number }>(
    `WITH crew AS (
       SELECT user_id FROM trip_participants WHERE trip_id = $1 AND rsvp IS DISTINCT FROM 'out'
     )
     SELECT lower(t.tag) AS tag, count(DISTINCT tp.user_id)::int AS n,
            (SELECT count(*)::int FROM crew) AS size
       FROM crew LEFT JOIN taste_profiles tp ON tp.user_id = crew.user_id AND tp.visibility = 'crew'
       LEFT JOIN LATERAL unnest(tp.tags) AS t (tag) ON true
      GROUP BY 1`,
    [tripId],
  );
  const taste: Record<string, number> = {};
  for (const row of rows) if (row.tag !== null) taste[row.tag] = row.n;
  return { taste, size: rows[0]?.size ?? 1 };
}

export type SwipeDeckOutcome = 'missing' | 'not_building' | 'live';

export async function buildSwipeDeck(
  pool: pg.Pool,
  job: SwipeDeckJob,
  writer: GatewayFactory | undefined,
): Promise<{ outcome: SwipeDeckOutcome; cards: number }> {
  const loaded = await withSystem(pool, async (tx) => {
    const facts = await sessionFacts(tx, job.session_id);
    if (facts === undefined || facts.status !== 'building') return { facts };
    const places = await candidates(tx, facts);
    const { taste, size } = await crewTaste(tx, facts.trip_id);
    const input: DeckCandidate[] = places;
    return { facts, places, deck: rankDeck(input, taste, size) };
  });
  const { facts } = loaded;
  if (facts === undefined) return { outcome: 'missing', cards: 0 };
  if (loaded.deck === undefined) return { outcome: 'not_building', cards: 0 };
  const byId = new Map(loaded.places.map((place) => [place.poi_id, place]));
  const local: DeckNoteCard[] = loaded.deck.map((card, index) => {
    const place = byId.get(card.poi_id);
    return {
      id: `c${index + 1}`,
      name: place?.name ?? '',
      category: place?.category ?? 'other',
      tags: place?.tags ?? [],
      why_go: place?.why_go ?? null,
    };
  });
  const guide = personaIdSchema.safeParse(facts.guide);
  const notes =
    writer === undefined
      ? new Map<string, string>()
      : await writeDeckNotes(
          writer((record) => recordUsage((fn) => withSystem(pool, fn), record)),
          {
            guide: guide.success ? guide.data : 'guest',
            destination: facts.destination,
            cards: local,
          },
          { tripId: facts.trip_id },
        );
  const deck: SwipeCard[] = loaded.deck.map((card, index) => ({
    ...card,
    note: notes.get(`c${index + 1}`) ?? null,
  }));
  return withSystem(pool, async (tx) => {
    const updated = await tx.query(
      "UPDATE swipe_sessions SET deck = $2, status = 'live' WHERE id = $1 AND status = 'building'",
      [job.session_id, JSON.stringify(deck)],
    );
    if ((updated.rowCount ?? 0) === 0) return { outcome: 'not_building' as const, cards: 0 };
    await appendDomainEvent(tx, {
      type: 'swipe.deck_ready',
      aggregateKind: 'swipe_session',
      aggregateId: job.session_id,
      actorKind: 'system',
      actorId: null,
      tripId: facts.trip_id,
      payload: { trip_id: facts.trip_id, session_id: job.session_id, cards: deck.length },
    });
    await outbox(tx, channelName('swipe', job.session_id), SWIPE_RT.deckReady, {
      cards: deck.length,
    });
    return { outcome: 'live' as const, cards: deck.length };
  });
}

export function swipeDeckJob(writer?: GatewayFactory): JobDefinition<SwipeDeckJob> {
  return defineJob({
    queue: EXPLORE_QUEUES.swipeDeck,
    schema: swipeDeckJobSchema,
    singletonKey: (data: SwipeDeckJob) => data.session_id,
    handler: (data, ctx) => buildSwipeDeck(ctx.pool, data, writer),
  });
}

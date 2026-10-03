/**
 * `GET /v1/trips/{id}/places/{poiId}/split` (docs/api-contracts-planning.md): where the crew stands
 * on a place, in their own words, who has not said, and two ways nobody loses. Code builds the
 * candidates; the guide (`places.compromise`) picks two and words them, under the caller's silent
 * fair-use cap; otherwise the first two are worded from templates. Options are kept an hour per
 * (trip, place, stances, plan version, language). Participants only; anyone else is NOT_FOUND.
 */
import { personaIdSchema, writePlaceCompromise, type Gateway, type PersonaId } from '@cp/ai';
import { withUser } from '@cp/db';
import { PLANNING_CONFIG_DEFAULTS, type PlaceStance } from '@cp/domain';
import { fairUseDecision } from '@cp/entitlements';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import type { AppEnv } from '../../app';
import type { CommandDoorDeps } from '../../commands/_framework/doors';
import { requireCommandSession } from '../../commands/_framework/session';
import { placeFacts } from '../../explore/plan-read';
import { tripFitFacts } from '../fit/context';
import { buildCandidates, type SplitCandidate, type SplitCost } from './candidates';
import {
  readCached,
  splitCacheKey,
  stancesHash,
  writeCached,
  type SplitCacheClient,
} from './cache';
import { readStanceLines, stanceCrew, summarise } from './stances';
import { templateWords } from './templates';

export interface SplitOption {
  readonly option_id: string;
  readonly kind: SplitCandidate['kind'];
  readonly title: string;
  readonly body: string;
  readonly worded_by: 'guide' | 'template';
  readonly attendee_ids: readonly string[];
  readonly day_id: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly poi_id: string;
  readonly place_name: string;
  readonly cost: SplitCost | null;
  readonly going_count: number;
}

export interface SplitView {
  readonly poi_id: string;
  readonly stances: readonly { user_id: string; stance: PlaceStance; note: string | null }[];
  readonly silent_user_ids: readonly string[];
  readonly split: boolean;
  readonly options: readonly SplitOption[];
}

export interface SplitDeps {
  readonly redis: SplitCacheClient;
  readonly gateway?: Pick<Gateway, 'callModel'> | undefined;
}

const FAIR_USE_METRIC = 'place_compromise';
const DEFAULT_GUIDE: PersonaId = 'tokek';

async function crewFacts(tx: pg.PoolClient, tripId: string, crew: readonly string[]) {
  const { rows } = await tx.query<{ guide: string | null; locale: string; crew_id: string }>(
    `SELECT g.slug AS guide, app.user_locale(app.uid()) AS locale, t.crew_id
       FROM trips t LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = $1`,
    [tripId],
  );
  // The crew's own first names: the caller is a participant, so these are their crewmates.
  const names = await asSystemRole(tx, () =>
    tx.query<{ id: string; name: string | null }>(
      'SELECT id, display_name AS name FROM users WHERE id = ANY($1::uuid[])',
      [crew],
    ),
  );
  const guide = personaIdSchema.safeParse(rows[0]?.guide);
  return {
    guide: guide.success ? guide.data : DEFAULT_GUIDE,
    locale: rows[0]?.locale ?? 'en',
    crewId: rows[0]?.crew_id ?? null,
    names: new Map(
      names.rows.map((row) => [row.id, (row.name ?? '').trim().split(/\s+/u)[0] ?? '']),
    ),
  };
}

/** One more compromise call for the caller today; false once their silent cap is spent. */
async function underFairUse(tx: pg.PoolClient): Promise<boolean> {
  const cap = await asSystemRole(tx, () =>
    tx.query<{ value: unknown }>(
      "SELECT value FROM ops.ops_config WHERE key = 'fair_use.place_compromise_per_day'",
    ),
  );
  const value = cap.rows[0]?.value;
  const limit =
    typeof value === 'number'
      ? value
      : PLANNING_CONFIG_DEFAULTS['fair_use.place_compromise_per_day'];
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { rows } = await tx.query<{ bump: { count: number; cap: number } }>(
    'SELECT app.bump_fair_use(app.uid(), $1, $2, $3) AS bump',
    [FAIR_USE_METRIC, day, limit],
  );
  const bump = rows[0]?.bump;
  return bump === undefined || fairUseDecision(bump.count, bump.cap) === 'ok';
}

function optionOf(
  candidate: SplitCandidate,
  words: { title: string; body: string },
  by: SplitOption['worded_by'],
): SplitOption {
  return {
    option_id: candidate.id,
    kind: candidate.kind,
    title: words.title,
    body: words.body,
    worded_by: by,
    attendee_ids: candidate.attendeeIds,
    day_id: candidate.dayId,
    starts_at: candidate.startsAtIso,
    ends_at: candidate.endsAtIso,
    poi_id: candidate.poiId,
    place_name: candidate.placeName,
    cost: candidate.money,
    going_count: candidate.goingCount,
  };
}

/**
 * The split view. With `optionIds` (posting a decision), the options are exactly those, from the
 * cache when it still holds them, else rebuilt by code and worded from templates without a model
 * call; an id no candidate has is left out.
 */
export async function readSplit(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly poiId: string;
    readonly optionIds?: readonly string[];
  },
  deps: SplitDeps,
): Promise<SplitView> {
  const trip = await tripFitFacts(tx, input.tripId);
  const place = await placeFacts(tx, input.poiId);
  const lines = await readStanceLines(tx, trip.id, input.poiId);
  const crew = await stanceCrew(tx, trip.id);
  const summary = summarise(lines, crew);
  const view = {
    poi_id: input.poiId,
    stances: lines.map(({ user_id, stance, note }) => ({ user_id, stance, note })),
    silent_user_ids: summary.silent_user_ids,
    split: summary.split,
  };
  if (!summary.split) return { ...view, options: [] };
  const facts = await crewFacts(tx, trip.id, crew);
  const key = splitCacheKey({
    tripId: trip.id,
    poiId: input.poiId,
    stances: stancesHash(lines),
    versionId: trip.versionId,
    locale: facts.locale,
  });
  const cached = await readCached<SplitOption[]>(deps.redis, key);
  const wanted = input.optionIds;
  if (cached !== null && wanted === undefined) return { ...view, options: cached };
  const hits = wanted?.flatMap((id) => cached?.filter((o) => o.option_id === id) ?? []) ?? [];
  if (wanted !== undefined && hits.length === wanted.length) return { ...view, options: hits };
  const candidates = await buildCandidates(tx, {
    tripId: trip.id,
    destinationId: trip.destinationId,
    place: { poiId: input.poiId, name: place.name },
    placeFacts: place,
    people: { crew, want: summary.want, names: facts.names },
  });
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (wanted !== undefined) {
    const picked = wanted.flatMap((id) => {
      const candidate = byId.get(id);
      return candidate === undefined
        ? []
        : [optionOf(candidate, templateWords(candidate, facts.locale), 'template')];
    });
    return { ...view, options: picked };
  }
  const worded =
    deps.gateway !== undefined && candidates.length >= 2 && (await underFairUse(tx))
      ? await writePlaceCompromise(
          deps.gateway,
          {
            guide: facts.guide,
            locale: facts.locale,
            placeName: place.name,
            stances: lines.map((line) => ({
              name: facts.names.get(line.user_id) ?? '',
              stance: line.stance,
              note: line.note,
            })),
            silent: summary.silent_user_ids.map((uid) => facts.names.get(uid) ?? ''),
            candidates,
          },
          { usage: { userId: null, tripId: trip.id, crewId: facts.crewId } },
        )
      : null;
  const options =
    worded?.ok === true
      ? worded.options.flatMap((option) => {
          const candidate = byId.get(option.candidateId);
          return candidate === undefined ? [] : [optionOf(candidate, option, 'guide')];
        })
      : candidates
          .slice(0, 2)
          .map((candidate) =>
            optionOf(candidate, templateWords(candidate, facts.locale), 'template'),
          );
  await writeCached(deps.redis, key, options);
  return { ...view, options };
}

const params = z.object({ id: z.uuid(), poiId: z.uuid() });

export function registerSplitRoute(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'> & SplitDeps,
): void {
  app.get('/v1/trips/:id/places/:poiId/split', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id, poiId } = params.parse(c.req.param());
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      readSplit(tx, { tripId: id, poiId }, deps),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}

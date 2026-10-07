/**
 * The critters contributor: the forms the travellers found on the trip and the critters some of
 * them met for the first time, and the one that got away (the destination's epic or legendary form
 * nobody on the trip found, closest-missed first, the destination's own critter before the rest of
 * its country's set). Per traveller: their finds; per day: finds.
 */
import { selectGotAway, windowRuleSchema, type GotAwayCandidate } from '@cp/domain';
import type pg from 'pg';

import { addDayScore, addMetric, type RecapContributor, type RecapScope } from './types';

interface FindRow {
  readonly user_id: string;
  readonly form_id: string;
  readonly critter_id: string;
  readonly local_date: string;
  readonly first_of_critter: boolean;
}

async function loadFinds(tx: pg.PoolClient, scope: RecapScope): Promise<FindRow[]> {
  const { rows } = await tx.query<FindRow>(
    `SELECT ce.user_id, ce.form_id, ce.critter_id,
            (ce.found_at AT TIME ZONE $3)::date::text AS local_date,
            NOT EXISTS (
              SELECT 1 FROM collection_entries earlier
               WHERE earlier.user_id = ce.user_id AND earlier.critter_id = ce.critter_id
                 AND earlier.found_at < ce.found_at
            ) AS first_of_critter
       FROM collection_entries ce
      WHERE ce.trip_id = $1 AND ce.user_id = ANY($2::uuid[])
      ORDER BY ce.found_at, ce.id`,
    [scope.trip.id, scope.members, scope.trip.tz],
  );
  return rows;
}

interface CandidateRow {
  readonly form_id: string;
  readonly critter_id: string;
  readonly critter_key: string;
  readonly critter_no: number;
  readonly own: boolean;
  readonly rarity: 'epic' | 'legendary';
  readonly rules: { kind: string; rule: unknown }[];
  readonly forms_total: number;
  readonly sightings: number;
  readonly wandered_off: number;
  readonly seen_by: string[];
}

async function loadCandidates(
  tx: pg.PoolClient,
  scope: RecapScope,
  destinationId: string,
): Promise<CandidateRow[]> {
  const { rows } = await tx.query<CandidateRow>(
    `SELECT f.id AS form_id, c.id AS critter_id, c.key AS critter_key, c.no AS critter_no,
            coalesce(c.key = (SELECT d.critter_key FROM destinations d WHERE d.id = $2), false)
              AS own,
            f.rarity,
            (SELECT jsonb_agg(jsonb_build_object('kind', s.kind, 'rule', w.rule) ORDER BY s.id)
               FROM spawn_rules s LEFT JOIN legendary_windows w ON w.id = s.window_id
              WHERE s.form_id = f.id AND s.destination_id = $2) AS rules,
            (SELECT count(*)::int FROM critter_forms sibling
              WHERE sibling.critter_id = c.id) AS forms_total,
            (SELECT count(*)::int FROM encounters e
              WHERE e.trip_id = $1 AND e.form_id = f.id AND e.user_id = ANY($3::uuid[])
                AND e.state IN ('wandered_off', 'abandoned')) AS sightings,
            (SELECT count(*)::int FROM encounters e
              WHERE e.trip_id = $1 AND e.form_id = f.id AND e.user_id = ANY($3::uuid[])
                AND e.state = 'wandered_off') AS wandered_off,
            coalesce((SELECT array_agg(DISTINCT e.user_id) FROM encounters e
              WHERE e.trip_id = $1 AND e.form_id = f.id AND e.user_id = ANY($3::uuid[])
                AND e.state IN ('wandered_off', 'abandoned')), '{}') AS seen_by
       FROM critter_forms f JOIN critters c ON c.id = f.critter_id
      WHERE f.rarity IN ('epic', 'legendary')
        AND EXISTS (SELECT 1 FROM spawn_rules s WHERE s.form_id = f.id AND s.destination_id = $2)
        AND NOT EXISTS (
          SELECT 1 FROM collection_entries ce
           WHERE ce.form_id = f.id AND ce.trip_id = $1 AND ce.user_id = ANY($3::uuid[])
        )`,
    [scope.trip.id, destinationId, scope.members],
  );
  return rows;
}

/** A form spawns any day if any of its rules is undated; otherwise in its first rule's window. */
function windowOf(row: CandidateRow): GotAwayCandidate['window'] {
  const rules = row.rules ?? [];
  if (rules.length === 0 || rules.some((rule) => rule.kind !== 'window')) return null;
  const parsed = windowRuleSchema.safeParse(rules[0]?.rule);
  return parsed.success ? parsed.data : null;
}

export const crittersContributor: RecapContributor = {
  name: 'critters',
  async contribute(tx, scope, draft) {
    const finds = await loadFinds(tx, scope);
    const forms = new Set<string>();
    const newCritters = new Set<string>();
    const foundByCritter = new Map<string, Set<string>>();
    for (const find of finds) {
      forms.add(find.form_id);
      if (find.first_of_critter) newCritters.add(find.critter_id);
      const found = foundByCritter.get(find.critter_id) ?? new Set<string>();
      found.add(find.form_id);
      foundByCritter.set(find.critter_id, found);
      addMetric(draft, find.user_id, 'finds', 1);
      addDayScore(draft, find.local_date, 1);
    }
    draft.critters = {
      forms_found: forms.size,
      new_critters: newCritters.size,
      form_ids: [...forms].sort(),
    };

    const destinationId = scope.trip.destinationId;
    if (destinationId === null) return;
    const candidates = (await loadCandidates(tx, scope, destinationId)).map(
      (row): GotAwayCandidate => ({
        form_id: row.form_id,
        critter_id: row.critter_id,
        critter_key: row.critter_key,
        critter_no: row.critter_no,
        own: row.own,
        rarity: row.rarity,
        sightings: row.sightings,
        wandered_off: row.wandered_off,
        seen_by: row.seen_by,
        forms_found: foundByCritter.get(row.critter_id)?.size ?? 0,
        forms_total: row.forms_total,
        window: windowOf(row),
      }),
    );
    draft.gotAway = selectGotAway(candidates, scope.trip.startDate, scope.trip.endedOn);
  },
};

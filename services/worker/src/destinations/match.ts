/**
 * Gives base-set destinations their critter (`critter_key`, `critter_match`): the admin-region
 * override, the clearly nearest critter of the same country, Jev's pick among the nearest few, or
 * the globally nearest critter (`matchCritter`). Only released critters take part. Seed, critter
 * and area rows are never matched here: they have their own critter or none by design.
 */
import { chooseDestinationCritter, type DecisionClient } from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  CRITTER_ADMIN_OVERRIDES,
  CRITTER_HOMES,
  matchCritter,
  type CritterMatch,
} from '@cp/domain';
import type pg from 'pg';

export interface MatchDeps {
  /** Jev with its twin; without it the residual takes the globally nearest critter. */
  readonly decisions: Pick<DecisionClient, 'decide'> | null;
  readonly concurrency?: number;
}

export interface MatchOptions {
  readonly rematch?: boolean;
  readonly signal?: AbortSignal;
}

export type MatchCounts = Readonly<Record<CritterMatch['method'] | 'rows', number>>;

interface TargetRow {
  id: string;
  name: string;
  country: string | null;
  country_code: string;
  admin1: string | null;
  kind: string | null;
  lat: number;
  lng: number;
}

async function releasedCritters(pool: pg.Pool) {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ key: string; city: string; place: string }>(
      `SELECT c.key, c.city, s.name AS place FROM critters c JOIN critter_sets s ON s.id = c.set_id`,
    );
    return new Map(rows.map((row) => [row.key, row]));
  });
}

export async function matchBaseCritters(
  pool: pg.Pool,
  deps: MatchDeps,
  options: MatchOptions = {},
): Promise<MatchCounts> {
  const released = await releasedCritters(pool);
  const homes = CRITTER_HOMES.filter((home) => released.has(home.key));
  const counts = { rows: 0, override: 0, nearest: 0, jev: 0, global: 0 };
  if (homes.length === 0) return counts;
  const targets = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<TargetRow>(
      `SELECT id, name, country, country_code, admin1, kind, lat, lng FROM destinations
        WHERE origin = 'base' AND lat IS NOT NULL AND country_code IS NOT NULL
          AND ($1 OR critter_key IS NULL)
        ORDER BY base_rank DESC NULLS LAST`,
      [options.rematch === true],
    );
    return rows;
  });
  const results: { id: string; match: CritterMatch }[] = [];
  let next = 0;
  const work = async () => {
    for (let i = next++; i < targets.length; i = next++) {
      options.signal?.throwIfAborted();
      const row = targets[i];
      if (row === undefined) continue;
      const outcome = matchCritter(
        { countryCode: row.country_code, admin1: row.admin1, lat: row.lat, lng: row.lng },
        homes,
        CRITTER_ADMIN_OVERRIDES,
      );
      if (outcome.kind === 'matched' || deps.decisions === null) {
        results.push({
          id: row.id,
          match: outcome.kind === 'matched' ? outcome.match : outcome.fallback,
        });
        continue;
      }
      const choices = outcome.candidates.flatMap((candidate) => {
        const critter = released.get(candidate.key);
        return critter === undefined
          ? []
          : [
              {
                key: candidate.key,
                home: critter.city,
                country: critter.place,
                distanceKm: candidate.distanceKm,
              },
            ];
      });
      const choice = await chooseDestinationCritter(
        deps.decisions,
        {
          name: row.name,
          country: row.country ?? row.country_code,
          region: row.admin1,
          kind: row.kind ?? 'city',
        },
        choices,
      ).catch(() => null);
      const picked = outcome.candidates.find((candidate) => candidate.key === choice?.critterKey);
      results.push({
        id: row.id,
        match:
          picked === undefined || choice === null
            ? outcome.fallback
            : {
                critterKey: picked.key,
                method: 'jev',
                distanceKm: picked.distanceKm,
                confidence: Math.round(choice.confidence * 100) / 100,
              },
      });
    }
  };
  await Promise.all(Array.from({ length: deps.concurrency ?? 4 }, work));
  for (const { match } of results) counts[match.method] += 1;
  counts.rows = results.length;
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE destinations d SET critter_key = r.critter_key, critter_match = r.critter_match
         FROM jsonb_to_recordset($1::jsonb) AS r(id uuid, critter_key text, critter_match jsonb)
        WHERE d.id = r.id AND d.origin = 'base'`,
      [
        JSON.stringify(
          results.map(({ id, match }) => ({
            id,
            critter_key: match.critterKey,
            critter_match: {
              method: match.method,
              distance_km: match.distanceKm,
              ...(match.confidence === undefined ? {} : { confidence: match.confidence }),
            },
          })),
        ),
      ],
    ),
  );
  return counts;
}

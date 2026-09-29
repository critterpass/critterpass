/**
 * The pitch cache (`pitches`): a crew's pitch of one place for one month is reused until the
 * fares it quotes change (the fare snapshot id), so a second request replays instantly and costs
 * nothing.
 */
import { pitchSectionsSchema, type PitchSections } from '@cp/domain';
import type pg from 'pg';

import { appendDomainEvent } from '../events';

export function pitchCacheKeyFor(placeId: string, month: number | null): string {
  return `${placeId}:${month ?? 'any'}`;
}

export interface CachedPitch {
  readonly id: string;
  readonly sections: PitchSections;
}

export async function findCachedPitch(
  tx: pg.PoolClient,
  input: { crewId: string; cacheKey: string; fareSnapshotId: string },
): Promise<CachedPitch | undefined> {
  const { rows } = await tx.query<{ id: string; sections: unknown }>(
    `SELECT id, sections FROM pitches
      WHERE crew_id = $1 AND cache_key = $2 AND fare_snapshot_id = $3
        AND sections ? 'headline'
      ORDER BY created_at DESC LIMIT 1`,
    [input.crewId, input.cacheKey, input.fareSnapshotId],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const sections = pitchSectionsSchema.safeParse(row.sections);
  return sections.success ? { id: row.id, sections: sections.data } : undefined;
}

export interface StorePitchInput {
  readonly crewId: string;
  readonly placeId: string;
  readonly month: number | null;
  readonly pitchedBy: string | null;
  readonly sections: PitchSections;
  readonly model: string | null;
  readonly promptVersion: string;
  readonly fareSnapshotId: string;
}

export async function storePitch(tx: pg.PoolClient, input: StorePitchInput): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO pitches (crew_id, destination_id, pitched_by, month, sections, model, prompt_version,
       cache_key, fare_snapshot_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING id`,
    [
      input.crewId,
      input.placeId,
      input.pitchedBy,
      input.month,
      JSON.stringify(input.sections),
      input.model,
      input.promptVersion,
      pitchCacheKeyFor(input.placeId, input.month),
      input.fareSnapshotId,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('pitch insert returned no row');
  await appendDomainEvent(tx, {
    type: 'pitch.created',
    aggregateKind: 'pitch',
    aggregateId: id,
    actorKind: input.pitchedBy === null ? 'guide' : 'user',
    actorId: input.pitchedBy,
    payload: { pitch_id: id, crew_id: input.crewId, destination_id: input.placeId },
    crewId: input.crewId,
  });
  return id;
}

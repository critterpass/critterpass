/**
 * Where the crew stands on a place in a trip, read as the caller (a participant; RLS shows a
 * trip's stances to its members only). Stances are explicit public ballots, so who said what is
 * crew-visible; nothing here reads swipe votes or hidden places.
 */
import { isCrewSplit, type PlaceStance } from '@cp/domain';
import type pg from 'pg';

import { tripVoters } from '../../plan/access';

export interface StanceLine {
  readonly user_id: string;
  readonly stance: PlaceStance;
  readonly note: string | null;
  readonly updated_at: string;
}

export interface SplitSummary {
  /** Who said WANT IT, oldest first. */
  readonly want: readonly string[];
  /** Who said RATHER NOT, oldest first. */
  readonly rather_not: readonly string[];
  /** Crew who have not said. */
  readonly silent_user_ids: readonly string[];
  /** At least one on each side. */
  readonly split: boolean;
}

export async function readStanceLines(
  tx: pg.PoolClient,
  tripId: string,
  poiId: string,
): Promise<StanceLine[]> {
  const { rows } = await tx.query<{
    user_id: string;
    stance: PlaceStance;
    note: string | null;
    updated_at: Date;
  }>(
    `SELECT user_id, stance, note, updated_at FROM place_stances
      WHERE trip_id = $1 AND poi_id = $2 ORDER BY created_at, user_id`,
    [tripId, poiId],
  );
  return rows.map((row) => ({ ...row, updated_at: row.updated_at.toISOString() }));
}

/** The crew a stance can come from: the trip's seat holders, else the whole crew. */
export async function stanceCrew(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ crew_id: string }>('SELECT crew_id FROM trips WHERE id = $1', [
    tripId,
  ]);
  const crewId = rows[0]?.crew_id;
  return crewId === undefined ? [] : tripVoters(tx, tripId, crewId);
}

export function summarise(lines: readonly StanceLine[], crew: readonly string[]): SplitSummary {
  const want = lines.filter((line) => line.stance === 'want').map((line) => line.user_id);
  const ratherNot = lines.filter((line) => line.stance === 'rather_not').map((l) => l.user_id);
  const said = new Set(lines.map((line) => line.user_id));
  return {
    want,
    rather_not: ratherNot,
    silent_user_ids: crew.filter((uid) => !said.has(uid)),
    split: isCrewSplit({ want: want.length, ratherNot: ratherNot.length }),
  };
}

/** The split block of a place page: null while nobody has said where they stand. */
export async function readSplitSummary(
  tx: pg.PoolClient,
  tripId: string,
  poiId: string,
): Promise<SplitSummary | null> {
  const lines = await readStanceLines(tx, tripId, poiId);
  if (lines.length === 0) return null;
  return summarise(lines, await stanceCrew(tx, tripId));
}

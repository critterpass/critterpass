/**
 * The destination's essential places a draft does not hold, as its version's coverage lists them
 * (`essentials_left_out`: the place, its name as the organiser reads it, and why). Read leniently:
 * a reason this app does not know yet keeps its place and loses only its words.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire keys and SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

export interface LeftOut {
  readonly poiId: string;
  readonly name: string;
  /** `no_room`, `held_in_the_way`, `closed`, `too_far`, `not_offered`, or one a newer server added. */
  readonly reason: string;
}

/** The list from a version's coverage (the parsed JSON); anything unreadable is left out. */
export function leftOutOf(coverage: unknown): LeftOut[] {
  const list =
    typeof coverage === 'object' && coverage !== null
      ? (coverage as { essentials_left_out?: unknown }).essentials_left_out
      : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry: unknown): LeftOut[] => {
    const row = entry as { poi_id?: unknown; name?: unknown; reason?: unknown } | null;
    if (typeof row?.poi_id !== 'string' || typeof row.name !== 'string' || row.name === '') {
      return [];
    }
    return [
      {
        poiId: row.poi_id,
        name: row.name,
        reason: typeof row.reason === 'string' ? row.reason : '',
      },
    ];
  });
}

/** Essentials the new version leaves out that the earlier one did not: what a redraft took out. */
export function takenOut(before: readonly LeftOut[], after: readonly LeftOut[]): LeftOut[] {
  const already = new Set(before.map((row) => row.poiId));
  return after.filter((row) => !already.has(row.poiId));
}

function parsed(raw: string | null | undefined): unknown {
  try {
    return JSON.parse(raw ?? 'null') as unknown;
  } catch {
    return null;
  }
}

const COVERAGE_SQL = 'SELECT id, coverage FROM itinerary_versions WHERE id IN (?, ?)';

/** What the redraft's version takes out of the trip, against the draft it redoes a day of. */
export function useTakenOut(
  baseVersionId: string | null,
  candidateVersionId: string | null,
): readonly LeftOut[] {
  const rows = useLiveRows<{ id: string; coverage: string | null }>(
    COVERAGE_SQL,
    baseVersionId === null || candidateVersionId === null
      ? null
      : [baseVersionId, candidateVersionId],
    ['itinerary_versions'],
  );
  return useMemo(() => {
    const of = (id: string | null) =>
      leftOutOf(parsed(rows.rows.find((row) => row.id === id)?.coverage));
    return takenOut(of(baseVersionId), of(candidateVersionId));
  }, [rows.rows, baseVersionId, candidateVersionId]);
}

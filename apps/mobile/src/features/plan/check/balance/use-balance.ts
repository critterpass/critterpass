/**
 * Balance the crew's inputs from synced rows (must-dos, every live idea with who saved it and its
 * last fit, the crew's plan) and the organiser's own asks by member. Read only on an organiser's
 * phone; nothing here is stored or sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { storedFitSchema, type StoredFit } from '@cp/domain';
import { useMemo } from 'react';

import { IDEAS_SQL, IDEAS_TABLES, textArray, type IdeaRow } from '@/data/ideas/use-trip-ideas';
import { useLiveRows } from '@/data/plan/live-rows';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { balanceOf, type Balance, type BalanceIdea } from './model';

const MUST_DOS_SQL = `SELECT id, owner_id, title, poi_id, priority FROM must_dos
  WHERE trip_id = ? AND deleted_at IS NULL`;
const MUST_DOS_TABLES = ['must_dos'];

interface MustDoRow {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly poi_id: string | null;
  readonly priority: number | null;
}

function fitOf(raw: string | null): StoredFit | null {
  if (raw === null || raw === '') return null;
  try {
    const parsed = storedFitSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function useBalance(plan: TripPlan): {
  loaded: boolean;
  balance: Balance | null;
  ideas: readonly BalanceIdea[];
} {
  const tripId = plan.trip?.id ?? null;
  const ideaRows = useLiveRows<IdeaRow>(
    IDEAS_SQL,
    tripId === null ? null : [OWNER_UID_KEY, tripId],
    IDEAS_TABLES,
  );
  const mustDoRows = useLiveRows<MustDoRow>(
    MUST_DOS_SQL,
    tripId === null ? null : [tripId],
    MUST_DOS_TABLES,
  );
  return useMemo(() => {
    const ideas: BalanceIdea[] = ideaRows.rows.map((row) => ({
      id: row.id,
      poiId: row.poi_id,
      name: row.name,
      backerIds: textArray(row.backer_ids),
      fit: fitOf(row.fit),
    }));
    const balance = balanceOf({
      organiser: plan.organiser,
      me: plan.uid,
      members: plan.members,
      mustDos: mustDoRows.rows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        title: row.title,
        poiId: row.poi_id,
        priority: row.priority ?? 0,
      })),
      items: plan.itemRows.map((row) => ({ poiId: row.poi_id, mustDoId: row.must_do_id })),
      ideas,
    });
    return { loaded: ideaRows.loaded && mustDoRows.loaded && plan.loaded, balance, ideas };
  }, [ideaRows.loaded, ideaRows.rows, mustDoRows.loaded, mustDoRows.rows, plan]);
}

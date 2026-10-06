/**
 * A crew's pick of a driver inside a change set (docs/api-contracts-suppliers.md §4.11): the
 * `assign_provider` ops are checked when the set is drafted, with the rules of the direct pick (a
 * live driver of the trip, each day once, no day already set on another driver), and written by
 * `app.apply_provider_assignments` when the set applies.
 */
import { DomainError, isAssignProviderOp, type ChangeSetOp } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { requireTripDriver } from '../commands/drivers/shared';

/** Refuses a draft whose driver picks could not be set as they stand. */
export async function requireAssignableProviders(
  tx: pg.PoolClient,
  tripId: string,
  ops: readonly ChangeSetOp[],
): Promise<void> {
  const picks = ops.filter(isAssignProviderOp);
  if (picks.length === 0) return;
  const driverOf = new Map<string, string>();
  for (const pick of picks) {
    for (const day of pick.assignment.days) {
      if (driverOf.has(day.date)) throw new DomainError('VALIDATION', { reason: 'days' });
      driverOf.set(day.date, pick.target);
    }
  }
  for (const providerId of new Set(picks.map((pick) => pick.target))) {
    await requireTripDriver(tx, tripId, providerId);
  }
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ day_date: string; provider_id: string }>(
      `SELECT to_char(day_date, 'YYYY-MM-DD') AS day_date, provider_id FROM provider_assignments
        WHERE trip_id = $1 AND day_date = ANY($2::date[])`,
      [tripId, [...driverOf.keys()]],
    ),
  );
  const taken = rows.filter((row) => driverOf.get(row.day_date) !== row.provider_id);
  if (taken.length > 0) {
    throw new DomainError('STATE_INVALID', {
      reason: 'day_taken',
      dates: taken.map((row) => row.day_date).sort(),
    });
  }
}

/** Writes the applied change set's accepted driver picks; answers how many days were set. */
export async function applyProviderAssignments(
  tx: pg.PoolClient,
  changeSetId: string,
): Promise<number> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ written: number }>('SELECT app.apply_provider_assignments($1) AS written', [
      changeSetId,
    ]),
  );
  return rows[0]?.written ?? 0;
}

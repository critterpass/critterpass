/**
 * Names of places this phone picked in the add sheet, kept in local state (`plan_place:<id>`): a
 * place found on the server is never in the phone's catalogue, so its new stop is named from here
 * until the plan's own record of it arrives with the next version (VERSION_PLACES_SQL reads both).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and a storage key, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export const PICKED_PLACE_PREFIX = 'plan_place:';

export function rememberPickedPlace(
  db: AbstractPowerSyncDatabase,
  placeId: string,
  name: string,
): Promise<void> {
  return db
    .execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      `${PICKED_PLACE_PREFIX}${placeId}`,
      JSON.stringify({ name }),
    ])
    .then(
      () => undefined,
      () => undefined,
    );
}

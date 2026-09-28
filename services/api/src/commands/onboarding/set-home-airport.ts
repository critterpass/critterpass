/**
 * `set_home_airport` (docs/api-contracts.md §4.1): the home airport (or metro group) sets the
 * caller's home country and currency from the bundled airport dataset, and re-inks the home stamp
 * once the pass is issued. An IATA code the dataset does not know is refused.
 */
import { airportDataset } from '@cp/content/airports';
import { appendDomainEvent } from '@cp/db';
import { DomainError, homeBaseFor, setHomeAirportPayloadSchema, type HomeBase } from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { announceMemberUpdated } from './member-updated';

export interface HomeAirportResult {
  readonly iata: string;
  readonly country: string;
  readonly currency: string | null;
}

/** The dataset's home for `iata`, or `VALIDATION` when it is not an airport we list. */
export function requireHomeBase(iata: string): HomeBase {
  const home = homeBaseFor(airportDataset(), iata);
  if (home === null) throw new DomainError('VALIDATION', { reason: 'unknown_airport', iata });
  return home;
}

/** Writes the caller's home fields and re-inks their home stamp; used by `issue_pass` too. */
export async function writeHomeAirport(
  tx: pg.PoolClient,
  uid: string,
  home: HomeBase,
): Promise<{ readonly changed: boolean }> {
  const updated = await tx.query(
    `UPDATE users SET home_airport = $2, home_country = $3, home_currency = $4
     WHERE id = $1
       AND (home_airport, home_country, home_currency) IS DISTINCT FROM ($2, $3, $4)`,
    [uid, home.iata, home.country, home.currency],
  );
  await tx.query('SELECT app.put_home_stamp($1, $2)', [home.iata, home.country]);
  return { changed: (updated.rowCount ?? 0) > 0 };
}

export const setHomeAirportCommand = defineCommand({
  name: 'set_home_airport',
  v: 1,
  schema: setHomeAirportPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (_tx, payload) => {
    requireHomeBase(payload.iata);
    return Promise.resolve();
  },
  handle: async (tx, payload, ctx): Promise<HomeAirportResult> => {
    const home = requireHomeBase(payload.iata);
    const { changed } = await writeHomeAirport(tx, ctx.uid, home);
    if (changed) {
      await appendDomainEvent(tx, {
        type: 'profile.updated',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, fields: ['home_airport'] },
      });
      await announceMemberUpdated(tx, ctx.uid, ['home_airport']);
    }
    return { iata: home.iata, country: home.country, currency: home.currency };
  },
});

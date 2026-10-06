/**
 * `shortlist_listed_driver {trip_id, listing_id}` (6e-2 "Add to shortlist"): a listed driver
 * becomes one of the trip's drivers, with his name, car and number, so the crew keeps his contact
 * in its own trip even if he later removes his listing.
 */
import { DomainError, shortlistListedDriverPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const shortlistListedDriverCommand = defineCommand({
  name: 'shortlist_listed_driver',
  v: 1,
  schema: shortlistListedDriverPayloadSchema,
  offline: false,
  authorize: async (tx, payload) => {
    const member = await tx.query('SELECT 1 FROM trips WHERE id = $1', [payload.trip_id]);
    if (member.rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    const listed = await tx.query('SELECT 1 FROM driver_listings WHERE id = $1', [
      payload.listing_id,
    ]);
    if (listed.rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
  },
  handle: (tx, payload, ctx): Promise<{ provider_id: string }> =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO providers (trip_id, kind, name, contact_enc, vehicle, added_by)
         SELECT $1, 'driver', l.display_name, l.phone_e164_enc, l.vehicle, $3
           FROM driver_listings l WHERE l.id = $2 AND l.status = 'listed'
         RETURNING id`,
        [payload.trip_id, payload.listing_id, ctx.uid],
      );
      const id = rows[0]?.id;
      if (id === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
      return { provider_id: id };
    }),
});

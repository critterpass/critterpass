/**
 * `shortlist_listed_driver {trip_id, listing_id}` (6e-2 "Add to shortlist"): a listed driver
 * becomes one of the trip's drivers, with his name, car and number, so the crew keeps his contact
 * in its own trip even if he later removes his listing. Adding him again answers with the driver
 * the trip already has.
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
      // One at a time per trip and listing, so two taps cannot both find him missing.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1 || $2, 0))', [
        payload.trip_id,
        payload.listing_id,
      ]);
      const listing = await tx.query<{ phone_e164_enc: string }>(
        `SELECT phone_e164_enc FROM driver_listings WHERE id = $1 AND status = 'listed'`,
        [payload.listing_id],
      );
      const sealed = listing.rows[0]?.phone_e164_enc;
      if (sealed === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
      // The trip's copy carries his sealed number exactly as listed: that is how he is known.
      const existing = await tx.query<{ id: string }>(
        `SELECT id FROM providers
          WHERE trip_id = $1 AND kind = 'driver' AND contact_enc = $2 AND deleted_at IS NULL
          ORDER BY created_at LIMIT 1`,
        [payload.trip_id, sealed],
      );
      let id = existing.rows[0]?.id;
      if (id === undefined) {
        const added = await tx.query<{ id: string }>(
          `INSERT INTO providers (trip_id, kind, name, contact_enc, vehicle, added_by)
           SELECT $1, 'driver', l.display_name, l.phone_e164_enc, l.vehicle, $3
             FROM driver_listings l WHERE l.id = $2
           RETURNING id`,
          [payload.trip_id, payload.listing_id, ctx.uid],
        );
        id = added.rows[0]?.id;
        if (id === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
      }
      // The shortlist reads a driver through his terms; a second add brings an archived one back.
      await tx.query(
        `INSERT INTO provider_terms (provider_id, trip_id, source, area, languages, car, seats)
         SELECT $1, $2, 'crews', left(l.areas[1], 80), l.languages[1:8],
                left(l.vehicle->>'model', 80), l.seats
           FROM driver_listings l WHERE l.id = $3
         ON CONFLICT (provider_id) DO UPDATE SET status = 'shortlisted'`,
        [id, payload.trip_id, payload.listing_id],
      );
      return { provider_id: id };
    }),
});

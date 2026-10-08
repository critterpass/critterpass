/**
 * `shortlist_provider {provider_id, trip_id, supplier, product_id, label, price, …}`: ADD TO
 * COMPARE on a private tour (6f-1). Only the product id, a short label for the column and the price
 * shown are kept; the supplier's title, photos and ratings are fetched per view and never stored.
 * Adding the same column again replaces the whole offer with the one now on screen, so the price is
 * never left beside seats, hours or a product it was not quoted for.
 */
import { DomainError, shortlistProviderPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireMember } from './shared';

const LABEL = { klook: 'Klook car', viator: 'Viator tour' } as const;

export const shortlistProviderCommand = defineCommand({
  name: 'shortlist_provider',
  v: 1,
  schema: shortlistProviderPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    await asSystemRole(tx, async () => {
      const existing = await tx.query<{ trip_id: string }>(
        'SELECT trip_id FROM providers WHERE id = $1',
        [payload.provider_id],
      );
      if (existing.rows[0] !== undefined && existing.rows[0].trip_id !== payload.trip_id) {
        throw new DomainError('VALIDATION', { reason: 'provider_id' });
      }
      await tx.query(
        `INSERT INTO providers (id, trip_id, kind, name, added_by)
         VALUES ($1, $2, 'driver', $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
           WHERE providers.name <> EXCLUDED.name`,
        [payload.provider_id, payload.trip_id, LABEL[payload.supplier], ctx.uid],
      );
      await tx.query(
        `INSERT INTO provider_terms (provider_id, trip_id, source, seats, price_minor, currency,
           price_unit, included_hours, includes, licence_shown, supplier_ref, confirmed_fields)
         VALUES ($1, $2, 'private_tour', $3, $4, $5, $6, $7,
           '{"fuel":"yes","parking":"yes"}', true, $8, '{price}')
         ON CONFLICT (provider_id) DO UPDATE SET status = 'shortlisted',
           seats = EXCLUDED.seats, price_minor = EXCLUDED.price_minor,
           currency = EXCLUDED.currency, price_unit = EXCLUDED.price_unit,
           included_hours = EXCLUDED.included_hours, supplier_ref = EXCLUDED.supplier_ref`,
        [
          payload.provider_id,
          payload.trip_id,
          payload.seats,
          payload.price_minor,
          payload.currency,
          payload.price_unit,
          payload.included_hours,
          `${payload.supplier}:${payload.product_id}`,
        ],
      );
    });
    return { provider_id: payload.provider_id };
  },
});

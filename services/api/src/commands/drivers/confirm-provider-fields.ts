/**
 * `confirm_provider_fields {provider_id, trip_id, intake_id?, card, confirmed}`: the traveller
 * checked every line of a driver card (6c-2), and the driver joins the crew's shortlist with his
 * quoted terms. A line with a value that was not confirmed refuses the whole card: nothing
 * unchecked reaches the crew. The number is sealed at rest. A replay (or an edit of the same
 * driver) updates his card in place.
 */
import {
  confirmProviderFieldsPayloadSchema,
  DomainError,
  type ConfirmProviderFieldsPayload,
  type DriverField,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireMember, sealPhone, type DriverDeps } from './shared';

/** The lines of the card that carry a value, each of which must be confirmed. */
export function filledFields(card: ConfirmProviderFieldsPayload['card']): DriverField[] {
  const out: DriverField[] = ['name'];
  if (card.phone !== null) out.push('phone');
  if (card.languages.length > 0) out.push('languages');
  if (card.car !== null || card.seats !== null) out.push('car');
  if (card.price_minor !== null) out.push('price');
  if (Object.keys(card.includes).length > 0) out.push('includes');
  if (card.overtime_minor !== null) out.push('overtime');
  return out;
}

export function createConfirmProviderFieldsCommand(deps: DriverDeps) {
  return defineCommand({
    name: 'confirm_provider_fields',
    v: 1,
    schema: confirmProviderFieldsPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await requireMember(tx, payload.trip_id);
    },
    handle: async (tx, payload, ctx) => {
      const { card } = payload;
      const unconfirmed = filledFields(card).filter((field) => !payload.confirmed.includes(field));
      if (unconfirmed.length > 0) {
        throw new DomainError('VALIDATION', { reason: 'unconfirmed', fields: unconfirmed });
      }
      if ((card.price_minor === null) !== (card.currency === null)) {
        throw new DomainError('VALIDATION', { reason: 'currency' });
      }
      await asSystemRole(tx, async () => {
        const existing = await tx.query<{ trip_id: string }>(
          'SELECT trip_id FROM providers WHERE id = $1',
          [payload.provider_id],
        );
        const known = existing.rows[0];
        if (known !== undefined && known.trip_id !== payload.trip_id) {
          throw new DomainError('VALIDATION', { reason: 'provider_id' });
        }
        const vehicle = card.car === null ? null : { model: card.car, seats: card.seats };
        await tx.query(
          `INSERT INTO providers (id, trip_id, kind, name, contact_enc, vehicle, added_by)
           VALUES ($1, $2, 'driver', $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
             contact_enc = coalesce(EXCLUDED.contact_enc, providers.contact_enc),
             vehicle = EXCLUDED.vehicle, version = providers.version + 1`,
          [
            payload.provider_id,
            payload.trip_id,
            card.name,
            sealPhone(deps, card.phone),
            vehicle === null ? null : JSON.stringify(vehicle),
            ctx.uid,
          ],
        );
        await tx.query(
          `INSERT INTO provider_terms (provider_id, trip_id, source, area, languages, car, seats,
             price_minor, currency, price_unit, included_hours, includes, overtime_minor,
             licence_shown, confirmed_fields)
           VALUES ($1, $2, 'found', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (provider_id) DO UPDATE SET status = 'shortlisted', area = EXCLUDED.area,
             languages = EXCLUDED.languages, car = EXCLUDED.car, seats = EXCLUDED.seats,
             price_minor = EXCLUDED.price_minor, currency = EXCLUDED.currency,
             price_unit = EXCLUDED.price_unit, included_hours = EXCLUDED.included_hours,
             includes = EXCLUDED.includes, overtime_minor = EXCLUDED.overtime_minor,
             licence_shown = EXCLUDED.licence_shown, confirmed_fields = EXCLUDED.confirmed_fields`,
          [
            payload.provider_id,
            payload.trip_id,
            card.area,
            card.languages,
            card.car,
            card.seats,
            card.price_minor,
            card.currency,
            card.price_unit,
            card.included_hours,
            JSON.stringify(card.includes),
            card.overtime_minor,
            card.licence_shown,
            payload.confirmed,
          ],
        );
        if (payload.intake_id !== undefined) {
          await tx.query(
            `UPDATE provider_intake SET status = 'used', provider_id = $1
              WHERE id = $2 AND trip_id = $3`,
            [payload.provider_id, payload.intake_id, payload.trip_id],
          );
        }
      });
      return { provider_id: payload.provider_id };
    },
  });
}

/**
 * `assign_provider {trip_id, provider_id, days[]}` (6d-2 SET): writes the driver onto the chosen
 * days with their windows and pickup, and snapshots the terms agreed so the offline ride-back card
 * (6e-4) can show them. A day already set on another driver is TAKEN and refuses the whole pick;
 * picking the same driver again updates his days in place.
 */
import { assignProviderPayloadSchema, DomainError } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireMember, requireTripDriver } from './shared';

interface TermsRow {
  readonly price_minor: string | null;
  readonly currency: string | null;
  readonly price_unit: string | null;
  readonly included_hours: string | null;
  readonly includes: Record<string, string>;
  readonly overtime_minor: string | null;
}

export const assignProviderCommand = defineCommand({
  name: 'assign_provider',
  v: 1,
  schema: assignProviderPayloadSchema,
  offline: false,
  authorize: async (tx, payload) => {
    await requireMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    await requireTripDriver(tx, payload.trip_id, payload.provider_id);
    const dates = payload.days.map((day) => day.date);
    if (new Set(dates).size !== dates.length) {
      throw new DomainError('VALIDATION', { reason: 'days' });
    }
    return asSystemRole(tx, async () => {
      const taken = await tx.query<{ day_date: string }>(
        `SELECT to_char(day_date, 'YYYY-MM-DD') AS day_date FROM provider_assignments
          WHERE trip_id = $1 AND day_date = ANY($2::date[]) AND provider_id <> $3
          FOR UPDATE`,
        [payload.trip_id, dates, payload.provider_id],
      );
      if (taken.rows.length > 0) {
        throw new DomainError('STATE_INVALID', {
          reason: 'day_taken',
          dates: taken.rows.map((row) => row.day_date),
        });
      }
      const terms = await tx.query<TermsRow>(
        `SELECT price_minor, currency, price_unit, included_hours, includes, overtime_minor
           FROM provider_terms WHERE provider_id = $1`,
        [payload.provider_id],
      );
      const agreed = terms.rows[0] ?? null;
      for (const day of payload.days) {
        await tx.query(
          `INSERT INTO provider_assignments (trip_id, day_date, provider_id, window_start,
             window_end, pickup, agreed, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (trip_id, day_date) DO UPDATE SET window_start = EXCLUDED.window_start,
             window_end = EXCLUDED.window_end, pickup = EXCLUDED.pickup, agreed = EXCLUDED.agreed`,
          [
            payload.trip_id,
            day.date,
            payload.provider_id,
            day.window_start,
            day.window_end,
            day.pickup,
            agreed === null ? null : JSON.stringify(agreed),
            ctx.uid,
          ],
        );
      }
      return { provider_id: payload.provider_id, dates };
    });
  },
});

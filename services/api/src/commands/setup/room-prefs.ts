/**
 * A member's side of rooms (docs/api-contracts.md §4.5, doc delta): their own room chips (early
 * bird, night owl, light sleeper, snorer, "don't care") and who they share a bed with, which only
 * the server's grouping reads; and "Ask to swap", which reaches the organiser live on
 * `trip_setup:` and as a push, while the rooms stay the organiser's to change.
 */
import { emitEvent } from '@cp/db';
import {
  DomainError,
  requestRoomSwapPayloadSchema,
  setRoomPrefsPayloadSchema,
  SETUP_RT,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  publishSetup,
  requireSetupMember,
  requireStatus,
  setupMemberIds,
  SETUP_OPEN_STATUSES,
} from './shared';

export const setRoomPrefsCommand = defineCommand({
  name: 'set_room_prefs',
  v: 1,
  schema: setRoomPrefsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireStatus(await requireSetupMember(tx, payload.trip_id, ctx.uid), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) => {
    const partner = payload.partner_uid ?? null;
    if (partner !== null) {
      if (partner === ctx.uid) throw new DomainError('VALIDATION', { reason: 'self_partner' });
      if (!(await setupMemberIds(tx, payload.trip_id)).includes(partner)) {
        throw new DomainError('NOT_ELIGIBLE', { reason: 'partner_not_in_setup' });
      }
    }
    await tx.query(
      `INSERT INTO room_prefs (trip_id, user_id, chips, partner_id) VALUES ($1, $2, $3::text[], $4)
       ON CONFLICT (trip_id, user_id) DO UPDATE
         SET chips = EXCLUDED.chips,
             partner_id = CASE WHEN $5::boolean THEN EXCLUDED.partner_id ELSE room_prefs.partner_id END`,
      [
        payload.trip_id,
        ctx.uid,
        [...new Set(payload.chips)],
        partner,
        payload.partner_uid !== undefined,
      ],
    );
    return { trip_id: payload.trip_id };
  },
});

export const requestRoomSwapCommand = defineCommand({
  name: 'request_room_swap',
  v: 1,
  schema: requestRoomSwapPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireStatus(await requireSetupMember(tx, payload.trip_id, ctx.uid), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) => {
    if (payload.with_uid !== undefined) {
      if (!(await setupMemberIds(tx, payload.trip_id)).includes(payload.with_uid)) {
        throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_setup' });
      }
    }
    await publishSetup(tx, payload.trip_id, SETUP_RT.swapRequested, {
      user_id: ctx.uid,
      with_user_id: payload.with_uid ?? null,
    });
    await emitEvent(tx, {
      type: 'room_swap.requested',
      aggregateKind: 'trip',
      aggregateId: payload.trip_id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: payload.trip_id,
      payload: {
        trip_id: payload.trip_id,
        user_id: ctx.uid,
        with_user_id: payload.with_uid ?? null,
      },
    });
    return { trip_id: payload.trip_id };
  },
});

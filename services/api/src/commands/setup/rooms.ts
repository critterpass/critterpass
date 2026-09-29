/**
 * Rooms (docs/api-contracts.md §4.5; 3c-6). The organiser picks the stay (or a mix of stays for
 * the locked nights); the plan is priced per room from the destination's cost index in the crew
 * currency (doubles, and a single for an odd crew), and the guide's proposal seats couples
 * together and groups light sleepers, early risers and night owls. Moving people is checked
 * against the plan's version (a concurrent edit is rejected with the current version to rebase on)
 * and each room's capacity. Every change queues the trip's cost recompute, which prices rooms into
 * everyone's share. Locking the rooms moves setup on to must-dos.
 */
import { groupRooms, type RoomChip, type RoomGuest } from '@cp/cost-engine';
import { emitEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  lockRoomsPayloadSchema,
  ROOM_DOUBLE_CAPACITY,
  setRoomAssignmentPayloadSchema,
  setStayChoicePayloadSchema,
  SETUP_RT,
  type PlanRoomWire,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { loadBudgetEstimates } from './budget-shared';
import { moveStep } from './lock-trip-dates';
import {
  daysBetween,
  loadSetupTrip,
  publishSetup,
  requireOrganiser,
  requireStatus,
  setupMemberIds,
  SETUP_OPEN_STATUSES,
} from './shared';

export const COST_RECOMPUTE_QUEUE = 'cost.recompute';

function queueCosts(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  return sendInTx(tx, COST_RECOMPUTE_QUEUE, { trip_id: tripId }, { singletonKey: tripId });
}

/** Doubles, and one single when the crew is odd. */
function roomLayout(members: number): { key: string; capacity: number }[] {
  const doubles = Math.floor(members / ROOM_DOUBLE_CAPACITY);
  const rooms = Array.from({ length: doubles }, (_, i) => ({
    key: `room-${i + 1}`,
    capacity: ROOM_DOUBLE_CAPACITY,
  }));
  if (members % ROOM_DOUBLE_CAPACITY === 1) rooms.push({ key: `room-${doubles + 1}`, capacity: 1 });
  return rooms;
}

async function roomGuests(tx: pg.PoolClient, tripId: string, members: readonly string[]) {
  const { rows } = await tx.query<{
    uid: string;
    chronotype: 'early' | 'late' | null;
    chips: RoomChip[] | null;
    partner_id: string | null;
  }>(
    `SELECT m.uid, tp.chronotype, rp.chips, rp.partner_id
       FROM unnest($2::uuid[]) AS m(uid)
       LEFT JOIN taste_profiles tp ON tp.user_id = m.uid
       LEFT JOIN room_prefs rp ON rp.user_id = m.uid AND rp.trip_id = $1`,
    [tripId, members],
  );
  return rows.map((row): RoomGuest => ({
    uid: row.uid,
    chronotype: row.chronotype,
    chips: row.chips ?? [],
    partnerId: row.partner_id !== null && members.includes(row.partner_id) ? row.partner_id : null,
  }));
}

async function writeAssignments(
  tx: pg.PoolClient,
  tripId: string,
  stayKey: string,
  rooms: readonly { key: string; occupants: readonly string[]; label: string | null }[],
): Promise<void> {
  await tx.query('DELETE FROM room_assignments WHERE trip_id = $1 AND stay_key = $2', [
    tripId,
    stayKey,
  ]);
  for (const room of rooms) {
    for (const uid of room.occupants) {
      await tx.query(
        `INSERT INTO room_assignments (trip_id, stay_key, room_key, user_id, trait_label)
         VALUES ($1, $2, $3, $4, $5)`,
        [tripId, stayKey, room.key, uid, room.label],
      );
    }
  }
}

export const setStayChoiceCommand = defineCommand({
  name: 'set_stay_choice',
  v: 1,
  schema: setStayChoicePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) => {
    const trip = await asSystemRole(tx, () => loadSetupTrip(tx, payload.trip_id, true));
    if (trip.start_date === null || trip.end_date === null) {
      throw new DomainError('STATE_INVALID', { reason: 'dates_not_locked' });
    }
    const nights = daysBetween(trip.start_date, trip.end_date);
    const stays = payload.stays ?? [{ stay_type: payload.stay_option_id, nights }];
    if (stays.reduce((sum, stay) => sum + stay.nights, 0) !== nights) {
      throw new DomainError('VALIDATION', { reason: 'stay_nights', nights });
    }
    const estimates = await loadBudgetEstimates(tx, trip.id);
    const members = await setupMemberIds(tx, trip.id);
    const layout = roomLayout(members.length);
    const rooms: PlanRoomWire[] = stays.flatMap((stay, index) => {
      const rate = estimates.index?.stays.find((s) => s.type === stay.stay_type);
      if (rate === undefined) {
        throw new DomainError('STATE_INVALID', {
          reason: 'stay_unavailable',
          stay: stay.stay_type,
        });
      }
      return layout.map((room, i) => ({
        stay_key: `stay-${index + 1}`,
        stay_type: stay.stay_type,
        stay_nights: stay.nights,
        key: room.key,
        capacity: room.capacity,
        nightly_minor: Number(rate.nightlyHighMinor) * room.capacity,
        label: `Room ${i + 1}`,
      }));
    });
    // Room chips are each member's own (C2); only the server's grouping reads them.
    const guests = await asSystemRole(tx, () => roomGuests(tx, trip.id, members));
    const proposal = groupRooms(guests, layout);
    const version = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ version: number }>(
        `INSERT INTO room_plans (trip_id, stay_option_id, rooms, currency, nights, is_stale)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (trip_id) DO UPDATE
           SET stay_option_id = EXCLUDED.stay_option_id, rooms = EXCLUDED.rooms,
               currency = EXCLUDED.currency, nights = EXCLUDED.nights, is_stale = false,
               locked_at = NULL, version = room_plans.version + 1
         RETURNING version`,
        [trip.id, payload.stay_option_id, JSON.stringify(rooms), estimates.currency, nights],
      );
      await tx.query('DELETE FROM room_assignments WHERE trip_id = $1', [trip.id]);
      for (const [index] of stays.entries()) {
        await writeAssignments(tx, trip.id, `stay-${index + 1}`, proposal);
      }
      return rows[0]?.version ?? 1;
    });
    await queueCosts(tx, trip.id);
    await publishSetup(tx, trip.id, SETUP_RT.roomsChanged, { version });
    await emitEvent(tx, {
      type: 'stay.chosen',
      aggregateKind: 'trip',
      aggregateId: trip.id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: trip.id,
      payload: { trip_id: trip.id, stay_option_id: payload.stay_option_id },
    });
    return { trip_id: trip.id, version };
  },
});

export const setRoomAssignmentCommand = defineCommand({
  name: 'set_room_assignment',
  v: 1,
  schema: setRoomAssignmentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{
        rooms: PlanRoomWire[];
        version: number;
        same_pairs_all_stays: boolean;
      }>(
        'SELECT rooms, version, same_pairs_all_stays FROM room_plans WHERE trip_id = $1 FOR UPDATE',
        [payload.trip_id],
      );
      const plan = rows[0];
      if (plan === undefined) throw new DomainError('STATE_INVALID', { reason: 'no_stay_chosen' });
      if (plan.version !== payload.base_version) {
        throw new DomainError('VERSION_CONFLICT', {
          current_version: plan.version,
          rebased: false,
        });
      }
      const members = new Set(await setupMemberIds(tx, payload.trip_id));
      for (const room of payload.rooms) {
        const planned = plan.rooms.find(
          (r) => r.stay_key === room.stay_key && r.key === room.room_key,
        );
        if (planned === undefined) throw new DomainError('NOT_FOUND', { reason: 'room' });
        if (room.uids.length > planned.capacity) {
          throw new DomainError('STATE_INVALID', {
            reason: 'over_capacity',
            room_key: room.room_key,
            capacity: planned.capacity,
          });
        }
        if (room.uids.some((uid) => !members.has(uid))) {
          throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_setup' });
        }
      }
      const sameAll = payload.same_pairs_all_stays ?? plan.same_pairs_all_stays;
      const stayKeys = [...new Set(plan.rooms.map((r) => r.stay_key))];
      const edited = [...new Set(payload.rooms.map((r) => r.stay_key))];
      const targets = sameAll ? stayKeys : edited;
      for (const stayKey of targets) {
        const source = edited.includes(stayKey) ? stayKey : (edited[0] as string);
        const rooms = payload.rooms
          .filter((r) => r.stay_key === source)
          .filter((r) => plan.rooms.some((p) => p.stay_key === stayKey && p.key === r.room_key))
          .map((r) => ({ key: r.room_key, occupants: r.uids, label: null }));
        const fits = rooms.every((room) => {
          const planned = plan.rooms.find((p) => p.stay_key === stayKey && p.key === room.key);
          return planned !== undefined && room.occupants.length <= planned.capacity;
        });
        if (fits) await writeAssignments(tx, payload.trip_id, stayKey, rooms);
      }
      const updated = await tx.query<{ version: number }>(
        `UPDATE room_plans SET version = version + 1, same_pairs_all_stays = $2, locked_at = NULL
          WHERE trip_id = $1 RETURNING version`,
        [payload.trip_id, sameAll],
      );
      const version = updated.rows[0]?.version ?? plan.version + 1;
      await queueCosts(tx, payload.trip_id);
      await publishSetup(tx, payload.trip_id, SETUP_RT.roomsChanged, { version });
      await emitEvent(tx, {
        type: 'rooms.changed',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id, version },
      });
      return { trip_id: payload.trip_id, version };
    }),
});

export const lockRoomsCommand = defineCommand({
  name: 'lock_rooms',
  v: 1,
  schema: lockRoomsPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const trip = await loadSetupTrip(tx, payload.trip_id, true);
      const { rowCount } = await tx.query(
        'UPDATE room_plans SET locked_at = now(), locked_by = $2 WHERE trip_id = $1',
        [payload.trip_id, ctx.uid],
      );
      if (rowCount === 0) throw new DomainError('STATE_INVALID', { reason: 'no_stay_chosen' });
      if (trip.setup_step === 'rooms') await moveStep(tx, trip, 'must_dos', ctx.uid);
      await publishSetup(tx, payload.trip_id, SETUP_RT.roomsLocked, {});
      await emitEvent(tx, {
        type: 'rooms.locked',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id },
      });
      return { trip_id: payload.trip_id };
    }),
});

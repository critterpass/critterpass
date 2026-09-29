/**
 * Must-dos (docs/api-contracts.md §4.5; 3c-7, 3c-10). A member sends their whole list: one primary
 * plus optional extras, a catalogue place or their own words; anything of theirs no longer listed
 * is removed. A place someone else already has merges into theirs with both avatars. Each change
 * resets the fit to unknown and queues `ai.fit_check`, whose results reach the crew as
 * `must_do.row`. `track_lottery` sets the member's reminders before entries close and when
 * results come out — the guide reminds, it never enters for anyone.
 */
import { emitEvent, scheduleEvent } from '@cp/db';
import {
  DomainError,
  SETUP_QUEUES,
  SETUP_RT,
  setMustDosPayloadSchema,
  trackLotteryPayloadSchema,
  type MustDoResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { queueFitChecks } from './must-do-fit';
import {
  addDays,
  MUST_DO_OPEN_STATUSES,
  publishSetup,
  requireSetupMember,
  requireStatus,
} from './shared';

interface OwnMustDo {
  readonly id: string;
  readonly poi_id: string | null;
  readonly title: string;
  readonly priority: number;
}

async function mergeTarget(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
  poiId: string | undefined,
  text: string,
): Promise<string | undefined> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM must_dos
      WHERE trip_id = $1 AND owner_id <> $2 AND deleted_at IS NULL
        AND (($3::uuid IS NOT NULL AND poi_id = $3)
             OR ($3::uuid IS NULL AND poi_id IS NULL AND lower(title) = lower($4)))
      ORDER BY created_at LIMIT 1`,
    [tripId, uid, poiId ?? null, text],
  );
  return rows[0]?.id;
}

export const setMustDosCommand = defineCommand({
  name: 'set_must_dos',
  v: 1,
  schema: setMustDosPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireStatus(await requireSetupMember(tx, payload.trip_id, ctx.uid), MUST_DO_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx): Promise<MustDoResult> => {
    const own = await tx.query<OwnMustDo>(
      `SELECT id, poi_id, title, priority FROM must_dos
        WHERE trip_id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [payload.trip_id, ctx.uid],
    );
    const keep = new Set(payload.items.flatMap((item) => (item.id === undefined ? [] : [item.id])));
    const removed = own.rows.filter((row) => !keep.has(row.id)).map((row) => row.id);
    if (removed.length > 0) {
      await tx.query('UPDATE must_dos SET deleted_at = now() WHERE id = ANY($1::uuid[])', [
        removed,
      ]);
    }
    // Free the primary slot first; the listed primary takes it back below.
    await tx.query(
      `UPDATE must_dos SET priority = 1
        WHERE trip_id = $1 AND owner_id = $2 AND deleted_at IS NULL AND priority = 0`,
      [payload.trip_id, ctx.uid],
    );
    const changed: string[] = [];
    const ids: string[] = [];
    const ordered = [...payload.items].sort((a, b) => b.priority - a.priority);
    for (const item of ordered) {
      const existing = own.rows.find((row) => row.id === item.id);
      if (existing !== undefined) {
        await tx.query(
          'UPDATE must_dos SET title = $2, poi_id = $3, freeform = $4, priority = $5 WHERE id = $1',
          [existing.id, item.text, item.poi_id ?? null, item.poi_id === undefined, item.priority],
        );
        ids.push(existing.id);
        if (existing.title !== item.text || existing.poi_id !== (item.poi_id ?? null)) {
          changed.push(existing.id);
        }
        continue;
      }
      const merged = await mergeTarget(tx, payload.trip_id, ctx.uid, item.poi_id, item.text);
      if (merged !== undefined) {
        await asSystemRole(tx, () =>
          tx.query(
            `UPDATE must_dos SET co_owner_ids = array_append(co_owner_ids, $2)
              WHERE id = $1 AND NOT ($2 = ANY(co_owner_ids))`,
            [merged, ctx.uid],
          ),
        );
        ids.push(merged);
        continue;
      }
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO must_dos (id, trip_id, owner_id, title, poi_id, freeform, priority)
         VALUES (coalesce($1, uuidv7()), $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          item.id ?? null,
          payload.trip_id,
          ctx.uid,
          item.text,
          item.poi_id ?? null,
          item.poi_id === undefined,
          item.priority,
        ],
      );
      ids.push(rows[0]?.id as string);
      changed.push(rows[0]?.id as string);
    }
    await asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE must_dos SET co_owner_ids = array_remove(co_owner_ids, $2)
          WHERE trip_id = $1 AND $2 = ANY(co_owner_ids) AND NOT (id = ANY($3::uuid[]))`,
        [payload.trip_id, ctx.uid, ids],
      );
      if (changed.length > 0) {
        await tx.query(
          `UPDATE must_dos SET fit_status = 'unknown', fit_note = NULL, target_day = NULL,
                  external_action = 'none', external_deadline = NULL
            WHERE id = ANY($1::uuid[])`,
          [changed],
        );
      }
    });
    for (const id of changed) {
      await publishSetup(tx, payload.trip_id, SETUP_RT.mustDoRow, {
        must_do_id: id,
        fit_status: 'unknown',
      });
    }
    if (changed.length > 0) await queueFitChecks(tx, payload.trip_id);
    await emitEvent(tx, {
      type: 'must_dos.changed',
      aggregateKind: 'trip',
      aggregateId: payload.trip_id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: payload.trip_id,
      payload: { trip_id: payload.trip_id, user_id: ctx.uid, must_do_ids: ids },
    });
    return { trip_id: payload.trip_id, must_do_ids: ids };
  },
});

export const trackLotteryCommand = defineCommand({
  name: 'track_lottery',
  v: 1,
  schema: trackLotteryPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rowCount } = await tx.query(
      'SELECT 1 FROM must_dos WHERE id = $1 AND deleted_at IS NULL',
      [payload.must_do_id],
    );
    if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'must_do' });
  },
  handle: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ trip_id: string }>(
      'SELECT trip_id FROM must_dos WHERE id = $1',
      [payload.must_do_id],
    );
    const tripId = rows[0]?.trip_id as string;
    const trip = await requireSetupMember(tx, tripId, ctx.uid);
    requireStatus(trip, MUST_DO_OPEN_STATUSES);
    const tz = trip.tz ?? ctx.device.tz;
    const slots = [
      { slot: 'deadline' as const, date: addDays(payload.deadline, -1) },
      ...(payload.result_date === undefined
        ? []
        : [{ slot: 'result' as const, date: payload.result_date }]),
    ];
    for (const { slot, date } of slots) {
      await tx.query(
        `INSERT INTO reminders (user_id, target_kind, target_id, fire_at, condition)
         VALUES ($1, 'must_do', $2, (($3::date + time '09:00') AT TIME ZONE $4), $5)`,
        [ctx.uid, payload.must_do_id, date, tz, JSON.stringify({ slot, trip_id: tripId })],
      );
      await scheduleEvent(tx, {
        kind: SETUP_QUEUES.lotteryRemind,
        refId: payload.must_do_id,
        slot: `${ctx.uid}:${slot}`,
        tz,
        local: { date, time: '09:00' },
        data: { user_id: ctx.uid, slot },
      });
    }
    await asSystemRole(tx, () =>
      tx.query(
        `UPDATE must_dos SET external_action = 'lottery', external_deadline = $2 WHERE id = $1`,
        [payload.must_do_id, payload.deadline],
      ),
    );
    await emitEvent(tx, {
      type: 'lottery.tracked',
      aggregateKind: 'must_do',
      aggregateId: payload.must_do_id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId,
      payload: { trip_id: tripId, user_id: ctx.uid, must_do_id: payload.must_do_id },
    });
    return { must_do_id: payload.must_do_id, reminders: slots.map((s) => s.slot) };
  },
});

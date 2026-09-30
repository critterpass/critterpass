/**
 * `act_briefing_item` (docs/api-contracts.md §4.12): a chip on the caller's own briefing. DONE, SET
 * and OPEN settle the item; NUDGE nudges the members the fact concerns (the crewmate nudge, one
 * per pair a day) and every viewer's matching item for that day shows "SENT". Acting twice
 * changes nothing.
 */
import { appendDomainEvent } from '@cp/db';
import {
  ACTED_STATUS,
  actBriefingItemPayloadSchema,
  DomainError,
  NUDGE_INTERVAL_HOURS,
  type BriefingAction,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

interface ItemRow {
  readonly id: string;
  readonly briefing_id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly action: BriefingAction;
  readonly status: string;
  readonly dedupe_key: string;
  readonly local_date: string;
  readonly target_user_ids: string[];
}

/** The caller's own item (RLS shows no one else's). */
async function requireOwnItem(tx: pg.PoolClient, itemId: string): Promise<ItemRow> {
  const { rows } = await tx.query<ItemRow>(
    `SELECT i.id, i.briefing_id, i.trip_id, t.crew_id, i.action, i.status, i.dedupe_key,
            b.local_date::text AS local_date, i.target_user_ids
       FROM briefing_items i
       JOIN briefings b ON b.id = i.briefing_id
       JOIN trips t ON t.id = i.trip_id
      WHERE i.id = $1`,
    [itemId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'briefing_item' });
  return row;
}

/** Nudges each target not nudged by the caller in the last day; returns who was nudged. */
async function nudgeTargets(tx: pg.PoolClient, item: ItemRow, sender: string, now: Date) {
  const nudged: string[] = [];
  for (const target of item.target_user_ids) {
    if (target === sender) continue;
    const recent = await tx.query(
      `SELECT 1 FROM nudges WHERE sender_id = $1 AND target_id = $2
          AND created_at > $3::timestamptz - make_interval(hours => $4)`,
      [sender, target, now, NUDGE_INTERVAL_HOURS],
    );
    if (recent.rows.length > 0) continue;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, context, channel,
         send_at, sent_at)
       VALUES ($1, $2, $3, $4, 'readiness', $5, 'push', $6, $6) RETURNING id`,
      [
        sender,
        target,
        item.crew_id,
        item.trip_id,
        JSON.stringify({ kind: 'briefing_item', id: item.id }),
        now,
      ],
    );
    const nudgeId = rows[0]?.id;
    if (nudgeId === undefined) continue;
    const ref = {
      nudge_id: nudgeId,
      sender_id: sender,
      target_id: target,
      crew_id: item.crew_id,
      reason: 'readiness' as const,
    };
    for (const type of ['nudge.sent', 'nudge.received'] as const) {
      await appendDomainEvent(tx, {
        type,
        aggregateKind: 'nudge',
        aggregateId: ref.nudge_id,
        actorKind: type === 'nudge.sent' ? 'user' : 'system',
        actorId: type === 'nudge.sent' ? sender : null,
        payload: type === 'nudge.sent' ? { ...ref, channel: 'push' } : ref,
        crewId: item.crew_id,
        tripId: item.trip_id,
      });
    }
    nudged.push(target);
  }
  return nudged;
}

export const actBriefingItemCommand = defineCommand({
  name: 'act_briefing_item',
  v: 1,
  schema: actBriefingItemPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const item = await requireOwnItem(tx, payload.item_id);
    if (item.action !== payload.action && payload.action !== 'open') {
      throw new DomainError('STATE_INVALID', { reason: 'action_mismatch', action: item.action });
    }
  },
  handle: async (tx, payload, ctx) => {
    const item = await requireOwnItem(tx, payload.item_id);
    if (item.status !== 'open') return { item_id: item.id, status: item.status, nudged: [] };
    const status = ACTED_STATUS[payload.action];
    return asSystemRole(tx, async () => {
      const now = ctx.clock.serverNow;
      let nudged: string[] = [];
      if (payload.action === 'nudge') {
        nudged = await nudgeTargets(tx, item, ctx.uid, now);
        // Everyone whose briefing that day carries the same fact sees it sent.
        await tx.query(
          `UPDATE briefing_items i SET status = 'nudged', acted_at = $4
             FROM briefings b
            WHERE b.id = i.briefing_id AND i.trip_id = $1 AND i.dedupe_key = $2
              AND b.local_date = $3::date AND i.action = 'nudge' AND i.status = 'open'`,
          [item.trip_id, item.dedupe_key, item.local_date, now],
        );
      } else {
        await tx.query('UPDATE briefing_items SET status = $2, acted_at = $3 WHERE id = $1', [
          item.id,
          status,
          now,
        ]);
      }
      await appendDomainEvent(tx, {
        type: 'briefing.item_acted',
        aggregateKind: 'briefing_item',
        aggregateId: item.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: item.trip_id,
        payload: {
          trip_id: item.trip_id,
          user_id: ctx.uid,
          item_id: item.id,
          action: payload.action,
        },
      });
      const names =
        nudged.length === 0
          ? []
          : (
              await tx.query<{ name: string }>(
                `SELECT split_part(trim(display_name), ' ', 1) AS name FROM users
                  WHERE id = ANY($1) ORDER BY array_position($1, id)`,
                [nudged],
              )
            ).rows.map((row) => row.name);
      return { item_id: item.id, status, nudged, nudged_names: names };
    });
  },
});

/**
 * The demo inbox, tip and nudges, reset on every seed so a device flow always starts from the
 * same state. Items carry the ids and short values the worker's fan-out files for each kind
 * (services/worker/src/jobs/inbox/kinds.ts), plus `demo: true` so a reseed only ever replaces its
 * own rows. Scenarios pick the needs-you cards on top:
 *
 * - `everyday`: Maya's nudge ("Take a look") and Rin's missing RSVP (NUDGE, runs `send_nudge`);
 * - `inbox`: Maya's nudge only;
 * - `caught_up`: nothing needs the caller;
 * - `vote` and `vote_final`: the `everyday` inbox beside the crew's destination vote
 *   (./demo-vote.ts), on its board or already in its final.
 *
 * Every scenario keeps the EARLIER rows: a crewmate joined, an invite was opened, Tokek's plan
 * change (UNDO) and a fare drop.
 */
import {
  crewChatLink,
  crewInviteLink,
  guideActionResolveKey,
  INBOX_KIND,
  type InboxAction,
  NUDGE_INBOX_TTL_MS,
  nudgeResolveKey,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import type { DemoGuideAction } from './demo-plan';
import type { DemoWorld } from './demo-world';

export const demoScenarioSchema = z.enum(['everyday', 'inbox', 'caught_up', 'vote', 'vote_final']);
export type DemoScenario = z.infer<typeof demoScenarioSchema>;

const TIP_TEXT = 'Fares to Bali dipped 18% this week. A good moment to book.';
const TIP_VALID_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE = 60_000;

interface DemoItem {
  readonly kind: string;
  readonly source: 'crew' | 'guide';
  readonly needsYou: boolean;
  readonly actorId: string | null;
  readonly data: Record<string, unknown>;
  readonly actions?: readonly InboxAction[];
  readonly deepLink?: string;
  readonly expiresAt?: Date;
  readonly undoUntil?: Date;
  readonly resolveKey?: string;
  /** How long ago it happened, so the list reads in a natural order. */
  readonly minutesAgo: number;
}

/** The tip on the crew's Home strip, active again for a week. */
async function refreshTip(tx: pg.PoolClient, world: DemoWorld, now: Date): Promise<void> {
  await tx.query(
    `INSERT INTO home_tips (crew_id, guide_id, kind, text, facts, place_id, dedupe_key, valid_until)
     VALUES ($1, $2, 'fare_drop', $3, $4, $5, 'demo:fare_drop', $6)
     ON CONFLICT (crew_id, dedupe_key) DO UPDATE
       SET status = 'active', dismissed_by = NULL, dismissed_at = NULL,
           valid_until = EXCLUDED.valid_until, text = EXCLUDED.text`,
    [
      world.crewId,
      world.guideId,
      TIP_TEXT,
      JSON.stringify({ route: 'SIN-DPS', drop_pct: 18 }),
      world.destinationId,
      new Date(now.getTime() + TIP_VALID_MS),
    ],
  );
}

/** Maya's nudge to the caller, recreated; the caller's own nudges to the crew are cleared. */
async function resetNudges(tx: pg.PoolClient, world: DemoWorld, uid: string): Promise<string> {
  const crewmates = Object.values(world.members);
  await tx.query('DELETE FROM nudges WHERE sender_id = $1 AND target_id = ANY ($2::uuid[])', [
    uid,
    crewmates,
  ]);
  await tx.query('DELETE FROM nudges WHERE sender_id = ANY ($1::uuid[]) AND target_id = $2', [
    crewmates,
    uid,
  ]);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, context, channel, sent_at)
     VALUES ($1, $2, $3, $4, 'readiness', $5, 'inbox', now()) RETURNING id`,
    [
      world.members.maya,
      uid,
      world.crewId,
      world.tripId,
      JSON.stringify({ kind: 'trip', id: world.tripId }),
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('demo seed: the nudge was not stored');
  return id;
}

function demoItems(
  world: DemoWorld,
  uid: string,
  scenario: DemoScenario,
  nudgeId: string,
  guideAction: DemoGuideAction,
  now: Date,
): DemoItem[] {
  const { crewId, tripId, members } = world;
  const items: DemoItem[] = [
    {
      kind: INBOX_KIND.memberJoined,
      source: 'crew',
      needsYou: false,
      actorId: members.jordan,
      data: { crew_id: crewId, user_id: members.jordan },
      deepLink: crewChatLink(crewId),
      minutesAgo: 60 * 26,
    },
    {
      kind: INBOX_KIND.inviteOpened,
      source: 'crew',
      needsYou: false,
      actorId: null,
      data: { join_code_id: null, channel: 'whatsapp' },
      deepLink: crewInviteLink(crewId),
      minutesAgo: 60 * 5,
    },
    {
      kind: INBOX_KIND.guideActionExecuted,
      source: 'guide',
      needsYou: false,
      actorId: null,
      data: {
        action_id: guideAction.actionId,
        action_kind: 'reschedule_pickup',
        summary: guideAction.summary,
        guide: 'tokek',
      },
      actions: [
        {
          id: 'undo',
          style: 'undo',
          command: 'undo_guide_action',
          payload: { action_id: guideAction.actionId },
        },
      ],
      undoUntil: guideAction.undoUntil,
      resolveKey: guideActionResolveKey(guideAction.actionId),
      minutesAgo: 40,
    },
    {
      kind: INBOX_KIND.tipPriceDrop,
      source: 'guide',
      needsYou: false,
      actorId: null,
      data: { text: TIP_TEXT, guide: 'tokek' },
      minutesAgo: 90,
    },
  ];
  if (scenario !== 'caught_up') {
    items.push({
      kind: INBOX_KIND.nudgeReceived,
      source: 'crew',
      needsYou: true,
      actorId: members.maya,
      data: {
        nudge_id: nudgeId,
        sender_id: members.maya,
        reason: 'readiness',
        context_kind: 'trip',
        context_id: tripId,
        guide: 'tokek',
      },
      actions: [{ id: 'open', style: 'primary' }],
      expiresAt: new Date(now.getTime() + NUDGE_INBOX_TTL_MS),
      resolveKey: nudgeResolveKey(uid, 'trip', tripId),
      minutesAgo: 12,
    });
  }
  if (scenario === 'everyday' || scenario === 'vote' || scenario === 'vote_final') {
    // Rin joined but has not said if they are in: the RSVP follow-up asks the guide to nudge.
    items.push({
      kind: INBOX_KIND.memberJoined,
      source: 'crew',
      needsYou: true,
      actorId: members.rin,
      data: { crew_id: crewId, user_id: members.rin },
      actions: [
        {
          id: 'nudge',
          style: 'primary',
          command: 'send_nudge',
          payload: {
            target_uid: members.rin,
            reason: 'rsvp',
            context: { kind: 'trip', id: tripId },
          },
        },
      ],
      deepLink: crewChatLink(crewId),
      minutesAgo: 25,
    });
  }
  return items;
}

/** Replaces the caller's demo inbox, tip and nudges with the scenario's fresh state; returns the new item ids. */
export async function resetDemoInbox(
  tx: pg.PoolClient,
  world: DemoWorld,
  uid: string,
  scenario: DemoScenario,
  guideAction: DemoGuideAction,
  now: Date,
): Promise<string[]> {
  await refreshTip(tx, world, now);
  const nudgeId = await resetNudges(tx, world, uid);
  await tx.query(`DELETE FROM inbox_items WHERE user_id = $1 AND data ->> 'demo' = 'true'`, [uid]);
  const items = demoItems(world, uid, scenario, nudgeId, guideAction, now);
  const ids: string[] = [];
  for (const item of items) {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO inbox_items (user_id, crew_id, trip_id, kind, source, actor_id, resolve_key,
         data, needs_you, actions, deep_link, expires_at, undo_until, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        uid,
        world.crewId,
        world.tripId,
        item.kind,
        item.source,
        item.actorId,
        item.resolveKey ?? null,
        JSON.stringify({ ...item.data, demo: true }),
        item.needsYou,
        JSON.stringify(item.actions ?? []),
        item.deepLink ?? null,
        item.expiresAt ?? null,
        item.undoUntil ?? null,
        new Date(now.getTime() - item.minutesAgo * MINUTE),
      ],
    );
    if (rows[0] !== undefined) ids.push(rows[0].id);
  }
  return ids;
}

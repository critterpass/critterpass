/**
 * `send_nudge` (docs/api-contracts.md §4.3; docs/product-decisions.md, nudges). A crewmate asks
 * the guide to nudge someone about a vote, an RSVP, readiness, a payment or an unopened invite.
 *
 * - One nudge per (sender, target) per 24 hours: `NUDGE_TOO_SOON` with `next_at`.
 * - The branch is on "installed" (the target has any registered device), never on a push token:
 *   - installed with push → scheduled at the target's engagement hour (`scheduled_deliveries` +
 *     a `nudge.dispatch` timer), delivered as an inbox item plus the N-12 push;
 *   - installed without push → an inbox item now, no push (`outcome: 'inbox'`);
 *   - not installed → nothing is sent by us: the sender gets guide-voiced text and the invite
 *     link for their own share sheet (`outcome: 'relay'`).
 */
import { appendDomainEvent, scheduleEvent } from '@cp/db';
import {
  DomainError,
  engagementHour,
  linkHostsFor,
  buildLink,
  NUDGE_DISPATCH_QUEUE,
  NUDGE_TARGET_DAILY_CAP,
  nudgeAvailableAt,
  nudgeRelayText,
  nudgeSendTime,
  sendNudgePayloadSchema,
  type LinkEnvironment,
  type NudgeGuide,
  type SendNudgePayload,
  type SendNudgeResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

const DEFAULT_GUIDE: NudgeGuide = { slug: 'tokek', name: 'Tokek' };

interface SharedCrew {
  readonly crew_id: string;
  readonly name: string;
}

/** The sender's crew the target is in (or invited to), preferring the sender's Home crew. */
async function sharedCrew(tx: pg.PoolClient, sender: string, other: string) {
  const { rows } = await tx.query<SharedCrew>(
    `SELECT c.id AS crew_id, c.name
       FROM crew_members me JOIN crews c ON c.id = me.crew_id
      WHERE me.user_id = $1 AND me.status = 'active'
        AND (EXISTS (SELECT 1 FROM crew_members o
                      WHERE o.crew_id = me.crew_id AND o.user_id = $2 AND o.status = 'active')
             OR EXISTS (SELECT 1 FROM invites i
                         WHERE i.crew_id = me.crew_id AND i.invitee_user_id = $2
                           AND i.status IN ('pending', 'later')))
      ORDER BY (me.crew_id = (SELECT active_crew_id FROM user_settings WHERE user_id = $1))
               DESC NULLS LAST, me.crew_id
      LIMIT 1`,
    [sender, other],
  );
  return rows[0];
}

async function lastPairNudge(tx: pg.PoolClient, sender: string, other: string) {
  const { rows } = await tx.query<{ at: Date | null }>(
    'SELECT max(created_at) AS at FROM nudges WHERE sender_id = $1 AND target_id = $2',
    [sender, other],
  );
  return rows[0]?.at ?? null;
}

interface TargetFacts {
  readonly name: string;
  readonly tz: string;
  readonly installed: boolean;
  readonly has_push: boolean;
  readonly quiet_from: string | null;
  readonly quiet_to: string | null;
}

async function targetFacts(tx: pg.PoolClient, uid: string): Promise<TargetFacts> {
  const { rows } = await tx.query<TargetFacts>(
    `SELECT coalesce(split_part(trim(u.display_name), ' ', 1), '') AS name,
            coalesce(u.tz, 'UTC') AS tz,
            EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id) AS installed,
            EXISTS (SELECT 1 FROM devices d JOIN push_tokens t ON t.device_id = d.id
                     WHERE d.user_id = u.id AND t.invalid_at IS NULL
                       AND coalesce(d.permission_state ->> 'notif', '') <> 'denied') AS has_push,
            p.quiet_from::text AS quiet_from, p.quiet_to::text AS quiet_to
       FROM users u LEFT JOIN notification_prefs p ON p.user_id = u.id
      WHERE u.id = $1`,
    [uid],
  );
  const facts = rows[0];
  if (facts === undefined) throw new DomainError('NOT_FOUND', { reason: 'member' });
  return facts;
}

async function crewGuide(tx: pg.PoolClient, crewId: string) {
  const { rows } = await tx.query<{ trip_id: string; slug: string | null; name: string | null }>(
    `SELECT t.id AS trip_id, g.slug, g.name FROM trips t LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.crew_id = $1 AND t.status NOT IN ('archived', 'cancelled', 'post_trip')
      ORDER BY (t.status = 'in_trip') DESC, t.start_date NULLS LAST, t.created_at
      LIMIT 1`,
    [crewId],
  );
  const row = rows[0];
  const guide =
    row?.slug != null && row.name !== null ? { slug: row.slug, name: row.name } : DEFAULT_GUIDE;
  return { tripId: row?.trip_id ?? null, guide };
}

async function sendAt(tx: pg.PoolClient, uid: string, facts: TargetFacts, now: Date) {
  const hours = await tx.query<{ hour_local: number; opens: number; updated_at: Date }>(
    'SELECT hour_local, opens, updated_at FROM app_open_hours WHERE user_id = $1',
    [uid],
  );
  const full = await tx.query<{ day: string }>(
    `SELECT to_char(send_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day FROM nudges
      WHERE target_id = $1 AND channel <> 'share_sheet' AND send_at > $3
      GROUP BY 1 HAVING count(*) >= $4`,
    [uid, facts.tz, now, NUDGE_TARGET_DAILY_CAP],
  );
  const hour = engagementHour(
    hours.rows.map((row) => ({
      hourLocal: row.hour_local,
      opens: row.opens,
      updatedAt: row.updated_at,
    })),
    now,
  );
  return nudgeSendTime({
    now,
    tz: facts.tz,
    hour,
    quiet:
      facts.quiet_from === null || facts.quiet_to === null
        ? null
        : { from: facts.quiet_from, to: facts.quiet_to },
    fullDates: new Set(full.rows.map((row) => row.day)),
  });
}

/** The invite link the relay shares: the target's own pending invite, else the crew's code. */
async function relayUrl(
  tx: pg.PoolClient,
  crewId: string,
  uid: string,
  linkEnv: LinkEnvironment,
): Promise<string | null> {
  const { rows } = await tx.query<{ code: string }>(
    `SELECT j.code FROM join_codes j
      WHERE j.status = 'active' AND (j.expires_at IS NULL OR j.expires_at > now())
        AND (j.id IN (SELECT i.join_code_id FROM invites i
                       WHERE i.crew_id = $1 AND i.invitee_user_id = $2
                         AND i.status IN ('pending', 'later'))
             OR (j.crew_id = $1 AND j.target_kind = 'crew'))
      ORDER BY (j.target_kind <> 'crew') DESC, j.created_at DESC
      LIMIT 1`,
    [crewId, uid],
  );
  const code = rows[0]?.code;
  if (code === undefined) return null;
  const [host] = linkHostsFor(linkEnv);
  return buildLink({ kind: 'invite', code }, { host });
}

async function senderName(tx: pg.PoolClient, uid: string): Promise<string> {
  const { rows } = await tx.query<{ name: string }>(
    `SELECT coalesce(split_part(trim(display_name), ' ', 1), '') AS name FROM users WHERE id = $1`,
    [uid],
  );
  return rows[0]?.name ?? '';
}

export interface SendNudgeDeps {
  readonly linkEnv: LinkEnvironment;
}

export function createSendNudgeCommand(deps: SendNudgeDeps) {
  return defineCommand({
    name: 'send_nudge',
    v: 1,
    schema: sendNudgePayloadSchema,
    offline: true,
    allowAnonymous: true,
    actionScope: 'money_nudge',
    authorize: async (tx, payload, ctx) => {
      if (payload.target_uid === ctx.uid) throw new DomainError('VALIDATION', { reason: 'self' });
      if ((await sharedCrew(tx, ctx.uid, payload.target_uid)) === undefined) {
        throw new DomainError('NOT_FOUND', { reason: 'member' });
      }
      const nextAt = nudgeAvailableAt(
        await lastPairNudge(tx, ctx.uid, payload.target_uid),
        ctx.clock.serverNow,
      );
      if (nextAt !== null) {
        throw new DomainError('NUDGE_TOO_SOON', { next_at: nextAt.toISOString() });
      }
    },
    handle: (tx, payload, ctx) => sendNudge(tx, payload, ctx.uid, ctx.clock.serverNow, deps),
  });
}

async function sendNudge(
  tx: pg.PoolClient,
  payload: SendNudgePayload,
  sender: string,
  now: Date,
  deps: SendNudgeDeps,
): Promise<SendNudgeResult> {
  const crew = await sharedCrew(tx, sender, payload.target_uid);
  if (crew === undefined) throw new DomainError('NOT_FOUND', { reason: 'member' });
  const { tripId, guide } = await crewGuide(tx, crew.crew_id);
  const from = await senderName(tx, sender);
  const context = payload.context ?? { kind: payload.reason, id: crew.crew_id };
  const uid = payload.target_uid;

  return asSystemRole(tx, async () => {
    const facts = await targetFacts(tx, uid);
    const base = { guide, target_name: facts.name };
    const insert = async (channel: string, extra: { sendAt: Date | null; sent: boolean }) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO nudges (sender_id, target_id, crew_id, trip_id, reason, context, channel,
           send_at, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          sender,
          uid,
          crew.crew_id,
          tripId,
          payload.reason,
          JSON.stringify(context),
          channel,
          extra.sendAt,
          extra.sent ? now : null,
        ],
      );
      const row = rows[0];
      if (row === undefined) throw new Error('nudge insert returned no row');
      return row.id;
    };
    const announce = async (type: 'nudge.sent' | 'nudge.received', id: string, channel: string) => {
      const ref = {
        nudge_id: id,
        sender_id: sender,
        target_id: uid,
        crew_id: crew.crew_id,
        reason: payload.reason,
      };
      await appendDomainEvent(tx, {
        type,
        aggregateKind: 'nudge',
        aggregateId: id,
        actorKind: type === 'nudge.sent' ? 'user' : 'system',
        actorId: type === 'nudge.sent' ? sender : null,
        payload: type === 'nudge.sent' ? { ...ref, channel } : ref,
        crewId: crew.crew_id,
        ...(tripId === null ? {} : { tripId }),
      });
    };

    if (!facts.installed) {
      const id = await insert('share_sheet', { sendAt: null, sent: true });
      await announce('nudge.sent', id, 'share_sheet');
      const url = await relayUrl(tx, crew.crew_id, uid, deps.linkEnv);
      return {
        outcome: 'relay',
        relay: 'share_sheet',
        nudge_id: id,
        text: nudgeRelayText({ guide: guide.name, sender: from, crew: crew.name, url }),
        url,
        ...base,
      };
    }

    if (!facts.has_push) {
      const id = await insert('inbox', { sendAt: now, sent: true });
      await announce('nudge.sent', id, 'inbox');
      await announce('nudge.received', id, 'inbox');
      return { outcome: 'inbox', nudge_id: id, ...base };
    }

    const at = await sendAt(tx, uid, facts, now);
    const id = await insert('push', { sendAt: at.at, sent: false });
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO scheduled_deliveries (user_id, kind, target_ref, send_at_local, tz, due_at, payload)
       VALUES ($1, 'nudge', $2, $3, $4, $5, $6) RETURNING id`,
      [uid, id, at.local, facts.tz, at.at, JSON.stringify({ nudge_id: id })],
    );
    await tx.query('UPDATE nudges SET scheduled_delivery_id = $2 WHERE id = $1', [
      id,
      rows[0]?.id ?? null,
    ]);
    await scheduleEvent(tx, { kind: NUDGE_DISPATCH_QUEUE, refId: id, tz: facts.tz, at: at.at });
    await announce('nudge.sent', id, 'push');
    return {
      outcome: 'scheduled',
      nudge_id: id,
      send_at: at.at.toISOString(),
      send_at_local: at.local.slice(11, 16),
      tz: facts.tz,
      ...base,
    };
  });
}

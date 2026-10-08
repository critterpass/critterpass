/**
 * Who receives Home's inbox kinds and what each item carries (the kinds are declared in
 * @cp/domain `HOME_INBOX_KINDS`). Items carry ids and short values only; the app renders the line
 * and any live body from them and its synced rows, in the reader's language.
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

import { registerInboxFanout, type FanoutEvent } from './fanout';

/** An invite opened again within this window files no second row for its inviter. */
export const INVITE_OPEN_QUIET_MS = 24 * 60 * 60 * 1000;

const str = (event: FanoutEvent, key: string): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

/** The `uid` column of every row `sql` returns. */
async function uids(tx: pg.PoolClient, sql: string, params: unknown[]): Promise<string[]> {
  return (await tx.query<{ uid: string }>(sql, params)).rows.map((row) => row.uid);
}

async function activeMembers(tx: pg.PoolClient, crewId: string | null): Promise<string[]> {
  if (crewId === null) return [];
  return uids(
    tx,
    `SELECT user_id AS uid FROM crew_members WHERE crew_id = $1 AND status = 'active'`,
    [crewId],
  );
}

function registerMemberJoined(): void {
  registerInboxFanout({
    kind: INBOX_KIND.memberJoined,
    async audience(tx, event) {
      const joiner = str(event, 'user_id');
      return (await activeMembers(tx, str(event, 'crew_id'))).filter((uid) => uid !== joiner);
    },
    build(_tx, event) {
      const crewId = str(event, 'crew_id');
      const joiner = str(event, 'user_id');
      return Promise.resolve({
        crewId,
        actorId: joiner,
        data: { crew_id: crewId, user_id: joiner },
        deepLink: crewId === null ? null : crewChatLink(crewId),
      });
    },
  });
}

function registerInviteOpened(): void {
  registerInboxFanout({
    kind: INBOX_KIND.inviteOpened,
    audience: (tx, event) =>
      uids(tx, 'SELECT created_by AS uid FROM join_codes WHERE id = $1', [
        str(event, 'join_code_id'),
      ]),
    async build(tx, event, uid) {
      const codeId = str(event, 'join_code_id');
      const { rows } = await tx.query<{ crew_id: string | null }>(
        'SELECT crew_id FROM join_codes WHERE id = $1',
        [codeId],
      );
      const recent = await tx.query(
        `SELECT 1 FROM inbox_items
          WHERE user_id = $1 AND kind = $2 AND data->>'join_code_id' = $3 AND created_at > $4`,
        [
          uid,
          INBOX_KIND.inviteOpened,
          codeId,
          new Date(event.occurredAt.getTime() - INVITE_OPEN_QUIET_MS),
        ],
      );
      if ((recent.rowCount ?? 0) > 0) return null;
      const crewId = rows[0]?.crew_id ?? null;
      return {
        crewId,
        actorId: null,
        data: { join_code_id: codeId, channel: str(event, 'channel') },
        deepLink: crewId === null ? null : crewInviteLink(crewId),
      };
    },
  });
}

function registerNudgeReceived(): void {
  registerInboxFanout({
    kind: INBOX_KIND.nudgeReceived,
    audience: (_tx, event) => {
      const target = str(event, 'target_id');
      return Promise.resolve(target === null ? [] : [target]);
    },
    async build(tx, event, uid) {
      const { rows } = await tx.query<{
        id: string;
        sender_id: string;
        crew_id: string;
        trip_id: string | null;
        reason: string;
        context: { kind?: string; id?: string };
        guide_slug: string | null;
      }>(
        `SELECT n.id, n.sender_id, n.crew_id, n.trip_id, n.reason, n.context, g.slug AS guide_slug
           FROM nudges n
           LEFT JOIN trips t ON t.id = n.trip_id
           LEFT JOIN guides g ON g.id = t.guide_id
          WHERE n.id = $1`,
        [str(event, 'nudge_id')],
      );
      const nudge = rows[0];
      if (nudge === undefined) return null;
      const contextKind = nudge.context.kind ?? nudge.reason;
      const contextId = nudge.context.id ?? nudge.crew_id;
      const open: InboxAction = { id: 'open', style: 'primary' };
      return {
        crewId: nudge.crew_id,
        tripId: nudge.trip_id,
        actorId: nudge.sender_id,
        data: {
          nudge_id: nudge.id,
          sender_id: nudge.sender_id,
          reason: nudge.reason,
          context_kind: contextKind,
          context_id: contextId,
          guide: nudge.guide_slug ?? 'tokek',
        },
        actions: [open],
        expiresAt: new Date(event.occurredAt.getTime() + NUDGE_INBOX_TTL_MS),
        resolveKey: nudgeResolveKey(uid, contextKind, contextId),
      };
    },
  });
}

interface GuideActionRow {
  id: string;
  kind: string;
  trip_id: string;
  undo_until: Date;
  audit: { summary?: unknown; affected_user_ids?: unknown };
  guide_slug: string | null;
}

async function appliedGuideAction(
  tx: pg.PoolClient,
  event: FanoutEvent,
): Promise<GuideActionRow | undefined> {
  const { rows } = await tx.query<GuideActionRow>(
    `SELECT ga.id, ga.kind, ga.trip_id, ga.undo_until, ga.audit, g.slug AS guide_slug
       FROM guide_actions ga
       JOIN trips t ON t.id = ga.trip_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE ga.change_set_id = $1 AND ga.undo_until IS NOT NULL AND ga.reversible
      ORDER BY ga.created_at DESC LIMIT 1`,
    [str(event, 'change_set_id')],
  );
  return rows[0];
}

function registerGuideActionExecuted(): void {
  registerInboxFanout({
    kind: INBOX_KIND.guideActionExecuted,
    async audience(tx, event) {
      const action = await appliedGuideAction(tx, event);
      if (action === undefined) return [];
      return uids(
        tx,
        'SELECT user_id AS uid FROM trip_participants WHERE trip_id = $1 AND holds_seat',
        [action.trip_id],
      );
    },
    async build(tx, event) {
      const action = await appliedGuideAction(tx, event);
      if (action === undefined || action.undo_until.getTime() <= Date.now()) return null;
      const summary = typeof action.audit.summary === 'string' ? action.audit.summary : null;
      const undo: InboxAction = {
        id: 'undo',
        style: 'undo',
        command: 'undo_guide_action',
        payload: { action_id: action.id },
      };
      return {
        tripId: action.trip_id,
        actorId: null,
        data: {
          action_id: action.id,
          action_kind: action.kind,
          summary: summary?.slice(0, 140) ?? null,
          guide: action.guide_slug ?? 'tokek',
        },
        actions: [undo],
        undoUntil: action.undo_until,
        resolveKey: guideActionResolveKey(action.id),
      };
    },
  });
}

function registerTipPriceDrop(): void {
  registerInboxFanout({
    kind: INBOX_KIND.tipPriceDrop,
    async audience(tx, event) {
      if (str(event, 'kind') !== 'fare_drop') return [];
      // A member who turned guide tips off gets no tip rows either.
      return uids(
        tx,
        `SELECT m.user_id AS uid FROM crew_members m
           LEFT JOIN notification_prefs p ON p.user_id = m.user_id
          WHERE m.crew_id = $1 AND m.status = 'active' AND coalesce(p.guide_tips, true)`,
        [str(event, 'crew_id')],
      );
    },
    async build(tx, event) {
      const { rows } = await tx.query<{
        id: string;
        crew_id: string;
        place_id: string | null;
        text: string;
        valid_until: Date;
        guide_slug: string | null;
      }>(
        `SELECT t.id, t.crew_id, t.place_id, t.text, t.valid_until, g.slug AS guide_slug
           FROM home_tips t LEFT JOIN guides g ON g.id = t.guide_id
          WHERE t.id = $1 AND t.status = 'active'`,
        [str(event, 'tip_id')],
      );
      const tip = rows[0];
      if (tip === undefined) return null;
      return {
        crewId: tip.crew_id,
        actorId: null,
        data: {
          tip_id: tip.id,
          place_id: tip.place_id,
          text: tip.text,
          guide: tip.guide_slug ?? 'tokek',
        },
        expiresAt: tip.valid_until,
      };
    },
  });
}

let registered = false;

/** Registers Home's inbox fan-outs once per process. */
export function registerHomeInboxFanouts(): void {
  if (registered) return;
  registered = true;
  registerMemberJoined();
  registerInviteOpened();
  registerNudgeReceived();
  registerGuideActionExecuted();
  registerTipPriceDrop();
}

/** Test-only: allow a fresh registration after `resetInboxFanoutsForTests`. */
export function resetHomeInboxFanoutsForTests(): void {
  registered = false;
}

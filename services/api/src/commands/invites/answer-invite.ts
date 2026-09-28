/**
 * The answers to an invite that are not a join: the in-app invitee parks it (`defer_invite`, kept
 * under "Later" until it expires) or declines it, and the inviter or a crew organiser revokes it.
 * Each is a legal step of the invite machine or `STATE_INVALID`.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  effectiveInviteStatus,
  inviteIdPayloadSchema,
  transitionInvite,
  type CommandContext,
  type InviteStatus,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { refreshShareCard } from './share-cards';

interface InviteRow {
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly inviter_id: string;
  readonly invitee_user_id: string | null;
  readonly status: InviteStatus;
  readonly expires_at: Date;
}

async function loadInvite(tx: pg.PoolClient, inviteId: string): Promise<InviteRow> {
  const { rows } = await tx.query<InviteRow>(
    `SELECT crew_id, trip_id, inviter_id, invitee_user_id, status, expires_at
       FROM invites WHERE id = $1`,
    [inviteId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'invite' });
  return row;
}

type Answer = 'later' | 'declined' | 'revoked';

const EVENT_BY_ANSWER = {
  later: 'invite.deferred',
  declined: 'invite.declined',
  revoked: 'invite.revoked',
} as const;

async function answer(
  tx: pg.PoolClient,
  inviteId: string,
  to: Answer,
  ctx: CommandContext,
): Promise<{ invite_id: string; status: InviteStatus }> {
  const invite = await loadInvite(tx, inviteId);
  const current = effectiveInviteStatus(invite.status, invite.expires_at, ctx.clock.serverNow);
  if (current === 'expired') throw new DomainError('INVITE_EXPIRED');
  const status = transitionInvite(current, to);
  await tx.query('UPDATE invites SET status = $2 WHERE id = $1', [inviteId, status]);
  await appendDomainEvent(tx, {
    type: EVENT_BY_ANSWER[to],
    aggregateKind: 'invite',
    aggregateId: inviteId,
    actorKind: 'user',
    actorId: ctx.uid,
    payload: { invite_id: inviteId, crew_id: invite.crew_id, trip_id: invite.trip_id },
    crewId: invite.crew_id,
  });
  return { invite_id: inviteId, status };
}

async function requireInvitee(tx: pg.PoolClient, inviteId: string, uid: string): Promise<void> {
  const invite = await loadInvite(tx, inviteId);
  if (invite.invitee_user_id !== uid) throw new DomainError('NOT_FOUND', { reason: 'invite' });
}

export const deferInviteCommand = defineCommand({
  name: 'defer_invite',
  v: 1,
  schema: inviteIdPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireInvitee(tx, payload.invite_id, ctx.uid),
  handle: (tx, payload, ctx) => answer(tx, payload.invite_id, 'later', ctx),
});

export const declineInviteCommand = defineCommand({
  name: 'decline_invite',
  v: 1,
  schema: inviteIdPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireInvitee(tx, payload.invite_id, ctx.uid),
  handle: (tx, payload, ctx) => answer(tx, payload.invite_id, 'declined', ctx),
});

export const revokeInviteCommand = defineCommand({
  name: 'revoke_invite',
  v: 1,
  schema: inviteIdPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const invite = await loadInvite(tx, payload.invite_id);
    if (invite.inviter_id === ctx.uid) return;
    const { rows } = await tx.query<{ organiser: boolean }>(
      'SELECT app.is_crew_organiser($1) AS organiser',
      [invite.crew_id],
    );
    if (rows[0]?.organiser !== true) throw new DomainError('FORBIDDEN', { reason: 'not_inviter' });
  },
  handle: async (tx, payload, ctx) => {
    const answered = await answer(tx, payload.invite_id, 'revoked', ctx);
    const { rows } = await tx.query<{ code: string }>(
      `SELECT c.code FROM invites i JOIN join_codes c ON c.id = i.join_code_id WHERE i.id = $1`,
      [payload.invite_id],
    );
    const code = rows[0]?.code;
    if (code !== undefined) await refreshShareCard(tx, 'invite', code);
    return answered;
  },
});

/**
 * `accept_invite` (docs/api-contracts.md §4.2): joins the caller through a crew or trip code, a
 * personal link (code + seat token) or an in-app invite. Anonymous callers may accept. Crew
 * membership is always granted up to the crew's ceiling; a trip seat is allocated under the trip's
 * row lock and a full trip waitlists the joiner (`result.waitlisted`, never an error). A personal
 * link opened by someone other than its invitee joins them through a generic seat and never
 * reveals or consumes the named one. Every failure that could confirm a code exists answers the
 * same `CODE_INVALID`; a verified personal link may say it expired or was revoked.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  acceptInvitePayloadSchema,
  assertInviteClaimable,
  classifyPersonalClaim,
  crewChannel,
  DomainError,
  effectiveInviteStatus,
  isOpenInvite,
  normalizeJoinCode,
  verifySeatToken,
  type AcceptInvitePayload,
  type AcceptInviteResult,
  type InviteStatus,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import type { InviteCommandDeps } from './deps';
import { seatTokenHash } from './deps';
import { claimTripSeat, joinCrew, type SeatClaim } from './seat-claim';

interface JoinTarget {
  readonly crewId: string;
  readonly tripId: string | null;
  /** The invite this join claims (personal link or in-app invite); null for a generic code. */
  readonly inviteId: string | null;
  readonly inviterId: string | null;
  /** The generic code this join counts one use of. */
  readonly code: string | null;
  readonly forwarded: boolean;
}

interface CodeRow {
  readonly target_kind: 'crew' | 'trip' | 'referral';
  readonly target_id: string;
  readonly crew_id: string | null;
}

const invalid = (reason: string) => new DomainError('CODE_INVALID', { reason });

async function codeTarget(
  tx: pg.PoolClient,
  code: string,
  forwarded: boolean,
): Promise<JoinTarget> {
  const { rows } = await tx.query<CodeRow>(
    'SELECT target_kind, target_id, crew_id FROM app.lookup_join_code($1)',
    [code],
  );
  const row = rows[0];
  if (row === undefined || row.crew_id === null) throw invalid('unknown');
  if (row.target_kind === 'referral')
    throw new DomainError('VALIDATION', { reason: 'referral_code' });
  return {
    crewId: row.crew_id,
    tripId: row.target_kind === 'trip' ? row.target_id : null,
    inviteId: null,
    inviterId: null,
    code,
    forwarded,
  };
}

interface SeatInviteRow {
  readonly invite_id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly inviter_id: string;
  readonly status: InviteStatus;
  readonly expires_at: Date;
  readonly claimed_by: string | null;
  readonly phone_hash: string | null;
}

async function seatTarget(
  tx: pg.PoolClient,
  deps: InviteCommandDeps,
  code: string,
  seat: string,
  uid: string,
  now: Date,
): Promise<JoinTarget> {
  const check = await verifySeatToken(seat, code, deps.seatKeyring?.keys ?? {});
  if (check.status !== 'ok') throw invalid('seat_unverified');
  const { rows } = await tx.query<SeatInviteRow>(
    `SELECT invite_id, crew_id, trip_id, inviter_id, status, expires_at, claimed_by, phone_hash
       FROM app.invite_for_seat($1)`,
    [seatTokenHash(seat)],
  );
  const invite = rows[0];
  if (invite === undefined) throw invalid('unknown');
  assertInviteClaimable(invite.status, invite.expires_at, now);
  const { rows: own } = await tx.query<{ phone_hash: string | null }>(
    'SELECT phone_hash FROM user_private WHERE user_id = $1',
    [uid],
  );
  const kind = classifyPersonalClaim(
    {
      open: isOpenInvite(effectiveInviteStatus(invite.status, invite.expires_at, now)),
      claimedBy: invite.claimed_by,
      phoneHash: invite.phone_hash,
    },
    { uid, phoneHash: own[0]?.phone_hash ?? null },
  );
  if (kind !== 'personal') return codeTarget(tx, code, true);
  return {
    crewId: invite.crew_id,
    tripId: invite.trip_id,
    inviteId: invite.claimed_by === uid ? null : invite.invite_id,
    inviterId: invite.inviter_id,
    code: null,
    forwarded: false,
  };
}

async function inAppTarget(
  tx: pg.PoolClient,
  inviteId: string,
  uid: string,
  now: Date,
): Promise<JoinTarget> {
  const { rows } = await tx.query<{
    crew_id: string;
    trip_id: string | null;
    inviter_id: string;
    status: InviteStatus;
    expires_at: Date;
  }>(
    `SELECT crew_id, trip_id, inviter_id, status, expires_at FROM invites
      WHERE id = $1 AND invitee_user_id = $2`,
    [inviteId, uid],
  );
  const invite = rows[0];
  if (invite === undefined) throw new DomainError('NOT_FOUND', { reason: 'invite' });
  assertInviteClaimable(invite.status, invite.expires_at, now);
  if (!isOpenInvite(invite.status)) {
    throw new DomainError('STATE_INVALID', { reason: 'invite_answered', state: invite.status });
  }
  return {
    crewId: invite.crew_id,
    tripId: invite.trip_id,
    inviteId,
    inviterId: invite.inviter_id,
    code: null,
    forwarded: false,
  };
}

async function resolveTarget(
  tx: pg.PoolClient,
  deps: InviteCommandDeps,
  payload: AcceptInvitePayload,
  uid: string,
  now: Date,
): Promise<JoinTarget> {
  if (payload.invite_id !== undefined) return inAppTarget(tx, payload.invite_id, uid, now);
  const code = normalizeJoinCode(payload.code ?? '');
  if (code === null) throw invalid('malformed');
  if (payload.seat !== undefined) return seatTarget(tx, deps, code, payload.seat, uid, now);
  return codeTarget(tx, code, false);
}

async function markInvite(
  tx: pg.PoolClient,
  inviteId: string,
  uid: string,
  seat: SeatClaim | null,
  now: Date,
): Promise<void> {
  const waitlisted = seat?.outcome === 'waitlisted';
  await tx.query(
    `UPDATE invites SET status = $2, claimed_by = $3, claimed_at = $4, waitlist_position = $5
      WHERE id = $1`,
    [inviteId, waitlisted ? 'waitlisted' : 'claimed', uid, now, seat?.waitlistPosition ?? null],
  );
}

export function createAcceptInviteCommand(deps: InviteCommandDeps) {
  return defineCommand({
    name: 'accept_invite',
    v: 1,
    schema: acceptInvitePayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: () => Promise.resolve(),
    handle: async (tx, payload, ctx): Promise<AcceptInviteResult> => {
      const now = ctx.clock.serverNow;
      const target = await resolveTarget(tx, deps, payload, ctx.uid, now);
      const joined = await joinCrew(tx, target.crewId, ctx.uid);
      const seat = target.tripId === null ? null : await claimTripSeat(tx, target.tripId, ctx.uid);

      // Someone already in the crew (the inviter opening their own link, say) claims nothing.
      const claimsInvite = target.inviteId !== null && (joined || target.inviterId !== ctx.uid);
      if (claimsInvite && target.inviteId !== null) {
        await markInvite(tx, target.inviteId, ctx.uid, seat, now);
      } else if (joined && target.code !== null) {
        const { rows } = await tx.query<{ used: boolean }>(
          'SELECT app.redeem_join_code($1) AS used',
          [target.code],
        );
        if (rows[0]?.used !== true) throw new DomainError('CODE_REDEEMED');
      }

      if (joined) {
        await appendDomainEvent(tx, {
          type: 'crew.member_joined',
          aggregateKind: 'crew',
          aggregateId: target.crewId,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { crew_id: target.crewId, user_id: ctx.uid },
          crewId: target.crewId,
        });
        await outbox(tx, crewChannel(target.crewId), 'member.joined', {
          crew_id: target.crewId,
          user_id: ctx.uid,
        });
      }
      if (claimsInvite && target.inviteId !== null) {
        await appendDomainEvent(tx, {
          type: 'invite.claimed',
          aggregateKind: 'invite',
          aggregateId: target.inviteId,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: {
            invite_id: target.inviteId,
            crew_id: target.crewId,
            trip_id: target.tripId,
            user_id: ctx.uid,
            outcome: seat === null ? 'crew_only' : seat.outcome,
            forwarded: false,
          },
          crewId: target.crewId,
        });
      }

      return {
        crew_id: target.crewId,
        trip_id: target.tripId,
        invite_id: claimsInvite ? target.inviteId : null,
        joined,
        seated: seat?.outcome === 'seated',
        waitlisted: seat?.outcome === 'waitlisted',
        waitlist_position: seat?.waitlistPosition ?? null,
        forwarded: target.forwarded,
      };
    },
  });
}

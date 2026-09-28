/**
 * `create_invite` (docs/api-contracts.md §4.2): a signed-in member invites someone into a crew,
 * optionally onto one of its trips. A contact invite reserves a named seat: its link carries a
 * seat token and its prefill (name, note: encrypted; phone: HMAC only; home hint and confirmed
 * tags) waits for the invitee. A link or code invite is generic. An in-app invite names someone
 * already sharing a crew with the inviter. On a full trip the inviter gets `SEAT_LIMIT` (the app
 * hands it to the seat-limit presenter) unless they chose the waitlist, and never an error toast.
 */
import { crypto as dbCrypto, appendDomainEvent } from '@cp/db';
import {
  buildLink,
  createInvitePayloadSchema,
  createSeatToken,
  DomainError,
  INVITE_TTL_DAYS,
  linkHostsFor,
  linkPath,
  LINK_CHANNELS,
  seatLimitOfferFor,
  type CreateInvitePayload,
  type CreateInviteResult,
  type InviteSeatLimitDetail,
  type LinkChannel,
  type LinkTarget,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { codeExpiry, liveJoinCode, mintJoinCode, requireActiveMember } from '../crews/shared';
import { seatTokenHash, type InviteCommandDeps } from './deps';

const { encryptField, hashWithPepper } = dbCrypto;

function isPersonal(payload: CreateInvitePayload): boolean {
  return payload.channel === 'contact';
}

async function authorizeTrip(tx: pg.PoolClient, crewId: string, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ status: string }>(
    'SELECT status FROM trips WHERE id = $1 AND crew_id = $2',
    [tripId, crewId],
  );
  const status = rows[0]?.status;
  if (status === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  if (['cancelled', 'archived', 'post_trip'].includes(status)) {
    throw new DomainError('STATE_INVALID', { reason: 'trip_closed', state: status });
  }
}

/** Seats taken plus named seats still reserved by open personal invites to the trip. */
async function seatPressure(tx: pg.PoolClient, tripId: string) {
  const { rows } = await tx.query<{
    held: number;
    reserved: number;
    cap: number;
    boost_active: boolean;
  }>(
    `SELECT app.trip_seats_held($1) AS held,
            (SELECT count(*)::int FROM invites
              WHERE trip_id = $1 AND kind = 'personal' AND status IN ('pending', 'later')
                AND expires_at > now()) AS reserved,
            coalesce((SELECT seat_cap FROM trip_entitlements WHERE trip_id = $1), 6) AS cap,
            coalesce((SELECT boost_active FROM trip_entitlements WHERE trip_id = $1), false)
              AS boost_active`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('seat pressure query returned no row');
  return row;
}

async function codeFor(
  tx: pg.PoolClient,
  payload: CreateInvitePayload,
  now: Date,
): Promise<{ id: string; code: string }> {
  const kind = payload.trip_id === undefined ? 'crew' : 'trip';
  const ref = payload.trip_id ?? payload.crew_id;
  const live = await liveJoinCode(tx, kind, ref, now);
  if (live !== null) return live;
  return mintJoinCode(tx, { kind, ref, expiresAt: codeExpiry(now), rotate: false });
}

function shareChannel(payload: CreateInvitePayload): LinkChannel | undefined {
  const via = payload.share_via;
  return via !== undefined && (LINK_CHANNELS as readonly string[]).includes(via)
    ? (via as LinkChannel)
    : undefined;
}

export function createCreateInviteCommand(deps: InviteCommandDeps) {
  return defineCommand({
    name: 'create_invite',
    v: 1,
    schema: createInvitePayloadSchema,
    offline: false,
    authorize: async (tx, payload, ctx) => {
      await requireActiveMember(tx, payload.crew_id, ctx.uid);
      if (payload.trip_id !== undefined) await authorizeTrip(tx, payload.crew_id, payload.trip_id);
      if (payload.invitee_uid !== undefined) {
        const { rows } = await tx.query<{ shares: boolean; member: boolean }>(
          `SELECT app.shares_crew($1, $2) AS shares,
                  EXISTS (SELECT 1 FROM crew_members WHERE crew_id = $3 AND user_id = $2
                            AND status = 'active') AS member`,
          [ctx.uid, payload.invitee_uid, payload.crew_id],
        );
        // Existing users are matched in crew context only: never an arbitrary account.
        if (rows[0]?.shares !== true) throw new DomainError('NOT_FOUND', { reason: 'invitee' });
        if (rows[0].member) throw new DomainError('STATE_INVALID', { reason: 'already_member' });
      }
      if (isPersonal(payload) && (deps.seatKeyring === null || deps.fieldKeyring === null)) {
        throw new DomainError('STATE_INVALID', { reason: 'personal_invites_unavailable' });
      }
    },
    entitle: async (tx, payload) => {
      if (payload.trip_id === undefined || payload.on_full === 'waitlist') return;
      const pressure = await seatPressure(tx, payload.trip_id);
      if (pressure.held + pressure.reserved < pressure.cap) return;
      const detail: InviteSeatLimitDetail = {
        cap: pressure.cap,
        offer: seatLimitOfferFor(pressure.boost_active),
        trip_id: payload.trip_id,
        invitee: payload.contact?.name ?? null,
        seats_taken: pressure.held,
      };
      throw new DomainError('SEAT_LIMIT', detail);
    },
    handle: async (tx, payload, ctx): Promise<CreateInviteResult> => {
      const now = ctx.clock.serverNow;
      const expiresAt = codeExpiry(now, payload.ttl_days ?? INVITE_TTL_DAYS);
      const code = await codeFor(tx, payload, now);
      const personal = isPersonal(payload);
      const seat =
        personal && deps.seatKeyring !== null
          ? await createSeatToken(code.code, deps.seatKeyring)
          : undefined;
      let waitlisted = false;
      if (payload.trip_id !== undefined && payload.on_full === 'waitlist') {
        const pressure = await seatPressure(tx, payload.trip_id);
        waitlisted = pressure.held + pressure.reserved >= pressure.cap;
      }

      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO invites (crew_id, trip_id, inviter_id, join_code_id, kind, seat_token_hash,
           invitee_user_id, channel, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          payload.crew_id,
          payload.trip_id ?? null,
          ctx.uid,
          code.id,
          personal ? 'personal' : 'generic',
          seat === undefined ? null : seatTokenHash(seat),
          payload.invitee_uid ?? null,
          payload.share_via ?? null,
          expiresAt,
        ],
      );
      const inviteId = rows[0]?.id;
      if (inviteId === undefined) throw new Error('invite insert returned no id');

      if (personal && payload.contact !== undefined && deps.fieldKeyring !== null) {
        const phone = payload.contact.phone_e164;
        await tx.query(
          `INSERT INTO invite_prefill (invite_id, inviter_id, name_enc, home_hint, tags,
             inviter_note_enc, phone_hash, provenance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            inviteId,
            ctx.uid,
            encryptField(payload.contact.name, deps.fieldKeyring),
            payload.contact.home_hint ?? null,
            payload.tags ?? [],
            payload.note === undefined || payload.note.length === 0
              ? null
              : encryptField(payload.note, deps.fieldKeyring),
            phone === undefined || deps.phonePepper === null
              ? null
              : hashWithPepper(phone, deps.phonePepper),
            payload.contact.provenance,
          ],
        );
      }

      await appendDomainEvent(tx, {
        type: 'invite.created',
        aggregateKind: 'invite',
        aggregateId: inviteId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          invite_id: inviteId,
          crew_id: payload.crew_id,
          trip_id: payload.trip_id ?? null,
          kind: personal ? 'personal' : 'generic',
          invitee_user_id: payload.invitee_uid ?? null,
        },
        crewId: payload.crew_id,
      });

      const target: LinkTarget =
        seat === undefined
          ? { kind: 'invite', code: code.code }
          : { kind: 'invite', code: code.code, seat };
      const channel = shareChannel(payload);
      const [host] = linkHostsFor(deps.linkEnv);
      return {
        invite_id: inviteId,
        code: code.code,
        link: linkPath(target),
        url: buildLink(target, channel === undefined ? { host } : { host, channel }),
        expires_at: expiresAt.toISOString(),
        waitlisted,
      };
    },
  });
}

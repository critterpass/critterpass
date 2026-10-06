/**
 * The crew's invite to its driver (6g-2, 6g-3).
 *
 * - `invite_driver {trip_id, provider_id}`: a single-use link bound to the driver's phone hash,
 *   working for 30 days. The token is returned once and only its hash is stored; inviting again
 *   while a link is live replaces it, so only the newest link works.
 * - `nudge_driver_invite {invite_id}`: once per invite (`NUDGE_TOO_SOON` after).
 * - `cancel_driver_invite {invite_id}`: the link stops working at once.
 */
import {
  DomainError,
  DRIVER_INVITE_TTL_DAYS,
  driverInviteRefPayloadSchema,
  inviteDriverPayloadSchema,
  type InviteDriverResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  claimUrl,
  driverPhone,
  hashToken,
  loadCrewDriver,
  newLinkToken,
  phoneHash,
  type DriverDirectoryDeps,
} from './shared';

const LIVE = ['sent', 'opened'];

export function createInviteDriverCommand(deps: DriverDirectoryDeps) {
  return defineCommand({
    name: 'invite_driver',
    v: 1,
    schema: inviteDriverPayloadSchema,
    offline: false,
    authorize: async (tx, payload) => {
      await loadCrewDriver(tx, payload.trip_id, payload.provider_id);
    },
    handle: async (tx, payload, ctx): Promise<InviteDriverResult> => {
      const driver = await loadCrewDriver(tx, payload.trip_id, payload.provider_id);
      const phone = driverPhone(deps, driver);
      const hash = phoneHash(deps, phone);
      const token = newLinkToken(driver.name);
      const expiresAt = new Date(
        ctx.clock.serverNow.getTime() + DRIVER_INVITE_TTL_DAYS * 86_400_000,
      );
      const id = await asSystemRole(tx, async () => {
        const listed = await tx.query(
          `SELECT 1 FROM driver_listings WHERE phone_hash = $1 AND status IN ('listed', 'paused')`,
          [hash],
        );
        if ((listed.rowCount ?? 0) > 0) {
          throw new DomainError('STATE_INVALID', { reason: 'already_listed' });
        }
        await tx.query(
          `UPDATE driver_invites SET status = 'cancelled'
            WHERE crew_id = $1 AND phone_hash = $2 AND status = ANY($3)`,
          [driver.crew_id, hash, LIVE],
        );
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO driver_invites
             (provider_id, trip_id, crew_id, inviter_id, token_hash, phone_hash, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [driver.id, driver.trip_id, driver.crew_id, ctx.uid, hashToken(token), hash, expiresAt],
        );
        return rows[0]?.id ?? '';
      });
      return {
        invite_id: id,
        url: claimUrl(deps.linkEnv, token),
        phone_e164: phone,
        expires_at: expiresAt.toISOString(),
      };
    },
  });
}

interface InviteRow {
  readonly id: string;
  readonly status: string;
  readonly nudged_at: Date | null;
  readonly expires_at: Date;
}

/** The invite as the member's crew sees it (RLS), or NOT_FOUND. */
async function visibleInvite(tx: pg.PoolClient, inviteId: string): Promise<InviteRow> {
  const { rows } = await tx.query<InviteRow>(
    'SELECT id, status, nudged_at, expires_at FROM driver_invites WHERE id = $1',
    [inviteId],
  );
  const invite = rows[0];
  if (invite === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver_invite' });
  return invite;
}

function assertLive(invite: InviteRow, now: Date): void {
  if (invite.status === 'cancelled') throw new DomainError('INVITE_REVOKED');
  if (!LIVE.includes(invite.status) || invite.expires_at <= now) {
    throw new DomainError('INVITE_EXPIRED');
  }
}

/** Returns the driver's number so the member's WhatsApp opens on him with the nudge. */
export function createNudgeDriverInviteCommand(deps: DriverDirectoryDeps) {
  return defineCommand({
    name: 'nudge_driver_invite',
    v: 1,
    schema: driverInviteRefPayloadSchema,
    offline: false,
    authorize: async (tx, payload) => {
      await visibleInvite(tx, payload.invite_id);
    },
    handle: async (tx, payload, ctx): Promise<{ nudged_at: string; phone_e164: string }> => {
      const invite = await visibleInvite(tx, payload.invite_id);
      assertLive(invite, ctx.clock.serverNow);
      if (invite.nudged_at !== null) {
        throw new DomainError('NUDGE_TOO_SOON', { reason: 'already_nudged' });
      }
      const now = ctx.clock.serverNow;
      await asSystemRole(tx, () =>
        tx.query('UPDATE driver_invites SET nudged_at = $2 WHERE id = $1 AND nudged_at IS NULL', [
          invite.id,
          now,
        ]),
      );
      const { rows } = await tx.query<{ provider_id: string; trip_id: string }>(
        'SELECT provider_id, trip_id FROM driver_invites WHERE id = $1',
        [invite.id],
      );
      const driver = await loadCrewDriver(tx, rows[0]?.trip_id ?? '', rows[0]?.provider_id ?? '');
      return { nudged_at: now.toISOString(), phone_e164: driverPhone(deps, driver) };
    },
  });
}

export const cancelDriverInviteCommand = defineCommand({
  name: 'cancel_driver_invite',
  v: 1,
  schema: driverInviteRefPayloadSchema,
  offline: true,
  authorize: async (tx, payload) => {
    await visibleInvite(tx, payload.invite_id);
  },
  handle: async (tx, payload): Promise<{ status: 'cancelled' }> => {
    const invite = await visibleInvite(tx, payload.invite_id);
    if (invite.status === 'claimed') {
      throw new DomainError('STATE_INVALID', { reason: 'already_claimed' });
    }
    await asSystemRole(tx, () =>
      tx.query(
        `UPDATE driver_invites SET status = 'cancelled' WHERE id = $1 AND status = ANY($2)`,
        [invite.id, LIVE],
      ),
    );
    return { status: 'cancelled' };
  },
});

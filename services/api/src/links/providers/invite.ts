/**
 * Invite links (`/i/{code}` and personal `/i/{code}/{seat}`). A bare code previews and resolves
 * through the join-code lookup. A personal link previews the same crew or trip and, only while its
 * named seat is still open, the invitee's first name (decrypted server-side from the prefill);
 * once claimed, or when the invite is gone, it reads like the generic crew link it now is. Human
 * opens of a personal link count toward the inviter's own open status, never the crew's.
 *
 * Also the phone matcher: a newly verified phone that matches a pending personal invite binds that
 * invite to the account, so it shows up in the app as an invite addressed to them.
 */
import { crypto as dbCrypto } from '@cp/db';
import {
  effectiveInviteStatus,
  isOpenInvite,
  previewShowsInviteeName,
  type InviteStatus,
  type LinkPreview,
} from '@cp/domain';

import { seatTokenHash } from '../../commands/invites/deps';
import type {
  LinkProvider,
  LinkProviderContext,
  PhoneInviteMatcher,
  ResolvedLink,
} from '../registry';
import { previewJoinCode, resolveJoinCode, tripSeats } from './join-code';

const { decryptField } = dbCrypto;

interface PersonalRow {
  readonly invite_id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly status: InviteStatus;
  readonly expires_at: Date;
  readonly claimed_by: string | null;
  readonly name_enc: string | null;
  readonly join_code_id: string | null;
}

async function personalInvite(ctx: LinkProviderContext): Promise<PersonalRow | null> {
  const { target } = ctx;
  if (target.kind !== 'invite' || target.seat === undefined) return null;
  const { rows } = await ctx.tx.query<PersonalRow>(
    `SELECT invite_id, crew_id, trip_id, status, expires_at, claimed_by, name_enc, join_code_id
       FROM app.invite_for_seat($1)`,
    [seatTokenHash(target.seat)],
  );
  return rows[0] ?? null;
}

function firstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0];
  return first !== undefined && first.length > 0 ? first : null;
}

export function createInviteLinkProvider(
  keyring: dbCrypto.FieldEncryptionKeyring | null,
): LinkProvider {
  const inviteeName = (row: PersonalRow, now: Date): string | null => {
    const status = effectiveInviteStatus(row.status, row.expires_at, now);
    if (!previewShowsInviteeName({ open: isOpenInvite(status), claimedBy: row.claimed_by })) {
      return null;
    }
    if (row.name_enc === null || keyring === null) return null;
    return firstName(decryptField(row.name_enc, keyring));
  };

  return {
    kinds: ['invite'],

    async preview(ctx): Promise<LinkPreview | null> {
      const generic = await previewJoinCode(ctx);
      const personal = await personalInvite(ctx);
      if (personal === null || generic === null) return generic;
      const status = effectiveInviteStatus(personal.status, personal.expires_at, ctx.now);
      const seats = personal.trip_id === null ? null : await tripSeats(ctx.tx, personal.trip_id);
      return {
        ...generic,
        ...(seats ?? {}),
        expires_at: personal.expires_at.toISOString(),
        // A revoked or expired named seat says so; a claimed one falls back to the crew link.
        state: status === 'revoked' ? 'revoked' : status === 'expired' ? 'expired' : generic.state,
        invitee_first_name: inviteeName(personal, ctx.now),
      };
    },

    async resolve(ctx): Promise<ResolvedLink | null> {
      const generic = await resolveJoinCode(ctx);
      const personal = await personalInvite(ctx);
      if (personal === null || generic === null) return generic;
      return { ...generic, inviteId: personal.invite_id };
    },

    async recordOpen(ctx): Promise<void> {
      const personal = await personalInvite(ctx);
      if (personal === null) return;
      await ctx.tx.query(
        `INSERT INTO invite_opens (id, inviter_id, open_count, first_opened_at, last_opened_at)
         SELECT i.id, i.inviter_id, 1, $2, $2 FROM invites i WHERE i.id = $1
         ON CONFLICT (id) DO UPDATE SET open_count = invite_opens.open_count + 1,
           last_opened_at = EXCLUDED.last_opened_at`,
        [personal.invite_id, ctx.now],
      );
    },
  };
}

/** Binds a pending personal invite addressed to this verified phone to the account. */
export const phoneInviteMatcher: PhoneInviteMatcher = async (tx, { uid, phoneHash }) => {
  const { rows } = await tx.query<{ invite_id: string; crew_id: string; code: string }>(
    `UPDATE invites i SET invitee_user_id = $1
       FROM invite_prefill p, join_codes jc
      WHERE p.invite_id = i.id AND jc.id = i.join_code_id AND p.phone_hash = $2
        AND i.status IN ('pending', 'later') AND i.expires_at > now()
        AND (i.invitee_user_id IS NULL OR i.invitee_user_id = $1)
        AND i.id = (SELECT i2.id FROM invites i2 JOIN invite_prefill p2 ON p2.invite_id = i2.id
                     WHERE p2.phone_hash = $2 AND i2.status IN ('pending', 'later')
                       AND i2.expires_at > now()
                     ORDER BY i2.created_at DESC LIMIT 1)
      RETURNING i.id AS invite_id, i.crew_id, jc.code`,
    [uid, phoneHash],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    target: { kind: 'invite', code: row.code },
    resolved: {
      kind: 'invite',
      state: 'active',
      crewId: row.crew_id,
      joinCodeId: null,
      joinCode: row.code,
      inviteId: row.invite_id,
    },
  };
};

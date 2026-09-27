/**
 * Invite and referral codes (`/i/{code}`, `/j/{code}`, `/r/{code}`, typed codes): one provider over
 * `join_codes`. The code's own `target_kind` decides the effective kind, so an `/i/` link carrying
 * a referral code still resolves as a referral. Previews describe the crew the way a stranger
 * holding the link may see it: its name, how many are in, the inviter's first name and the place.
 */
import type { LinkKind, LinkPreview, LinkState } from '@cp/domain';
import type pg from 'pg';

import type { LinkProvider, LinkProviderContext, ResolvedLink } from './registry';

interface JoinCodeRow {
  readonly id: string;
  readonly code: string;
  readonly target_kind: 'crew' | 'trip' | 'referral';
  readonly crew_id: string | null;
  readonly expires_at: Date | null;
  readonly max_uses: number | null;
  readonly uses: number;
  readonly status: 'active' | 'revoked' | 'expired' | 'exhausted';
  readonly crew_name: string | null;
  readonly members_count: number | null;
  readonly inviter_name: string | null;
  readonly trip_place: string | null;
}

/** The live code with that value, else the most recently retired one (a value can be reused). */
async function findCode(tx: pg.PoolClient, code: string): Promise<JoinCodeRow | null> {
  const { rows } = await tx.query<JoinCodeRow>(
    `SELECT jc.id, jc.code, jc.target_kind, jc.crew_id, jc.expires_at, jc.max_uses, jc.uses,
            jc.status, c.name AS crew_name, u.display_name AS inviter_name, d.name AS trip_place,
            CASE WHEN jc.crew_id IS NULL THEN NULL ELSE (
              SELECT count(*)::int FROM crew_members cm
               WHERE cm.crew_id = jc.crew_id AND cm.status = 'active'
            ) END AS members_count
       FROM join_codes jc
       LEFT JOIN crews c ON c.id = jc.crew_id
       LEFT JOIN users u ON u.id = jc.created_by
       LEFT JOIN trips t ON jc.target_kind = 'trip' AND t.id = jc.target_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE jc.code = $1
      ORDER BY (jc.status = 'active') DESC, jc.created_at DESC
      LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

export function joinCodeState(row: JoinCodeRow, now: Date): LinkState {
  if (row.status === 'revoked') return 'revoked';
  if (row.status === 'expired' || (row.expires_at !== null && row.expires_at <= now)) {
    return 'expired';
  }
  if (row.status === 'exhausted' || (row.max_uses !== null && row.uses >= row.max_uses)) {
    return 'full';
  }
  return 'active';
}

function effectiveKind(row: JoinCodeRow): LinkKind {
  return row.target_kind === 'referral' ? 'referral' : 'invite';
}

function firstName(displayName: string | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first !== undefined && first.length > 0 ? first : null;
}

function codeOf(ctx: LinkProviderContext): string | null {
  const { target } = ctx;
  return target.kind === 'invite' || target.kind === 'referral' ? target.code : null;
}

export const joinCodeProvider: LinkProvider = {
  kinds: ['invite', 'referral'],

  async preview(ctx): Promise<LinkPreview | null> {
    const code = codeOf(ctx);
    const row = code === null ? null : await findCode(ctx.tx, code);
    if (row === null) return null;
    return {
      kind: effectiveKind(row),
      crew_name: row.crew_name,
      inviter_first_name: firstName(row.inviter_name),
      trip_place: row.trip_place,
      members_count: row.members_count,
      expires_at: row.expires_at?.toISOString() ?? null,
      state: joinCodeState(row, ctx.now),
    };
  },

  async resolve(ctx): Promise<ResolvedLink | null> {
    const code = codeOf(ctx);
    const row = code === null ? null : await findCode(ctx.tx, code);
    if (row === null) return null;
    return {
      kind: effectiveKind(row),
      state: joinCodeState(row, ctx.now),
      crewId: row.crew_id,
      joinCodeId: row.id,
      joinCode: row.code,
      inviteId: null,
    };
  },
};

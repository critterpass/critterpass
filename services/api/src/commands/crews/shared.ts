/**
 * Helpers the crew and invite handlers share: membership checks that never reveal a crew to an
 * outsider, the active-crew ceiling from config, and join-code minting through
 * `app.issue_join_code` with a redraw on the (rare) collision with a live code.
 */
import {
  DomainError,
  generateJoinCode,
  INVITE_TTL_DAYS,
  MAX_ACTIVE_CREWS_PER_USER,
  nextMemberColour,
} from '@cp/domain';
import type pg from 'pg';

const PG_UNIQUE_VIOLATION = '23505';
const MINT_ATTEMPTS = 5;
const DAY_MS = 86_400_000;

export interface MemberRow {
  readonly role: 'organiser' | 'member';
  readonly status: string;
}

/** The caller's active membership, or `NOT_FOUND` (a crew you are not in does not exist to you). */
export async function requireActiveMember(
  tx: pg.PoolClient,
  crewId: string,
  uid: string,
): Promise<MemberRow> {
  const { rows } = await tx.query<MemberRow>(
    `SELECT role, status FROM crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
    [crewId, uid],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'crew' });
  return row;
}

export async function activeCrewCount(tx: pg.PoolClient, uid: string): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM crew_members WHERE user_id = $1 AND status = 'active'`,
    [uid],
  );
  return rows[0]?.n ?? 0;
}

/** `crews.max_active` from the public config, else the default of 10. */
export async function maxActiveCrews(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ value: unknown }>(
    "SELECT value FROM client_config WHERE key = 'crews.max_active'",
  );
  const value = rows[0]?.value;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : MAX_ACTIVE_CREWS_PER_USER;
}

/** The colour the next joiner gets: the lowest slot no active member holds. */
export async function nextColourFor(tx: pg.PoolClient, crewId: string): Promise<string> {
  const { rows } = await tx.query<{ colour: string | null }>(
    `SELECT colour FROM crew_members WHERE crew_id = $1 AND status = 'active'`,
    [crewId],
  );
  return nextMemberColour(rows.map((row) => row.colour));
}

export function codeExpiry(now: Date, days = INVITE_TTL_DAYS): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

export interface MintJoinCodeInput {
  readonly kind: 'crew' | 'trip' | 'referral';
  readonly ref: string;
  readonly expiresAt: Date | null;
  readonly maxUses?: number | null;
  /** Retire the live codes of the same crew, trip or referrer first. */
  readonly rotate: boolean;
}

export interface MintedJoinCode {
  readonly id: string;
  readonly code: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === PG_UNIQUE_VIOLATION;
}

export async function mintJoinCode(
  tx: pg.PoolClient,
  input: MintJoinCodeInput,
): Promise<MintedJoinCode> {
  for (let attempt = 1; ; attempt += 1) {
    const code = generateJoinCode();
    await tx.query('SAVEPOINT mint_join_code');
    try {
      const { rows } = await tx.query<{ id: string }>(
        'SELECT app.issue_join_code($1, $2, $3, $4, $5, $6) AS id',
        [code, input.kind, input.ref, input.expiresAt, input.maxUses ?? null, input.rotate],
      );
      await tx.query('RELEASE SAVEPOINT mint_join_code');
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('app.issue_join_code returned no id');
      return { id, code };
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT mint_join_code');
      if (!isUniqueViolation(error) || attempt >= MINT_ATTEMPTS) throw error;
    }
  }
}

/** The live code of a crew or trip, if one exists. */
export async function liveJoinCode(
  tx: pg.PoolClient,
  kind: 'crew' | 'trip',
  ref: string,
  now: Date,
): Promise<(MintedJoinCode & { readonly expiresAt: Date | null }) | null> {
  const { rows } = await tx.query<{ id: string; code: string; expires_at: Date | null }>(
    `SELECT id, code, expires_at FROM join_codes
      WHERE target_kind = $1 AND target_id = $2 AND status = 'active'
        AND (expires_at IS NULL OR expires_at > $3)
        AND (max_uses IS NULL OR uses < max_uses)
      ORDER BY created_at DESC LIMIT 1`,
    [kind, ref, now],
  );
  const row = rows[0];
  return row === undefined ? null : { id: row.id, code: row.code, expiresAt: row.expires_at };
}

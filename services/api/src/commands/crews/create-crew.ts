/**
 * `create_crew` (docs/api-contracts.md §4.2): starts a crew with the caller as its organiser,
 * mints its join code (14 days) and makes it the caller's active crew. A person belongs to at most
 * `crews.max_active` crews (10 by default); starting another answers `STATE_INVALID` with
 * `crew_limit`, never a paywall. The crew settles in its creator's home currency (its only member's,
 * so its most common) until the organiser picks another.
 */
import { appendDomainEvent } from '@cp/db';
import {
  canStartCrew,
  createCrewPayloadSchema,
  DomainError,
  encodeMemberColour,
  memberColourForSlot,
  type CreateCrewResult,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { activeCrewCount, codeExpiry, maxActiveCrews, mintJoinCode } from './shared';

const PG_UNIQUE_VIOLATION = '23505';

export interface StartCrewInput {
  readonly crewId: string;
  readonly name: string;
  readonly art: string | null;
  readonly uid: string;
  readonly now: Date;
}

/**
 * Starts a crew with `uid` as its organiser: the crew row, the membership, a join code, the
 * caller's active crew and `crew.created`. Runs as the caller (RLS) inside their transaction; every
 * path that makes a crew goes through here.
 */
export async function startCrew(
  tx: pg.PoolClient,
  input: StartCrewInput,
): Promise<CreateCrewResult> {
  // A plain insert: ON CONFLICT would need the (not yet visible) crew to pass its read policy.
  await tx.query('SAVEPOINT create_crew');
  try {
    await tx.query(
      `INSERT INTO crews (id, name, art, created_by, settlement_currency)
       VALUES ($1, $2, $3, $4, (SELECT upper(home_currency) FROM users WHERE id = $4))`,
      [input.crewId, input.name, input.art, input.uid],
    );
    await tx.query('RELEASE SAVEPOINT create_crew');
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT create_crew');
    // Someone else's crew already holds this id (hidden by RLS): never touch it.
    if ((error as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
      throw new DomainError('VALIDATION', { reason: 'crew_id_taken' });
    }
    throw error;
  }

  await tx.query(
    `INSERT INTO crew_members (crew_id, user_id, role, colour) VALUES ($1, $2, 'organiser', $3)`,
    [input.crewId, input.uid, encodeMemberColour(memberColourForSlot(0))],
  );
  const expiresAt = codeExpiry(input.now);
  const code = await mintJoinCode(tx, {
    kind: 'crew',
    ref: input.crewId,
    expiresAt,
    rotate: false,
  });
  await tx.query(
    `INSERT INTO user_settings (user_id, active_crew_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET active_crew_id = EXCLUDED.active_crew_id`,
    [input.uid, input.crewId],
  );
  await appendDomainEvent(tx, {
    type: 'crew.created',
    aggregateKind: 'crew',
    aggregateId: input.crewId,
    actorKind: 'user',
    actorId: input.uid,
    payload: { crew_id: input.crewId },
    crewId: input.crewId,
  });
  return {
    crew_id: input.crewId,
    code: code.code,
    code_expires_at: expiresAt.toISOString(),
  };
}

export const createCrewCommand = defineCommand({
  name: 'create_crew',
  v: 1,
  schema: createCrewPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, _payload, ctx) => {
    const limit = await maxActiveCrews(tx);
    if (!canStartCrew(await activeCrewCount(tx, ctx.uid), limit)) {
      throw new DomainError('STATE_INVALID', { reason: 'crew_limit', limit });
    }
  },
  handle: async (tx, payload, ctx): Promise<CreateCrewResult> => {
    return startCrew(tx, {
      crewId: payload.crew_id,
      name: payload.name,
      art: payload.art ?? null,
      uid: ctx.uid,
      now: ctx.clock.serverNow,
    });
  },
});

/**
 * The commands the end-to-end sync harness drives through the real command doors. Crew features
 * register their own commands in later work; these write the same tables (crews, crew_members)
 * under the same RLS, triggers and outbox, so sync streams, the subscribe proxy and the relay see
 * exactly what production writes produce. `e2e_flaky_step` stands in for a transient database
 * failure: its first attempt per key throws a non-domain error, which the doors treat as retryable.
 */
import { createHash } from 'node:crypto';

import { outbox } from '@cp/db';
import { crewChannel, DomainError } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineCommand } from '../../../services/api/src/commands/_framework/define-command';
import type { CommandRegistry } from '../../../services/api/src/commands/_framework/registry';

async function holds(tx: pg.PoolClient, check: string, crewId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(`SELECT ${check}($1) AS ok`, [crewId]);
  return rows[0]?.ok === true;
}

const crewId = z.object({ crew_id: z.uuid() });

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * The crew's join code in this harness, derived from its id so a joining client needs no extra
 * round trip: the database only lets someone into a crew who presents a live code or invite.
 */
function joinCodeOf(crew: string): string {
  const digest = createHash('sha256').update(crew).digest();
  return Array.from(digest.subarray(0, 6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Creates a crew with the caller as organiser; one `crew.created` hint per execution. */
export const createCrew = defineCommand({
  name: 'e2e_create_crew',
  v: 1,
  schema: crewId.extend({ name: z.string().min(1).max(80) }),
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx) => {
    await tx.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
      payload.crew_id,
      payload.name,
      ctx.uid,
    ]);
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')`,
      [payload.crew_id, ctx.uid],
    );
    await tx.query(
      `SELECT app.issue_join_code($1, 'crew', $2, now() + interval '1 day', NULL, false)`,
      [joinCodeOf(payload.crew_id), payload.crew_id],
    );
    await outbox(tx, crewChannel(payload.crew_id), 'crew.created', { crew_id: payload.crew_id });
    return { crew_id: payload.crew_id };
  },
});

export const joinCrew = defineCommand({
  name: 'e2e_join_crew',
  v: 1,
  schema: crewId,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload) => {
    await tx.query('SELECT app.join_crew($1, $2, NULL, NULL)', [
      payload.crew_id,
      joinCodeOf(payload.crew_id),
    ]);
    return null;
  },
});

/** Any member may rename; everyone else is rejected, which the upload door reports per op. */
export const renameCrew = defineCommand({
  name: 'e2e_rename_crew',
  v: 1,
  schema: crewId.extend({ name: z.string().min(1).max(80) }),
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    if (!(await holds(tx, 'app.is_crew_member', payload.crew_id))) {
      throw new DomainError('FORBIDDEN', { crew_id: payload.crew_id });
    }
  },
  handle: async (tx, payload) => {
    await tx.query('UPDATE crews SET name = $2 WHERE id = $1', [payload.crew_id, payload.name]);
    await outbox(tx, crewChannel(payload.crew_id), 'crew.renamed', {
      crew_id: payload.crew_id,
      name: payload.name,
    });
    return null;
  },
});

/** Organiser removes a member; the membership trigger queues the realtime unsubscribe. */
export const removeMember = defineCommand({
  name: 'e2e_remove_member',
  v: 1,
  schema: crewId.extend({ user_id: z.uuid() }),
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    if (!(await holds(tx, 'app.is_crew_organiser', payload.crew_id))) {
      throw new DomainError('FORBIDDEN', { crew_id: payload.crew_id });
    }
  },
  handle: async (tx, payload) => {
    const { rowCount } = await tx.query(
      `UPDATE crew_members SET status = 'removed', left_at = now()
        WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
      [payload.crew_id, payload.user_id],
    );
    if (rowCount !== 1) throw new DomainError('NOT_FOUND', { user_id: payload.user_id });
    return null;
  },
});

/** Keys whose first attempt already failed; the retry with the same key goes through. */
const failedOnce = new Set<string>();

export const flakyStep = defineCommand({
  name: 'e2e_flaky_step',
  v: 1,
  schema: z.object({ key: z.string().min(1) }),
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: (_tx, payload) => {
    if (!failedOnce.has(payload.key)) {
      failedOnce.add(payload.key);
      return Promise.reject(new Error('connection terminated unexpectedly'));
    }
    return Promise.resolve({ key: payload.key });
  },
});

export function registerE2eCommands(registry: CommandRegistry): void {
  registry.register(createCrew);
  registry.register(joinCrew);
  registry.register(renameCrew);
  registry.register(removeMember);
  registry.register(flakyStep);
}

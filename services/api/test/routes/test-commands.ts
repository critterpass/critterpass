/**
 * Commands registered only by the command-door suites: real writes (a crew row plus a realtime
 * hint), a business reject, a registered-only command and one that fails transiently once per key.
 */
import { outbox } from '@cp/db';
import { DomainError, userChannel } from '@cp/domain';
import { z } from 'zod';

import { defineCommand } from '../../src/commands/_framework/define-command';
import type { CommandRegistry } from '../../src/commands/_framework/registry';

const crewPayload = z.object({ crew_id: z.uuid(), name: z.string().min(1) });

const createCrew = (name: string, options: { offline: boolean; allowAnonymous: boolean }) =>
  defineCommand({
    name,
    v: 1,
    schema: crewPayload,
    ...options,
    authorize: () => Promise.resolve(),
    handle: async (tx, payload, ctx) => {
      await tx.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
        payload.crew_id,
        payload.name,
        ctx.uid,
      ]);
      await outbox(tx, userChannel(ctx.uid), 'test.crew_created', { crew_id: payload.crew_id });
      return { crew_id: payload.crew_id };
    },
  });

/** Keys whose first attempt already failed; the next attempt with the same key succeeds. */
const failedOnce = new Set<string>();

export function registerTestCommands(registry: CommandRegistry): void {
  registry.register(createCrew('create_test_crew', { offline: true, allowAnonymous: true }));
  registry.register(
    createCrew('create_registered_crew', { offline: false, allowAnonymous: false }),
  );
  registry.register(
    defineCommand({
      name: 'reject_test_op',
      v: 1,
      schema: z.object({}),
      offline: true,
      allowAnonymous: true,
      authorize: () => Promise.resolve(),
      handle: () => Promise.reject(new DomainError('STATE_INVALID', { state: 'closed' })),
    }),
  );
  registry.register(
    defineCommand({
      name: 'flaky_test_op',
      v: 1,
      schema: z.object({ key: z.string() }),
      offline: true,
      allowAnonymous: true,
      authorize: () => Promise.resolve(),
      handle: (_tx, payload) => {
        if (!failedOnce.has(payload.key)) {
          failedOnce.add(payload.key);
          return Promise.reject(new Error('database connection lost'));
        }
        return Promise.resolve({ key: payload.key });
      },
    }),
  );
  registry.register(
    defineCommand({
      name: 'broken_test_op',
      v: 1,
      schema: z.object({ sqlstate: z.enum(['check_violation', 'division_by_zero']) }),
      offline: true,
      allowAnonymous: true,
      authorize: () => Promise.resolve(),
      // A real Postgres error with that SQLSTATE (23514 or 22012), as a broken update raises.
      handle: async (tx, payload) => {
        await tx.query(
          `DO $$ BEGIN RAISE EXCEPTION 'broken' USING ERRCODE = '${payload.sqlstate}'; END $$`,
        );
        return null;
      },
    }),
  );
  registry.register(
    defineCommand({
      name: 'internal_test_op',
      v: 1,
      schema: z.object({}),
      offline: true,
      allowAnonymous: true,
      internal: true,
      authorize: () => Promise.resolve(),
      handle: () => Promise.resolve(null),
    }),
  );
}

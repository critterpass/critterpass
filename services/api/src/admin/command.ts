/**
 * `runAdminCommand`: the standard command pipeline (`executeCommand`: idempotent op_id, zod payload,
 * `cmd_log`/`cmd_results`) run as `app_system` with the console's own additions — the role policy
 * from `@cp/domain` before any write, `app.admin_uid` on the transaction, `actor.via = 'admin'`,
 * and one `ops.admin_audit` row written inside the same transaction as the command's writes. A
 * rejected or failed command rolls its writes and its audit row back together.
 */
import { executeCommand, type DbCommandDefinition } from '@cp/db';
import {
  adminCommandEnvelopeSchema,
  canRunAdminCommand,
  DomainError,
  type CommandOutcome,
} from '@cp/domain';
import type pg from 'pg';

import { writeAdminAudit } from './audit';
import type { AdminIdentity, AdminRegistry, AnyAdminCommand } from './registry';

export interface RunAdminCommandDeps {
  readonly pool: pg.Pool;
  readonly registry: AdminRegistry;
  readonly admin: AdminIdentity;
  readonly now?: () => Date;
}

const noEntitlement = (): Promise<void> => Promise.resolve();

function toPipelineDefinition(
  definition: AnyAdminCommand,
  admin: AdminIdentity,
): DbCommandDefinition<unknown, unknown> {
  return {
    name: definition.name,
    v: 1,
    schema: definition.schema,
    offline: false,
    allowAnonymous: false,
    internal: false,
    actionScope: undefined,
    authorize: async (tx) => {
      const decision = canRunAdminCommand(admin.roles, definition.name);
      if (!decision.ok) throw new DomainError(decision.deny, { reason: 'role' });
      await tx.query("SELECT set_config('app.admin_uid', $1, true)", [admin.uid]);
    },
    entitle: noEntitlement,
    handle: async (tx, payload, ctx) => {
      const result = await definition.handle(tx, payload, { ...ctx, via: 'admin', admin });
      const subject = definition.audit === 'self' ? 'self' : definition.audit(payload, result);
      if (subject !== 'self') {
        await writeAdminAudit(tx, {
          adminId: admin.uid,
          action: definition.name,
          targetKind: subject.targetKind,
          targetId: subject.targetId ?? null,
          reason: subject.reason ?? null,
          opId: ctx.opId,
          detail: subject.detail ?? null,
          ipHash: admin.ipHash,
        });
      }
      return result;
    },
  };
}

/** Runs one console command envelope; the caller maps a `rejected` outcome to its error status. */
export async function runAdminCommand(
  raw: unknown,
  deps: RunAdminCommandDeps,
): Promise<CommandOutcome> {
  const envelope = adminCommandEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new DomainError('VALIDATION', {
      issues: envelope.error.issues.map((issue) => ({
        path: issue.path.map(String),
        code: issue.code,
        message: issue.message,
      })),
    });
  }
  // The role policy goes first, so a role outside it gets FORBIDDEN for any command name, whether
  // or not the api serves that command; the pipeline's `authorize` checks it again in the tx.
  const decision = canRunAdminCommand(deps.admin.roles, envelope.data.cmd);
  if (!decision.ok) throw new DomainError(decision.deny, { reason: 'role' });
  return executeCommand(envelope.data, {
    pool: deps.pool,
    resolve: (name) => {
      const definition = deps.registry.command(name);
      return definition === undefined ? undefined : toPipelineDefinition(definition, deps.admin);
    },
    actor: { kind: 'system', uid: deps.admin.uid },
    door: 'system',
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  });
}

/**
 * Runs `fn` as app_system inside a user command's own transaction, then restores the caller's role.
 * For the console-facing steps a user command performs (filing a report, recording an approval
 * against an ops task): tables app_user has no grant on. A failure aborts the whole transaction,
 * which also reverts the role switch.
 */
export async function asSystemRole<T>(tx: pg.PoolClient, fn: () => Promise<T>): Promise<T> {
  const { rows } = await tx.query<{ role: string }>('SELECT current_user::text AS role');
  const role = rows[0]?.role;
  if (role === undefined) throw new Error('could not read current_user');
  await tx.query('SET LOCAL ROLE app_system');
  const result = await fn();
  await tx.query("SELECT set_config('role', $1, true)", [role]);
  return result;
}

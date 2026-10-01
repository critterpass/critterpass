/**
 * `ACCOUNT_CLOSED` for a closed account's sessions (docs/api-contracts.md §3): every command door
 * resolves handlers through the registry, so wrapping `resolve` guards `/v1/cmd`, `/sync/upload`
 * and `/v1/actions` alike. The check runs inside the command's own transaction, before its
 * `authorize`. A closed account may only restore itself; a purged one has no account left.
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../commands/_framework/registry';

/** What a closed account may still run. */
export const CLOSED_ACCOUNT_COMMANDS: ReadonlySet<string> = new Set(['restore_account']);

async function rejectClosed(tx: pg.PoolClient, uid: string): Promise<void> {
  const { rows } = await tx.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
    uid,
  ]);
  const status = rows[0]?.status;
  if (status === 'closed') throw new DomainError('ACCOUNT_CLOSED');
  if (status === 'purged') throw new DomainError('AUTH_REQUIRED', { reason: 'account_purged' });
}

export function guardClosedAccounts(registry: CommandRegistry): CommandRegistry {
  return {
    register: (definition) => registry.register(definition),
    names: () => registry.names(),
    resolve: (name) => {
      const definition = registry.resolve(name);
      if (definition === undefined || CLOSED_ACCOUNT_COMMANDS.has(name)) return definition;
      return {
        ...definition,
        authorize: async (tx, payload, ctx) => {
          await rejectClosed(tx, ctx.uid);
          await definition.authorize(tx, payload, ctx);
        },
      };
    },
  };
}

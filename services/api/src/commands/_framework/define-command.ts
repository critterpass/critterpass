/**
 * `defineCommand`: the one way a handler module declares itself
 * (`services/api/src/commands/<domain>/<verb_noun>.ts`, docs/api-contracts.md §2.2). Fills the
 * defaults so every door reads the same fully-specified definition.
 */
import type { DbCommandDefinition } from '@cp/db';
import type { CommandContext, CommandName } from '@cp/domain';
import type pg from 'pg';
import type { z } from 'zod';

type Hook<Payload, Result> = (
  tx: pg.PoolClient,
  payload: Payload,
  ctx: CommandContext,
) => Promise<Result>;

export interface DefineCommandInput<Schema extends z.ZodType, Result> {
  readonly name: CommandName;
  readonly v: 1;
  readonly schema: Schema;
  /** Accepted through `/sync/upload` (the offline queue) as well as `/v1/cmd`. */
  readonly offline: boolean;
  /** Default false: anonymous sessions get `AUTH_REQUIRED`. */
  readonly allowAnonymous?: boolean;
  /** Default false. True = reachable only through the server's own system door. */
  readonly internal?: boolean;
  readonly actionScope?: string;
  readonly authorize: Hook<z.infer<Schema>, void>;
  /** Default: no entitlement requirement. Call `entitle()` from `../../entitlements` here. */
  readonly entitle?: Hook<z.infer<Schema>, void>;
  readonly handle: Hook<z.infer<Schema>, Result>;
}

const noEntitlement = (): Promise<void> => Promise.resolve();

export function defineCommand<Schema extends z.ZodType, Result>(
  input: DefineCommandInput<Schema, Result>,
): DbCommandDefinition<z.infer<Schema>, Result> {
  return {
    name: input.name,
    v: input.v,
    schema: input.schema as z.ZodType<z.infer<Schema>>,
    offline: input.offline,
    allowAnonymous: input.allowAnonymous ?? false,
    internal: input.internal ?? false,
    actionScope: input.actionScope,
    authorize: input.authorize,
    entitle: input.entitle ?? noEntitlement,
    handle: input.handle,
  };
}

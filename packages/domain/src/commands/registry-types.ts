/**
 * The shape every command handler module has (docs/api-contracts.md §2.2, §2.3) and the outcome
 * every door gets back from the one execution pipeline. Generic over the transaction handle so
 * this package stays free of any database driver: `@cp/db` instantiates `Tx` with its pg client.
 */
import type { z } from 'zod';

import type { ErrorCode } from '../errors';
import type { ActorVia, CommandDevice, CommandName } from './envelope';

/** A client clock more than this far ahead of the server is recorded but never trusted. */
export const MAX_TRUSTED_CLIENT_SKEW_MS = 5 * 60 * 1000;

export interface CommandClock {
  /** Server time when the pipeline started this op. */
  readonly serverNow: Date;
  /** `client_ts` when trusted, otherwise `serverNow`; the only client time a handler may persist. */
  readonly effectiveClientTs: Date;
  /** `client_ts − serverNow` in ms: positive when the device clock runs ahead. */
  readonly skewMs: number;
  /** False when the device clock is more than `MAX_TRUSTED_CLIENT_SKEW_MS` in the future. */
  readonly clientTsTrusted: boolean;
}

/** Derives the clock a handler sees from the envelope's `client_ts`. */
export function commandClock(clientTs: string, serverNow: Date): CommandClock {
  const client = new Date(clientTs);
  const skewMs = client.getTime() - serverNow.getTime();
  const clientTsTrusted = skewMs <= MAX_TRUSTED_CLIENT_SKEW_MS;
  return {
    serverNow,
    effectiveClientTs: clientTsTrusted ? client : serverNow,
    skewMs,
    clientTsTrusted,
  };
}

export interface CommandContext {
  readonly opId: string;
  readonly cmd: CommandName;
  /** Always the authenticated uid; the envelope's own `actor.uid` is overwritten before this exists. */
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly via: ActorVia;
  readonly device: CommandDevice;
  readonly baseVersion: number | undefined;
  readonly clock: CommandClock;
}

/**
 * One command's handler module (`services/api/src/commands/<domain>/<verb_noun>.ts`). Each hook
 * runs inside the same `withUser` transaction, in this order: `authorize` → `entitle` → `handle`.
 * Throwing a non-retryable `DomainError` from any of them rejects the op: everything the hooks
 * wrote is rolled back and only the `cmd_results` row survives.
 */
export interface CommandDefinition<Tx, Payload, Result> {
  readonly name: CommandName;
  readonly v: 1;
  readonly schema: z.ZodType<Payload>;
  /** Accepted through the offline door (`/sync/upload`) as well as `/v1/cmd`. */
  readonly offline: boolean;
  /** Anonymous sessions may run it; otherwise they get `AUTH_REQUIRED`. */
  readonly allowAnonymous: boolean;
  /** Runs only through the server's own system door, never from a client request. */
  readonly internal: boolean;
  /** Device action-key scope that may run it through `/v1/actions`; absent = not an action. */
  readonly actionScope: string | undefined;
  readonly authorize: (tx: Tx, payload: Payload, ctx: CommandContext) => Promise<void>;
  readonly entitle: (tx: Tx, payload: Payload, ctx: CommandContext) => Promise<void>;
  readonly handle: (tx: Tx, payload: Payload, ctx: CommandContext) => Promise<Result>;
}

/** Looks a command up by name for a door; `undefined` when no such command is registered. */
export type CommandResolver<Tx> = (
  name: string,
) => CommandDefinition<Tx, unknown, unknown> | undefined;

export type CommandOutcome =
  | { readonly status: 'applied'; readonly opId: string; readonly result: unknown }
  | {
      readonly status: 'rejected';
      readonly opId: string;
      readonly code: ErrorCode;
      readonly detail?: unknown;
    }
  | {
      readonly status: 'duplicate';
      readonly opId: string;
      /** The first execution's own outcome, replayed as stored. */
      readonly original: 'applied' | 'rejected';
      readonly result: unknown;
      readonly code?: ErrorCode;
      readonly detail?: unknown;
    };

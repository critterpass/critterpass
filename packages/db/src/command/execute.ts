/**
 * `executeCommand`: the one execution pipeline every door runs (docs/api-contracts.md §2.3):
 * parse → overwrite `actor.uid` → `withUser` → `claimOpId` → authorize → entitle → handle →
 * `recordCmdResult` → commit.
 *
 * Outcome rules:
 * - A non-retryable `DomainError` (or zod/RLS failure mapped to one) from authorize/entitle/handle
 *   rejects the op: a savepoint rolls back every write the hooks made (aggregates, outbox rows,
 *   events, quota reservations) and only the `rejected` `cmd_results` row commits.
 * - Anything else (retryable codes, connection loss, unexpected bugs) rolls the whole transaction
 *   back, `cmd_log` claim included, and is rethrown: the op stays retryable under the same op_id.
 */
import {
  commandClock,
  commandEnvelopeSchema,
  DomainError,
  isUuidV7,
  type CommandContext,
  type CommandDefinition,
  type CommandOutcome,
  type CommandResolver,
  type ErrorCode,
} from '@cp/domain';
import type pg from 'pg';
import { z, ZodError } from 'zod';

import { claimOpId, recordCmdResult } from '../events';
import { withSystem, withUser } from '../tx';
import { commandPayloadHash } from './hash';

export type DbCommandDefinition<Payload, Result> = CommandDefinition<
  pg.PoolClient,
  Payload,
  Result
>;
export type DbCommandResolver = CommandResolver<pg.PoolClient>;

/** Which door an op entered by; decides which commands it may reach. */
export type CommandDoor = 'cmd' | 'sync' | 'system';

export type CommandActorContext =
  | { readonly kind: 'user'; readonly uid: string; readonly isAnonymous: boolean }
  /** The server acting on a user's behalf (internal commands, jobs): runs as `app_system`. */
  | { readonly kind: 'system'; readonly uid: string };

export interface ExecuteCommandContext {
  readonly pool: pg.Pool;
  readonly resolve: DbCommandResolver;
  readonly actor: CommandActorContext;
  readonly door: CommandDoor;
  readonly now?: () => Date;
}

const envelopeSchema = commandEnvelopeSchema(z.unknown());
type ParsedEnvelope = z.infer<typeof envelopeSchema>;

const PG_INSUFFICIENT_PRIVILEGE = '42501';

interface StoredResult {
  readonly status: 'applied' | 'rejected' | 'duplicate';
  readonly code: ErrorCode | null;
  readonly detail: unknown;
  readonly result_ref: unknown;
}

function validationDetail(error: ZodError): { issues: unknown[] } {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String),
      code: issue.code,
      message: issue.message,
    })),
  };
}

function isPgError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string';
}

/**
 * Maps a hook failure to the rejection it stands for, or `undefined` when it is not a business
 * reject (the caller then rethrows and the op stays retryable).
 */
function asRejection(error: unknown): DomainError | undefined {
  if (error instanceof DomainError) return error.retryable ? undefined : error;
  if (error instanceof ZodError) return new DomainError('VALIDATION', validationDetail(error));
  // RLS backstop or a missing grant: the app-layer policy let through something the database
  // refuses, which is still a denial for the caller, never a retry.
  if (isPgError(error) && error.code === PG_INSUFFICIENT_PRIVILEGE) {
    return new DomainError('FORBIDDEN');
  }
  return undefined;
}

function toJsonValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

function duplicateOutcome(opId: string, stored: StoredResult | null): CommandOutcome {
  if (stored === null) {
    // Only reachable for an op_id some other writer claimed without recording a result; the
    // pipeline itself always records in the claiming transaction.
    return { status: 'duplicate', opId, original: 'applied', result: null };
  }
  const original = stored.status === 'rejected' ? 'rejected' : 'applied';
  return {
    status: 'duplicate',
    opId,
    original,
    result: stored.result_ref,
    ...(stored.code !== null ? { code: stored.code } : {}),
    ...(stored.detail !== null ? { detail: stored.detail } : {}),
  };
}

/** Recovers enough of an invalid envelope to record its rejection against the client's op_id. */
function recoverableOpIdentity(raw: unknown): { opId: string; cmd: string } | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const { op_id: opId, cmd } = raw as { op_id?: unknown; cmd?: unknown };
  if (typeof opId !== 'string' || !isUuidV7(opId)) return undefined;
  return { opId, cmd: typeof cmd === 'string' && cmd.length > 0 ? cmd : 'invalid_envelope' };
}

function runInActorTx<T>(
  ctx: ExecuteCommandContext,
  deviceId: string,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return ctx.actor.kind === 'user'
    ? withUser(ctx.pool, ctx.actor.uid, deviceId, fn)
    : withSystem(ctx.pool, fn);
}

async function rejectUnparsed(
  ctx: ExecuteCommandContext,
  raw: unknown,
  error: ZodError,
): Promise<CommandOutcome> {
  const identity = recoverableOpIdentity(raw);
  const detail = validationDetail(error);
  if (identity === undefined) throw new DomainError('VALIDATION', detail);

  const payload = (raw as { payload?: unknown }).payload;
  const version = (raw as { v?: unknown }).v;
  const hash = commandPayloadHash(identity.cmd, typeof version === 'number' ? version : 0, payload);
  return runInActorTx(ctx, 'unknown', async (tx) => {
    const claim = await claimOpId(tx, {
      opId: identity.opId,
      uid: ctx.actor.uid,
      cmd: identity.cmd,
      payloadHash: hash,
    });
    if (claim.outcome === 'duplicate') {
      return duplicateOutcome(identity.opId, claim.result as StoredResult | null);
    }
    if (claim.outcome === 'mismatch') {
      return { status: 'rejected', opId: identity.opId, code: 'IDEMPOTENCY_MISMATCH' };
    }
    await recordCmdResult(tx, {
      opId: identity.opId,
      uid: ctx.actor.uid,
      cmd: identity.cmd,
      status: 'rejected',
      code: 'VALIDATION',
      detail,
    });
    return { status: 'rejected', opId: identity.opId, code: 'VALIDATION', detail };
  });
}

/** Why a door may not reach a command; `undefined` when it may. */
function doorRefusal(
  definition: DbCommandDefinition<unknown, unknown> | undefined,
  door: CommandDoor,
): { reason: string } | undefined {
  if (definition === undefined) return { reason: 'unknown_command' };
  // An internal command looks exactly like an unknown one from outside: never confirm it exists.
  if (definition.internal && door !== 'system') return { reason: 'unknown_command' };
  if (door === 'sync' && !definition.offline) return { reason: 'not_offline_capable' };
  return undefined;
}

function buildContext(
  envelope: ParsedEnvelope,
  ctx: ExecuteCommandContext,
  serverNow: Date,
): CommandContext {
  return {
    opId: envelope.op_id,
    cmd: envelope.cmd,
    uid: ctx.actor.uid,
    isAnonymous: ctx.actor.kind === 'user' && ctx.actor.isAnonymous,
    via: ctx.actor.kind === 'system' ? 'system' : envelope.actor.via,
    device: envelope.device,
    baseVersion: envelope.base_version,
    clock: commandClock(envelope.client_ts, serverNow),
  };
}

/**
 * Runs one command envelope through the pipeline and returns its outcome. Throws `DomainError`
 * `VALIDATION` only for an envelope without a usable op_id (nothing to record it against) and
 * rethrows transient failures untouched.
 */
export async function executeCommand(
  raw: unknown,
  ctx: ExecuteCommandContext,
): Promise<CommandOutcome> {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return rejectUnparsed(ctx, raw, parsed.error);

  // The envelope's actor.uid is never trusted: the session (or system caller) decides who acts.
  const envelope: ParsedEnvelope = {
    ...parsed.data,
    actor: {
      uid: ctx.actor.uid,
      via: ctx.actor.kind === 'system' ? 'system' : parsed.data.actor.via,
    },
  };
  const definition = ctx.resolve(envelope.cmd);
  const refusal = doorRefusal(definition, ctx.door);

  const serverNow = (ctx.now ?? (() => new Date()))();
  const opId = envelope.op_id;
  const hash = commandPayloadHash(envelope.cmd, envelope.v, envelope.payload);

  return runInActorTx(ctx, envelope.device.id, async (tx) => {
    const claim = await claimOpId(tx, {
      opId,
      uid: ctx.actor.uid,
      cmd: envelope.cmd,
      payloadHash: hash,
    });
    if (claim.outcome === 'duplicate') {
      return duplicateOutcome(opId, claim.result as StoredResult | null);
    }
    if (claim.outcome === 'mismatch') {
      return { status: 'rejected', opId, code: 'IDEMPOTENCY_MISMATCH' };
    }

    const reject = async (error: DomainError): Promise<CommandOutcome> => {
      const detail = error.detail;
      await recordCmdResult(tx, {
        opId,
        uid: ctx.actor.uid,
        cmd: envelope.cmd,
        status: 'rejected',
        code: error.code,
        ...(detail !== undefined ? { detail } : {}),
      });
      return {
        status: 'rejected',
        opId,
        code: error.code,
        ...(detail !== undefined ? { detail } : {}),
      };
    };

    if (definition === undefined || refusal !== undefined) {
      return reject(new DomainError('VALIDATION', refusal));
    }

    // Recorded like any other reject so an offline queue never stalls on it; the client asks the
    // user to sign in and sends a fresh op.
    if (ctx.actor.kind === 'user' && ctx.actor.isAnonymous && !definition.allowAnonymous) {
      return reject(new DomainError('AUTH_REQUIRED', { reason: 'registered_only' }));
    }

    const payload = definition.schema.safeParse(envelope.payload);
    if (!payload.success) {
      return reject(new DomainError('VALIDATION', validationDetail(payload.error)));
    }

    const commandCtx = buildContext(envelope, ctx, serverNow);
    await tx.query('SAVEPOINT command_hooks');
    let result: unknown;
    try {
      await definition.authorize(tx, payload.data, commandCtx);
      await definition.entitle(tx, payload.data, commandCtx);
      result = await definition.handle(tx, payload.data, commandCtx);
    } catch (error) {
      const rejection = asRejection(error);
      if (rejection === undefined) throw error;
      await tx.query('ROLLBACK TO SAVEPOINT command_hooks');
      return reject(rejection);
    }
    await tx.query('RELEASE SAVEPOINT command_hooks');

    await recordCmdResult(tx, {
      opId,
      uid: ctx.actor.uid,
      cmd: envelope.cmd,
      status: 'applied',
      resultRef: toJsonValue(result),
    });
    return { status: 'applied', opId, result: toJsonValue(result) };
  });
}

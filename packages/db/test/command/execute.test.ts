/**
 * The command pipeline against a real Postgres: idempotent replay, mismatch detection, rejection
 * semantics (only the `cmd_results` row survives a reject), transient failures leaving the op
 * retryable, uid overwrite, quota reservations undone with the rest of a failed command, and
 * outbox/event rows (plus the relay's NOTIFY wake) appearing only after commit.
 */
import {
  DomainError,
  generateUuidV7,
  userChannel,
  type CommandContext,
  type CommandOutcome,
} from '@cp/domain';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  emitEvent,
  executeCommand,
  outbox,
  revokeRealtime,
  type DbCommandDefinition,
  type ExecuteCommandContext,
} from '../../src/command';
import { withSystem, withUser } from '../../src/tx';
import { insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const crewPayload = z.object({ crew_id: z.uuid(), name: z.string().min(1) });
type CrewPayload = z.infer<typeof crewPayload>;

interface Probe {
  lastCtx?: CommandContext;
  beforeCommit?: { outbox: number; events: number };
}

type Hooks = Partial<
  Pick<DbCommandDefinition<CrewPayload, unknown>, 'authorize' | 'entitle' | 'handle'>
>;

const QUOTA_METRIC = 'guide_answers';

async function countRows(crewId: string): Promise<{ outbox: number; events: number }> {
  const outboxRows = await db.pool.query(
    "SELECT 1 FROM rt_outbox WHERE payload->>'type' = 'test.crew_created' AND payload->'data'->>'crew_id' = $1",
    [crewId],
  );
  const eventRows = await db.pool.query('SELECT 1 FROM domain_events WHERE aggregate_id = $1', [
    crewId,
  ]);
  return { outbox: outboxRows.rowCount ?? 0, events: eventRows.rowCount ?? 0 };
}

/** A command registered by this test file only: creates a crew, emits an event and a hint. */
function createCrewCommand(
  probe: Probe,
  hooks: Hooks = {},
): DbCommandDefinition<CrewPayload, unknown> {
  return {
    name: 'create_test_crew',
    v: 1,
    schema: crewPayload,
    offline: true,
    allowAnonymous: false,
    internal: false,
    actionScope: undefined,
    authorize: hooks.authorize ?? (() => Promise.resolve()),
    entitle: hooks.entitle ?? (() => Promise.resolve()),
    handle:
      hooks.handle ??
      (async (tx, payload, ctx) => {
        probe.lastCtx = ctx;
        await tx.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
          payload.crew_id,
          payload.name,
          ctx.uid,
        ]);
        await emitEvent(tx, {
          type: 'crew.member_joined',
          aggregateKind: 'crew',
          aggregateId: payload.crew_id,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { crew_id: payload.crew_id, user_id: ctx.uid },
          crewId: payload.crew_id,
        });
        await outbox(tx, userChannel(ctx.uid), 'test.crew_created', {
          crew_id: payload.crew_id,
        });
        probe.beforeCommit = await countRows(payload.crew_id);
        return { crew_id: payload.crew_id };
      }),
  };
}

function envelopeFor(uid: string, payload: unknown, overrides: Record<string, unknown> = {}) {
  return {
    op_id: generateUuidV7(),
    cmd: 'create_test_crew',
    v: 1,
    actor: { uid, via: 'offline' },
    device: { id: 'device-1', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
    client_ts: new Date().toISOString(),
    payload,
    ...overrides,
  };
}

function contextFor(
  uid: string,
  definition: DbCommandDefinition<CrewPayload, unknown>,
  overrides: Partial<ExecuteCommandContext> = {},
): ExecuteCommandContext {
  return {
    pool: db.pool,
    resolve: (name) =>
      name === definition.name
        ? (definition as unknown as DbCommandDefinition<unknown, unknown>)
        : undefined,
    actor: { kind: 'user', uid, isAnonymous: false },
    door: 'sync',
    ...overrides,
  };
}

async function crewExists(crewId: string): Promise<boolean> {
  const { rowCount } = await db.pool.query('SELECT 1 FROM crews WHERE id = $1', [crewId]);
  return rowCount === 1;
}

async function cmdResult(opId: string) {
  const { rows } = await db.pool.query<{
    uid: string;
    status: string;
    code: string | null;
    detail: unknown;
  }>('SELECT uid, status, code, detail FROM cmd_results WHERE op_id = $1', [opId]);
  return rows[0];
}

async function quotaCount(uid: string): Promise<number> {
  const { rows } = await db.pool.query<{ count: number }>(
    'SELECT count FROM usage_counters WHERE subject_id = $1 AND metric = $2',
    [uid, QUOTA_METRIC],
  );
  return rows[0]?.count ?? 0;
}

describe('executeCommand', () => {
  it('applies a command, records the result and exposes outbox + event rows only after commit', async () => {
    const uid = await insertUser(db.pool);
    const probe: Probe = {};
    const command = createCrewCommand(probe);
    const crewId = generateUuidV7();

    const listener = await db.pool.connect();
    const notifications: string[] = [];
    listener.on('notification', (message) => notifications.push(message.channel));
    await listener.query('LISTEN rt_outbox');
    try {
      const outcome = await executeCommand(
        envelopeFor(uid, { crew_id: crewId, name: 'Bali' }),
        contextFor(uid, command),
      );

      expect(outcome).toMatchObject({ status: 'applied', result: { crew_id: crewId } });
      expect(probe.beforeCommit).toEqual({ outbox: 0, events: 0 });
      expect(await countRows(crewId)).toEqual({ outbox: 1, events: 1 });
      expect(await crewExists(crewId)).toBe(true);
      expect(await cmdResult(outcome.opId)).toMatchObject({ uid, status: 'applied', code: null });

      await expect.poll(() => notifications.length, { timeout: 2000 }).toBeGreaterThan(0);
      expect(notifications.every((channel) => channel === 'rt_outbox')).toBe(true);
    } finally {
      await listener.query('UNLISTEN rt_outbox');
      listener.release();
    }
  });

  it('replays a duplicate op_id with the stored result and writes nothing again', async () => {
    const uid = await insertUser(db.pool);
    const command = createCrewCommand({});
    const crewId = generateUuidV7();
    const envelope = envelopeFor(uid, { name: 'Hoi An', crew_id: crewId });

    const first = await executeCommand(envelope, contextFor(uid, command));
    // Same payload with keys in another order hashes identically.
    const replay = await executeCommand(
      { ...envelope, payload: { crew_id: crewId, name: 'Hoi An' } },
      contextFor(uid, command),
    );

    expect(first.status).toBe('applied');
    expect(replay).toEqual({
      status: 'duplicate',
      opId: envelope.op_id,
      original: 'applied',
      result: { crew_id: crewId },
    });
    expect(await countRows(crewId)).toEqual({ outbox: 1, events: 1 });
  });

  it('returns IDEMPOTENCY_MISMATCH for a reused op_id with a different payload', async () => {
    const uid = await insertUser(db.pool);
    const command = createCrewCommand({});
    const envelope = envelopeFor(uid, { crew_id: generateUuidV7(), name: 'Da Lat' });
    await executeCommand(envelope, contextFor(uid, command));

    const secondCrew = generateUuidV7();
    const outcome = await executeCommand(
      { ...envelope, payload: { crew_id: secondCrew, name: 'Da Lat' } },
      contextFor(uid, command),
    );

    expect(outcome).toEqual({
      status: 'rejected',
      opId: envelope.op_id,
      code: 'IDEMPOTENCY_MISMATCH',
    });
    expect(await crewExists(secondCrew)).toBe(false);
    expect(await cmdResult(envelope.op_id)).toMatchObject({ status: 'applied' });
  });

  it('records FORBIDDEN from authorize and writes nothing else', async () => {
    const uid = await insertUser(db.pool);
    const handled: string[] = [];
    const command = createCrewCommand(
      {},
      {
        authorize: () => Promise.reject(new DomainError('FORBIDDEN')),
        handle: () => {
          handled.push('ran');
          return Promise.resolve(null);
        },
      },
    );
    const crewId = generateUuidV7();

    const outcome = await executeCommand(
      envelopeFor(uid, { crew_id: crewId, name: 'Hue' }),
      contextFor(uid, command),
    );

    expect(outcome).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
    expect(handled).toEqual([]);
    expect(await crewExists(crewId)).toBe(false);
    expect(await cmdResult(outcome.opId)).toMatchObject({
      uid,
      status: 'rejected',
      code: 'FORBIDDEN',
    });
    const replay = await executeCommand(
      envelopeFor(uid, { crew_id: crewId, name: 'Hue' }, { op_id: outcome.opId }),
      contextFor(uid, command),
    );
    expect(replay).toMatchObject({ status: 'duplicate', original: 'rejected', code: 'FORBIDDEN' });
  });

  it('rolls back outbox and events written before a handler rejects', async () => {
    const uid = await insertUser(db.pool);
    const probe: Probe = {};
    const base = createCrewCommand(probe);
    const command = createCrewCommand(probe, {
      handle: async (tx, payload, ctx) => {
        await base.handle(tx, payload, ctx);
        throw new DomainError('STATE_INVALID', { state: 'closed' });
      },
    });
    const crewId = generateUuidV7();

    const outcome = await executeCommand(
      envelopeFor(uid, { crew_id: crewId, name: 'Sapa' }),
      contextFor(uid, command),
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      code: 'STATE_INVALID',
      detail: { state: 'closed' },
    });
    expect(await countRows(crewId)).toEqual({ outbox: 0, events: 0 });
    expect(await crewExists(crewId)).toBe(false);
    expect(await cmdResult(outcome.opId)).toMatchObject({
      status: 'rejected',
      code: 'STATE_INVALID',
      detail: { state: 'closed' },
    });
  });

  it('rethrows an unexpected failure with nothing recorded, so the same op_id can retry', async () => {
    const uid = await insertUser(db.pool);
    let attempt = 0;
    const base = createCrewCommand({});
    const command = createCrewCommand(
      {},
      {
        handle: async (tx, payload, ctx) => {
          attempt += 1;
          const written = await base.handle(tx, payload, ctx);
          if (attempt === 1) throw new Error('connection reset');
          return written;
        },
      },
    );
    const crewId = generateUuidV7();
    const envelope = envelopeFor(uid, { crew_id: crewId, name: 'Can Tho' });

    await expect(executeCommand(envelope, contextFor(uid, command))).rejects.toThrow(
      'connection reset',
    );
    expect(await cmdResult(envelope.op_id)).toBeUndefined();
    expect(await countRows(crewId)).toEqual({ outbox: 0, events: 0 });

    const retry = await executeCommand(envelope, contextFor(uid, command));
    expect(retry).toMatchObject({ status: 'applied', result: { crew_id: crewId } });
  });

  it('overwrites a spoofed actor.uid with the session uid', async () => {
    const uid = await insertUser(db.pool);
    const victim = await insertUser(db.pool);
    const probe: Probe = {};
    const crewId = generateUuidV7();

    const outcome = await executeCommand(
      envelopeFor(victim, { crew_id: crewId, name: 'Nha Trang' }),
      contextFor(uid, createCrewCommand(probe)),
    );

    expect(outcome.status).toBe('applied');
    expect(probe.lastCtx?.uid).toBe(uid);
    expect(await cmdResult(outcome.opId)).toMatchObject({ uid });
    const { rows } = await db.pool.query<{ created_by: string }>(
      'SELECT created_by FROM crews WHERE id = $1',
      [crewId],
    );
    expect(rows[0]?.created_by).toBe(uid);
  });

  it('leaves the quota counter unchanged when the handler fails after entitle reserved it', async () => {
    const uid = await insertUser(db.pool);
    const reserve: DbCommandDefinition<CrewPayload, unknown>['entitle'] = async (tx, _p, ctx) => {
      await tx.query('SELECT app.consume_quota($1, $2, $3, $4, $5, $6)', [
        'user',
        ctx.uid,
        QUOTA_METRIC,
        '2026-09-27',
        30,
        new Date('2026-09-28T00:00:00Z'),
      ]);
    };
    const succeeding = createCrewCommand({}, { entitle: reserve });
    await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'Phu Quoc' }),
      contextFor(uid, succeeding),
    );
    expect(await quotaCount(uid)).toBe(1);

    const failing = createCrewCommand(
      {},
      {
        entitle: reserve,
        handle: () => Promise.reject(new DomainError('VOTE_CLOSED')),
      },
    );
    const outcome = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'Phu Quoc' }),
      contextFor(uid, failing),
    );

    expect(outcome).toMatchObject({ status: 'rejected', code: 'VOTE_CLOSED' });
    expect(await quotaCount(uid)).toBe(1);
  });

  it('maps an RLS refusal inside the handler to FORBIDDEN', async () => {
    const uid = await insertUser(db.pool);
    const other = await insertUser(db.pool);
    const command = createCrewCommand(
      {},
      {
        handle: async (tx, payload) => {
          await tx.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
            payload.crew_id,
            payload.name,
            other,
          ]);
          return null;
        },
      },
    );

    const outcome = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'Vung Tau' }),
      contextFor(uid, command),
    );
    expect(outcome).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
  });

  it('records VALIDATION for a bad payload, an unknown command and a non-offline command on the sync door', async () => {
    const uid = await insertUser(db.pool);
    const command = createCrewCommand({});
    const onlineOnly = { ...command, offline: false };

    const badPayload = await executeCommand(
      envelopeFor(uid, { crew_id: 'nope', name: '' }),
      contextFor(uid, command),
    );
    const unknown = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' }, { cmd: 'cast_nothing' }),
      contextFor(uid, command),
    );
    const notOffline = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' }),
      contextFor(uid, onlineOnly),
    );
    const onlineDoor = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' }),
      contextFor(uid, onlineOnly, { door: 'cmd' }),
    );

    expect(badPayload).toMatchObject({ status: 'rejected', code: 'VALIDATION' });
    const issues =
      badPayload.status === 'rejected'
        ? (badPayload.detail as { issues: Array<{ path: string[] }> }).issues
        : [];
    expect(issues.map((issue) => issue.path)).toContainEqual(['crew_id']);
    expect(unknown).toMatchObject({
      status: 'rejected',
      code: 'VALIDATION',
      detail: { reason: 'unknown_command' },
    });
    expect(notOffline).toMatchObject({
      status: 'rejected',
      code: 'VALIDATION',
      detail: { reason: 'not_offline_capable' },
    });
    expect(onlineDoor.status).toBe('applied');
    expect(await cmdResult(unknown.opId)).toMatchObject({ status: 'rejected', code: 'VALIDATION' });
  });

  it('hides internal commands from client doors but runs them through the system door', async () => {
    const uid = await insertUser(db.pool);
    const internal = { ...createCrewCommand({}), internal: true };

    const fromClient = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' }),
      contextFor(uid, internal, { door: 'cmd' }),
    );
    const fromSystem = await executeCommand(
      envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' }),
      contextFor(uid, internal, { door: 'system', actor: { kind: 'system', uid } }),
    );

    expect(fromClient).toMatchObject({ code: 'VALIDATION', detail: { reason: 'unknown_command' } });
    expect(fromSystem.status).toBe('applied');
    expect(await cmdResult(fromSystem.opId)).toMatchObject({ uid, status: 'applied' });
  });

  it('records a malformed envelope with a usable op_id and throws for one without', async () => {
    const uid = await insertUser(db.pool);
    const command = createCrewCommand({});
    const opId = generateUuidV7();

    const recorded = await executeCommand(
      { op_id: opId, cmd: 'create_test_crew', payload: {} },
      contextFor(uid, command),
    );
    expect(recorded).toMatchObject({ status: 'rejected', opId, code: 'VALIDATION' });
    expect(await cmdResult(opId)).toMatchObject({ status: 'rejected', code: 'VALIDATION' });

    await expect(
      executeCommand({ op_id: 'not-a-uuid' }, contextFor(uid, command)),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuses a registered-only command for an anonymous session before claiming the op', async () => {
    const uid = await insertUser(db.pool, { status: 'anonymous' });
    const command = createCrewCommand({});
    const envelope = envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' });

    await expect(
      executeCommand(
        envelope,
        contextFor(uid, command, { actor: { kind: 'user', uid, isAnonymous: true } }),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(await cmdResult(envelope.op_id)).toBeUndefined();

    const allowed = await executeCommand(
      envelope,
      contextFor(
        uid,
        { ...command, allowAnonymous: true },
        {
          actor: { kind: 'user', uid, isAnonymous: true },
        },
      ),
    );
    expect(allowed.status).toBe('applied');
  });

  it('trusts client_ts within 5 minutes and falls back to server time beyond it', async () => {
    const uid = await insertUser(db.pool);
    const probe: Probe = {};
    const command = createCrewCommand(probe);
    const serverNow = new Date('2026-09-27T10:00:00Z');
    const run = async (clientTs: string): Promise<CommandOutcome> =>
      executeCommand(
        envelopeFor(uid, { crew_id: generateUuidV7(), name: 'x' }, { client_ts: clientTs }),
        contextFor(uid, command, { now: () => serverNow }),
      );

    await run('2026-09-27T10:04:00Z');
    expect(probe.lastCtx?.clock).toMatchObject({ clientTsTrusted: true, skewMs: 240_000 });
    expect(probe.lastCtx?.clock.effectiveClientTs.toISOString()).toBe('2026-09-27T10:04:00.000Z');

    await run('2026-09-27T10:06:00Z');
    expect(probe.lastCtx?.clock).toMatchObject({ clientTsTrusted: false, skewMs: 360_000 });
    expect(probe.lastCtx?.clock.effectiveClientTs).toEqual(serverNow);
  });
});

describe('outbox and revokeRealtime', () => {
  it('rejects a realtime envelope over 8 KB', async () => {
    const uid = await insertUser(db.pool);
    await expect(
      withUser(db.pool, uid, 'device-1', (tx: pg.PoolClient) =>
        outbox(tx, userChannel(uid), 'test.big', { blob: 'x'.repeat(9000) }),
      ),
    ).rejects.toThrow(/max 8192/);
  });

  it('queues unsubscribe and disconnect rows from a system transaction only', async () => {
    const uid = await insertUser(db.pool);
    const crewChannelName = `crew:${generateUuidV7()}`;

    const { ids } = await withSystem(db.pool, async (tx) => {
      const unsubscribed = await revokeRealtime(tx, { uid, channels: [crewChannelName] });
      const disconnected = await revokeRealtime(tx, { uid, all: true });
      return { ids: [...unsubscribed.ids, ...disconnected.ids] };
    });
    const { rows } = await db.pool.query<{ channel: string; kind: string; payload: unknown }>(
      'SELECT channel, kind, payload FROM rt_outbox WHERE id = ANY($1::bigint[]) ORDER BY id',
      [ids],
    );
    expect(rows).toEqual([
      { channel: crewChannelName, kind: 'unsubscribe', payload: { user_id: uid } },
      { channel: userChannel(uid), kind: 'disconnect', payload: { user_id: uid } },
    ]);

    await expect(
      withUser(db.pool, uid, 'device-1', (tx) => revokeRealtime(tx, { uid, all: true })),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

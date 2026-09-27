/**
 * `cmd_log`, `domain_events` and `rt_outbox` (RLS class S, docs/data-model.md §3.18): no app_user
 * or app_system grant at all — only their SECURITY DEFINER writer functions, owned by app_owner,
 * ever touch them. `rt_outbox` is the one exception with a direct app_system SELECT/UPDATE grant
 * (the relay worker), but still no app_system INSERT.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
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

describe('cmd_log: no grant to any role but the owner', () => {
  it('denies app_user SELECT and INSERT', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT * FROM cmd_log'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          "INSERT INTO cmd_log (op_id, cmd, payload_hash) VALUES (gen_random_uuid(), 'x', 'h')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies app_system SELECT and INSERT too', async () => {
    await expect(withSystem(db.pool, (tx) => tx.query('SELECT * FROM cmd_log'))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO cmd_log (op_id, cmd, payload_hash) VALUES (gen_random_uuid(), 'x', 'h')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('domain_events: no grant to any role but the owner', () => {
  it('denies app_user SELECT and INSERT', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT * FROM domain_events'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          "INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, payload) VALUES (uuidv7(), 'trip.created', 'trip', gen_random_uuid(), 'user', '{}')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies app_system SELECT and INSERT too — even the purge job goes through a SECURITY DEFINER function', async () => {
    await expect(
      withSystem(db.pool, (tx) => tx.query('SELECT * FROM domain_events')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, payload) VALUES (uuidv7(), 'trip.created', 'trip', gen_random_uuid(), 'system', '{}')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("denies app_user UPDATE and DELETE — the log is append-only even to its own writer's role", async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query("UPDATE domain_events SET type = 'trip.created' WHERE false"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('DELETE FROM domain_events WHERE false'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an event type outside the catalogue even for the owner connection', async () => {
    await expect(
      db.pool.query(
        "INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, payload) VALUES (uuidv7(), 'not.a_real_event', 'trip', gen_random_uuid(), 'system', '{}')",
      ),
    ).rejects.toThrow(/violates check constraint/i);
  });
});

describe('rt_outbox: app_system may relay but not enqueue directly', () => {
  it('still denies app_user entirely, including a direct INSERT bypassing app.enqueue_rt', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT * FROM rt_outbox'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query(
          "INSERT INTO rt_outbox (channel, payload, idem_key, kind) VALUES ('user:#x', '{}', gen_random_uuid(), 'publish')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system select and update, but not insert directly', async () => {
    await expect(
      withSystem(db.pool, (tx) => tx.query('SELECT * FROM rt_outbox')),
    ).resolves.toBeDefined();
    await expect(
      withSystem(db.pool, (tx) => tx.query('UPDATE rt_outbox SET attempts = attempts WHERE false')),
    ).resolves.toBeDefined();
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO rt_outbox (channel, payload, idem_key, kind) VALUES ('user:#x', '{}', gen_random_uuid(), 'publish')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

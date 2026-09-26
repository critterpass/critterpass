import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../src/tx';
import { anonymousActor, randomId } from './helpers/actors';
import { startDbTestContainer, type DbTestContainer, type DbTestDatabase } from './helpers/pg-container';

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

describe('withUser', () => {
  it('sets app.uid/app.device for the transaction and runs as app_user', async () => {
    const actor = anonymousActor();
    const seen = await withUser(db.pool, actor.uid, actor.device, async (tx) => {
      const { rows } = await tx.query<{ uid: string | null; device: string | null; role: string }>(
        `select app.uid()::text as uid, app.device() as device, current_user as role`,
      );
      return rows[0];
    });
    expect(seen?.uid).toBe(actor.uid);
    expect(seen?.device).toBe(actor.device);
    expect(seen?.role).toBe('app_user');
  });

  it('does not leak app.uid into a later transaction on the same pool', async () => {
    const actor = anonymousActor();
    await withUser(db.pool, actor.uid, actor.device, () => Promise.resolve(undefined));

    const uidAfter = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ uid: string | null }>('select app.uid()::text as uid');
      return rows[0]?.uid ?? null;
    });
    expect(uidAfter).toBeNull();
  });

  it('rolls back app.uid on a failed transaction too', async () => {
    const actor = anonymousActor();
    await expect(
      withUser(db.pool, actor.uid, actor.device, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    const uidAfter = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ uid: string | null }>('select app.uid()::text as uid');
      return rows[0]?.uid ?? null;
    });
    expect(uidAfter).toBeNull();
  });

  it('has no BYPASSRLS and no membership in app_system', async () => {
    const properties = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ bypassrls: boolean; escalates: boolean }>(
        `select
           (select rolbypassrls from pg_roles where rolname = 'app_user') as bypassrls,
           pg_has_role('app_user', 'app_system', 'member') as escalates`,
      );
      return rows[0];
    });
    expect(properties?.bypassrls).toBe(false);
    expect(properties?.escalates).toBe(false);
  });
});

describe('withSystem', () => {
  it('runs as app_system with no app.uid set', async () => {
    const seen = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ role: string; uid: string | null }>(
        'select current_user as role, app.uid()::text as uid',
      );
      return rows[0];
    });
    expect(seen?.role).toBe('app_system');
    expect(seen?.uid).toBeNull();
  });
});

describe('withGuideReader', () => {
  it('runs as guide_reader with app.uid and app.trip set', async () => {
    const actor = anonymousActor();
    const tripId = randomId();
    const seen = await withGuideReader(db.pool, actor.uid, tripId, async (tx) => {
      const { rows } = await tx.query<{ role: string; uid: string | null; trip: string | null }>(
        "select current_user as role, app.uid()::text as uid, current_setting('app.trip', true) as trip",
      );
      return rows[0];
    });
    expect(seen?.role).toBe('guide_reader');
    expect(seen?.uid).toBe(actor.uid);
    expect(seen?.trip).toBe(tripId);
  });
});

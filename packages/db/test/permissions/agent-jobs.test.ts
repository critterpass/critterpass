import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;
let memberJobId: string;
let organiserJobId: string;
let exMemberJobId: string;

async function insertJob(userId: string, kind: string): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'INSERT INTO agent_jobs (trip_id, user_id, kind) VALUES ($1, $2, $3) RETURNING id',
      [fixture.tripId, userId, kind],
    );
    return firstRow(rows).id;
  });
}

async function visibleJobs(uid: string): Promise<string[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM agent_jobs WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[memberJobId, organiserJobId, exMemberJobId]],
    );
    return rows.map((r) => r.id);
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  memberJobId = await insertJob(fixture.actors.member, 'proposal');
  organiserJobId = await insertJob(fixture.actors.organiser, 'redraft');
  exMemberJobId = await insertJob(fixture.actors.exMember, 'proposal');
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('agent_jobs RLS: own jobs, plus every job on a trip you organise', () => {
  it('shows an outsider nothing', async () => {
    expect(await visibleJobs(fixture.actors.outsider)).toEqual([]);
  });

  it('shows an ex-member only the job they asked for themselves', async () => {
    expect(await visibleJobs(fixture.actors.exMember)).toEqual([exMemberJobId]);
  });

  it("shows a member their own job but not the organiser's draft work", async () => {
    expect(await visibleJobs(fixture.actors.member)).toEqual([memberJobId]);
  });

  it('shows an organiser every job on the trip', async () => {
    expect(await visibleJobs(fixture.actors.organiser)).toEqual(
      [memberJobId, organiserJobId, exMemberJobId].sort(),
    );
  });

  it('denies every app_user write, the organiser included', async () => {
    await expect(
      withUser(db.pool, fixture.actors.organiser, anonymousActor().device, (tx) =>
        tx.query("UPDATE agent_jobs SET status = 'cancelled' WHERE id = $1", [organiserJobId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, fixture.actors.member, anonymousActor().device, (tx) =>
        tx.query("INSERT INTO agent_jobs (user_id, kind) VALUES ($1, 'pitch')", [
          fixture.actors.member,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system advance a job and aggregate its cost', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        `UPDATE agent_jobs SET status = 'succeeded', tokens_in = 900, tokens_out = 120,
           cost_micros = 1500, steps = '[{"step":"skeleton","done":true}]' WHERE id = $1`,
        [memberJobId],
      ),
    );
    const rows = await withUser(db.pool, fixture.actors.member, anonymousActor().device, (tx) =>
      tx.query<{ status: string }>('SELECT status FROM agent_jobs WHERE id = $1', [memberJobId]),
    );
    expect(rows.rows).toEqual([{ status: 'succeeded' }]);
  });

  it('rejects an unknown kind', async () => {
    await expect(insertJob(fixture.actors.member, 'banter')).rejects.toThrow(
      /agent_jobs_kind_check/,
    );
  });
});

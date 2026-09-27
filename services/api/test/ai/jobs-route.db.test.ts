/**
 * `GET /v1/jobs/{id}` over the real stack: the job's own user reads its steps; anyone else, or an
 * unknown id, gets `NOT_FOUND`; no session is `AUTH_REQUIRED`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerJobsRoute } from '../../src/ai/jobs-route';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerJobsRoute(app, deps),
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function insertJob(uid: string): Promise<string> {
  const steps = [
    { step: 'skeleton', status: 'done', pct: 40 },
    { step: 'days', status: 'running', pct: 70 },
  ];
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO agent_jobs (user_id, kind, status, steps) VALUES ($1, 'draft', 'running', $2)
     RETURNING id`,
    [uid, JSON.stringify(steps)],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('job insert returned no id');
  return id;
}

describe('GET /v1/jobs/{id}', () => {
  it("returns the caller's own job with its steps", async () => {
    const me = await harness.signInAnonymously();
    const id = await insertJob(me.uid);
    const response = await harness.request(`/v1/jobs/${id}`, { headers: { cookie: me.cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      job_id: id,
      kind: 'draft',
      status: 'running',
      trip_id: null,
      steps: [
        { step: 'skeleton', status: 'done', pct: 40 },
        { step: 'days', status: 'running', pct: 70 },
      ],
    });
  });

  it("hides another user's job and unknown ids behind NOT_FOUND", async () => {
    const owner = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    const id = await insertJob(owner.uid);
    for (const path of [`/v1/jobs/${id}`, `/v1/jobs/${crypto.randomUUID()}`]) {
      const response = await harness.request(path, { headers: { cookie: other.cookie } });
      expect(response.status).toBe(404);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    }
  });

  it('requires a session and a uuid', async () => {
    expect((await harness.request(`/v1/jobs/${crypto.randomUUID()}`)).status).toBe(401);
    const me = await harness.signInAnonymously();
    const bad = await harness.request('/v1/jobs/not-a-uuid', { headers: { cookie: me.cookie } });
    expect(bad.status).toBe(422);
  });
});

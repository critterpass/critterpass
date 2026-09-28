/**
 * `avatar.moderate` and `avatar.render` against a migrated Postgres and an S3-compatible object
 * store (RustFS standing in for R2): the hash match runs first and a hit never reaches the model
 * (asserted on a gateway spy), the model's verdict decides the rest, uncertain photos wait for ops,
 * and an approved photo ends with its four PNG variants in the bucket.
 */
import { createGateway, type Gateway } from '@cp/ai';
import { withUser } from '@cp/db';
import { AwsClient } from 'aws4fetch';
import type { PgBoss } from 'pg-boss';
import sharp from 'sharp';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../../../src/boss';
import { photoDnaMatcher } from '../../../src/jobs/avatar/hash-match';
import {
  createAvatarMediaStore,
  quarantineKey,
  type AvatarMediaStore,
} from '../../../src/jobs/avatar/media-store';
import { avatarModerateJob, type AvatarClassifier } from '../../../src/jobs/avatar/moderate';
import { avatarRenderJob } from '../../../src/jobs/avatar/render';
import { silent, startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';
import { replay } from './replay';

const S3_IMAGE = 'rustfs/rustfs:1.0.0';
const ACCESS_KEY = 'avatar-test-access';
const SECRET_KEY = 'avatar-test-secret-key';
const BUCKET = 'cp-media-avatar-test';

let harness: JobsHarness;
let s3: StartedTestContainer;
let store: AvatarMediaStore;
let boss: PgBoss;
let owner: string;
let crewmate: string;
let crewId: string;

beforeAll(async () => {
  [harness, s3] = await Promise.all([
    startJobsHarness(),
    new GenericContainer(S3_IMAGE)
      .withEnvironment({ RUSTFS_ACCESS_KEY: ACCESS_KEY, RUSTFS_SECRET_KEY: SECRET_KEY })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
      .start(),
  ]);
  const endpoint = `http://${s3.getHost()}:${s3.getMappedPort(9000)}`;
  const admin = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  });
  const created = await admin.fetch(`${endpoint}/${BUCKET}`, { method: 'PUT' });
  if (!created.ok) throw new Error(`bucket create failed: ${created.status}`);
  store = createAvatarMediaStore({
    endpoint,
    bucket: BUCKET,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  });
  // A running runtime registers the producer the jobs enqueue follow-ups through.
  boss = await harness.startRuntime([]);
  await boss.createQueue('avatar.render', { policy: 'exclusive' });

  owner = crypto.randomUUID();
  crewmate = crypto.randomUUID();
  await harness.pool.query(
    "INSERT INTO users (id, status) VALUES ($1, 'anonymous'), ($2, 'registered')",
    [owner, crewmate],
  );
  const crew = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Avatars', $1) RETURNING id",
    [crewmate],
  );
  crewId = crew.rows[0]!.id;
  await harness.pool.query(
    `INSERT INTO crew_members (crew_id, user_id, role)
     VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
    [crewId, crewmate, owner],
  );
}, 300_000);

afterAll(async () => {
  await harness.stopAll();
  await harness.close();
  await s3.stop();
});

async function setHashMatch(on: boolean): Promise<void> {
  await harness.pool.query(
    `INSERT INTO ops.ops_config (key, value) VALUES ('moderation.hash_match', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(on)],
  );
}

/** A pending photo avatar with its upload in the bucket. */
async function pendingPhoto(): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const key = `u/${owner}/avatar/${crypto.randomUUID()}`;
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#e76f51' },
  })
    .jpeg()
    .toBuffer();
  await store.put(key, image, 'image/jpeg');
  await harness.pool.query(
    `INSERT INTO avatars (id, user_id, kind, media_key, moderation_status)
     VALUES ($1, $2, 'photo', $3, 'pending')`,
    [id, owner, key],
  );
  await harness.pool.query('UPDATE users SET avatar_id = $1 WHERE id = $2', [id, owner]);
  return { id, key };
}

function context(finalAttempt = false): JobContext {
  return {
    pool: harness.pool,
    boss,
    logger: silent,
    job: {
      id: crypto.randomUUID(),
      queue: 'avatar.moderate',
      retryCount: 0,
      retryLimit: 3,
      isFinalAttempt: finalAttempt,
      signal: new AbortController().signal,
      previousOutput: undefined,
    },
  };
}

/** The real gateway over a replayed DeepSeek reply, wrapped to count every model call. */
function spyGateway(...fixtures: string[]): {
  calls: string[];
  classifier: () => AvatarClassifier;
} {
  const calls: string[] = [];
  const transport = replay(...fixtures);
  const gateway: Gateway = createGateway({ apiKey: 'test-key', fetch: transport.fetch });
  return {
    calls,
    classifier: () => ({
      callModel: (route, input, usage) => {
        calls.push(route);
        return gateway.callModel(route, input, usage);
      },
    }),
  };
}

async function avatarRow(id: string) {
  const { rows } = await harness.pool.query<{
    moderation_status: string;
    moderation_reason: string | null;
    variant_keys: Record<string, string>;
  }>('SELECT moderation_status, moderation_reason, variant_keys FROM avatars WHERE id = $1', [id]);
  return rows[0]!;
}

async function openReports(id: string): Promise<{ source: string; reason: string }[]> {
  const { rows } = await harness.pool.query<{ source: string; reason: string }>(
    "SELECT source, reason FROM moderation_reports WHERE target_kind = 'avatar' AND target_id = $1 AND status = 'open'",
    [id],
  );
  return rows;
}

async function queued(queue: string, id: string): Promise<number> {
  const { rows } = await harness.pool.query(
    "SELECT 1 FROM pgboss.job WHERE name = $1 AND data->>'avatar_id' = $2",
    [queue, id],
  );
  return rows.length;
}

describe('avatar.moderate', () => {
  it('holds every photo for ops review while hash matching is off', async () => {
    await setHashMatch(false);
    const spy = spyGateway('deepseek-avatar-allow');
    const job = avatarModerateJob({
      store,
      matcher: photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-no-match').fetch }),
      classifier: spy.classifier,
    });
    const { id } = await pendingPhoto();
    expect(await job.handler({ avatar_id: id }, context())).toEqual({ outcome: 'review' });
    expect((await avatarRow(id)).moderation_status).toBe('pending');
    expect(await openReports(id)).toEqual([
      { source: 'compliance', reason: 'hash_match_unavailable' },
    ]);
    expect(spy.calls).toEqual([]);
  });

  it('blocks and quarantines a hash match without ever calling the model', async () => {
    await setHashMatch(true);
    const spy = spyGateway('deepseek-avatar-allow');
    const job = avatarModerateJob({
      store,
      matcher: photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-match').fetch }),
      classifier: spy.classifier,
    });
    const { id, key } = await pendingPhoto();
    expect(await job.handler({ avatar_id: id }, context())).toEqual({ outcome: 'blocked' });
    expect(spy.calls).toEqual([]);
    expect(await avatarRow(id)).toMatchObject({
      moderation_status: 'rejected',
      moderation_reason: 'hash_match',
    });
    expect(await store.get(key)).toBeNull();
    expect(await store.get(quarantineKey(key))).not.toBeNull();
    expect(await openReports(id)).toEqual([
      { source: 'compliance', reason: 'hash_match:photodna:WUS_fixture_match' },
    ]);
  });

  it('rejects on the model verdict and the crew keeps seeing it as rejected (initials)', async () => {
    await setHashMatch(true);
    const spy = spyGateway('deepseek-avatar-reject');
    const job = avatarModerateJob({
      store,
      matcher: photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-no-match').fetch }),
      classifier: spy.classifier,
    });
    const { id } = await pendingPhoto();
    expect(await job.handler({ avatar_id: id }, context())).toEqual({ outcome: 'rejected' });
    expect(spy.calls).toEqual(['avatar.moderate']);
    const seen = await withUser(harness.pool, crewmate, 'test', async (tx) => {
      const { rows } = await tx.query<{ moderation_status: string; current: boolean }>(
        `SELECT a.moderation_status, u.avatar_id = a.id AS current
         FROM avatars a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
        [id],
      );
      return rows;
    });
    expect(seen).toEqual([{ moderation_status: 'rejected', current: true }]);
    expect((await avatarRow(id)).moderation_reason).toBe('weapons');
    expect(await queued('avatar.render', id)).toBe(0);
  });

  it('leaves an uncertain photo pending for ops review', async () => {
    await setHashMatch(true);
    const spy = spyGateway('deepseek-avatar-uncertain');
    const job = avatarModerateJob({
      store,
      matcher: photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-no-match').fetch }),
      classifier: spy.classifier,
    });
    const { id } = await pendingPhoto();
    expect(await job.handler({ avatar_id: id }, context())).toEqual({ outcome: 'review' });
    expect((await avatarRow(id)).moderation_status).toBe('pending');
    expect(await openReports(id)).toEqual([
      { source: 'compliance', reason: 'classifier_uncertain' },
    ]);
  });

  it('approves, tells the crew and renders the four variants into the bucket', async () => {
    await setHashMatch(true);
    const spy = spyGateway('deepseek-avatar-allow');
    const job = avatarModerateJob({
      store,
      matcher: photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-no-match').fetch }),
      classifier: spy.classifier,
    });
    const { id } = await pendingPhoto();
    expect(await job.handler({ avatar_id: id }, context())).toEqual({ outcome: 'approved' });
    expect(await queued('avatar.render', id)).toBe(1);
    const hints = await harness.pool.query<{ payload: unknown }>(
      'SELECT payload FROM rt_outbox WHERE channel = $1',
      [`crew:${crewId}`],
    );
    expect(hints.rows.map((row) => row.payload)).toContainEqual({
      type: 'member.updated',
      user_id: owner,
      fields: ['avatar'],
    });

    const render = avatarRenderJob({ store });
    expect(await render.handler({ avatar_id: id }, context())).toEqual({ sizes: 4 });
    const { variant_keys: keys } = await avatarRow(id);
    expect(Object.keys(keys).sort()).toEqual(['120', '240', '40', '64']);
    for (const [size, key] of Object.entries(keys)) {
      const object = await store.get(key);
      expect(object?.contentType).toBe('image/png');
      const meta = await sharp(object!.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([Number(size), Number(size)]);
    }
    const registered = await harness.pool.query(
      "SELECT 1 FROM media_objects WHERE owner_id = $1 AND purpose = 'avatar' AND r2_key = ANY($2)",
      [owner, Object.values(keys)],
    );
    expect(registered.rowCount).toBe(4);
  });

  it('waits for a late upload, then rejects it as missing on the final attempt', async () => {
    await setHashMatch(true);
    const job = avatarModerateJob({
      store,
      matcher: photoDnaMatcher({ apiKey: 'k', fetch: replay().fetch }),
      classifier: undefined,
    });
    const { id, key } = await pendingPhoto();
    await store.delete(key);
    await expect(job.handler({ avatar_id: id }, context())).rejects.toThrow(/not there yet/);
    expect(await job.handler({ avatar_id: id }, context(true))).toEqual({ outcome: 'rejected' });
    expect((await avatarRow(id)).moderation_reason).toBe('upload_missing');
  });
});

/**
 * Content batches in the ops console: reads, reviewer verdicts, owner-only approval (which merges
 * the batch into the live release and queues `content.publish`), rejection with notes and rollback.
 */
import { buildRelease, currentRelease, loadRelease, type ContentItem } from '@cp/content';
import { contentBatchDetailSchema, contentBatchListSchema } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let boss: PgBoss;
let content: string;
let owner: string;
let ownerUid: string;
let liveId: string;
let batchId: string;

const at = '2026-09-28T00:00:00.000Z';
const forms = currentRelease('forms')!.items;
const [rare, epic, legendary] = forms as [
  ContentItem<'forms'>,
  ContentItem<'forms'>,
  ContentItem<'forms'>,
];

async function insertRelease(
  version: number,
  status: string,
  items: readonly ContentItem<'forms'>[],
  ipStatus = 'not_applicable',
): Promise<string> {
  const artifact = buildRelease({
    kind: 'forms',
    version,
    items,
    generated_by: {
      batch_key: `forms-${version}`,
      route: 'content.factory',
      model: 'deepseek-v4-pro',
      generated_at: at,
    },
    approved_by: null,
  });
  const approved = status === 'published' || status === 'superseded';
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, ip_status, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('forms', $1, $2, $3, $4, 'review', $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      version,
      `2026-09-28-forms-0${version}`,
      `Forms · Bali v${version}`,
      status,
      ipStatus,
      artifact.checksum,
      JSON.stringify(artifact),
      items.length,
      approved ? ownerUid : null,
      approved ? new Date() : null,
    ],
  );
  const id = rows[0]!.id;
  for (const item of items) {
    await harness.pool.query(
      "INSERT INTO ops.content_reviews (release_id, item_ref, severity, report) VALUES ($1, $2, 'warn', $3)",
      [
        id,
        item.id,
        JSON.stringify([{ id: 'contrast', severity: 'warn', message: 'Edge contrast is 3.4:1' }]),
      ],
    );
  }
  return id;
}

beforeAll(async () => {
  harness = await startAdminHarness();
  boss = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  await harness.seedOperator('content@critterpass.test', ['content']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  ownerUid = await harness.seedOperator('owner@critterpass.test', ['owner']);
  liveId = await insertRelease(1, 'published', [rare, epic]);
  batchId = await insertRelease(
    2,
    'review',
    [
      { ...rare, note: 'A new note for the temple form.' },
      { ...epic, note: 'A rejected rewrite.' },
      legendary,
    ],
    'open',
  );
  app = harness.app({ areas: harness.areas() });
  content = await app.signIn('content@critterpass.test');
  owner = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await app?.close();
  await harness?.stop();
});

async function publishJobs(): Promise<string[]> {
  const { rows } = await harness.pool.query<{ release_id: string }>(
    "SELECT data ->> 'release_id' AS release_id FROM pgboss.job WHERE name = 'content.publish'",
  );
  return rows.map((row) => row.release_id);
}

describe('content batch reads', () => {
  it('lists batches with counts and the live release per kind', async () => {
    const response = await app.request('/v1/admin/content/batches', {
      headers: { cookie: content },
    });
    expect(response.status).toBe(200);
    const list = contentBatchListSchema.parse(await response.json());
    expect(list.items[0]).toMatchObject({ id: batchId, status: 'review', severity: { warn: 3 } });
    expect(list.live).toEqual([{ kind: 'forms', version: 1, published_at: null }]);
  });

  it('shows each item beside its live version', async () => {
    const response = await app.request(`/v1/admin/content/batches/${batchId}`, {
      headers: { cookie: content },
    });
    const detail = contentBatchDetailSchema.parse(await response.json());
    expect(detail.live_version).toBe(1);
    const temple = detail.items.find((item) => item.ref === 'cp-112:rare');
    expect(temple?.previous?.['note']).toBe(rare.note);
    expect(detail.items.find((item) => item.ref === 'cp-112:legendary')?.previous).toBeNull();
  });

  it('is closed to roles without the content area', async () => {
    const support = await app.signIn('support@critterpass.test');
    const response = await app.request('/v1/admin/content/batches', {
      headers: { cookie: support },
    });
    expect(response.status).toBe(403);
  });
});

describe('content batch commands', () => {
  it('lets reviewers keep or reject items but not approve', async () => {
    const reject = await app.command(content, 'review_content_item', {
      batch_id: batchId,
      item_ref: 'cp-112:epic',
      verdict: 'reject',
      notes: 'Keep the sunrise wording.',
    });
    expect(reject.status).toBe(200);
    const approve = await app.command(content, 'approve_content_batch', { batch_id: batchId });
    expect(approve.status).toBe(403);
    expect(((await approve.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('needs the owner to sign off the IP checklist before approving', async () => {
    const response = await app.command(owner, 'approve_content_batch', { batch_id: batchId });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'ip_checklist_open' } },
    });
    expect(await publishJobs()).toEqual([]);
  });

  it('approves: merges into the live release, keeps rejected items live and queues publishing', async () => {
    const response = await app.command(owner, 'approve_content_batch', {
      batch_id: batchId,
      ip_signed_off: true,
    });
    expect(response.status).toBe(200);
    const { rows } = await harness.pool.query<{
      status: string;
      ip_status: string;
      artifact: unknown;
    }>('SELECT status, ip_status, artifact FROM content_releases WHERE id = $1', [batchId]);
    expect(rows[0]).toMatchObject({ status: 'approved', ip_status: 'clear' });
    const merged = loadRelease(rows[0]!.artifact, 'forms');
    expect(merged.approved_by).toBe(ownerUid);
    expect(Object.fromEntries(merged.items.map((f) => [f.id, f.note]))).toEqual({
      'cp-112:rare': 'A new note for the temple form.',
      'cp-112:epic': epic.note,
      'cp-112:legendary': legendary.note,
    });
    expect(await publishJobs()).toEqual([batchId]);
    const audit = await harness.pool.query<{ action: string }>(
      "SELECT action FROM ops.admin_audit WHERE target_kind = 'content_release' ORDER BY at",
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'review_content_item',
      'approve_content_batch',
    ]);
  });

  it('queues the publish again when an approved release that never went live is approved again', async () => {
    const before = await harness.pool.query<{ checksum: string }>(
      'SELECT checksum FROM content_releases WHERE id = $1',
      [batchId],
    );
    // The publish job ran out of attempts: the release stays approved with no job left to run.
    await harness.pool.query(
      "UPDATE pgboss.job SET state = 'failed' WHERE name = 'content.publish' AND data ->> 'release_id' = $1",
      [batchId],
    );
    const denied = await app.command(content, 'approve_content_batch', { batch_id: batchId });
    expect(denied.status).toBe(403);
    const again = await app.command(owner, 'approve_content_batch', { batch_id: batchId });
    expect(again.status).toBe(200);
    expect(await publishJobs()).toEqual([batchId, batchId]);
    const after = await harness.pool.query<{ status: string; checksum: string }>(
      'SELECT status, checksum FROM content_releases WHERE id = $1',
      [batchId],
    );
    expect(after.rows[0]).toEqual({ status: 'approved', checksum: before.rows[0]!.checksum });
  });

  it('holds a second approval of a kind while the first still waits to publish', async () => {
    // The batch approved above has not published: a second batch of forms would be laid over a
    // live release that is about to change, and would undo the first when it published.
    const second = await insertRelease(4, 'review', [{ ...legendary, note: 'Later wording.' }]);
    const held = await app.command(owner, 'approve_content_batch', { batch_id: second });
    expect(held.status).toBe(409);
    expect(await held.json()).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'release_pending', version: 2 } },
    });
    const { rows } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM content_releases WHERE id = $1',
      [second],
    );
    expect(rows[0]?.status).toBe('review');
    await harness.pool.query("UPDATE content_releases SET status = 'rejected' WHERE id = $1", [
      second,
    ]);
  });

  it('rejects a batch with notes and rolls a kind back to a superseded release', async () => {
    const third = await insertRelease(3, 'review', [rare]);
    const reject = await app.command(content, 'reject_content_batch', {
      batch_id: third,
      notes: 'Too samey.',
    });
    expect(reject.status).toBe(200);
    const status = await harness.pool.query(
      'SELECT status, notes FROM content_releases WHERE id = $1',
      [third],
    );
    expect(status.rows[0]).toEqual({ status: 'rejected', notes: 'Too samey.' });

    await harness.pool.query("UPDATE content_releases SET status = 'superseded' WHERE id = $1", [
      liveId,
    ]);
    const denied = await app.command(content, 'rollback_content_release', {
      kind: 'forms',
      to_version: 1,
    });
    expect(denied.status).toBe(403);
    const rollback = await app.command(owner, 'rollback_content_release', {
      kind: 'forms',
      to_version: 1,
    });
    expect(rollback.status).toBe(200);
    expect(await publishJobs()).toContain(liveId);
  });
});

/**
 * Moderation queue and `moderate_item`: reported subjects appear with their kind's preview, a verdict
 * updates every open report of the subject, writes one audit row and one `moderation.decided` event
 * per report, and `ban_author` bans the account through the app's own session store.
 */
import { adminPageSchema, moderationQueueItemSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { imagePreview, registerModerationKind } from '../../src/admin/moderation-intake';
import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from './harness';

const pageSchema = adminPageSchema(moderationQueueItemSchema);

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let reporter: AppUser;
let secondReporter: AppUser;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('content@critterpass.test', ['content']);
  app = harness.app({
    areas: harness.areas((key) => Promise.resolve(`https://media.test/${key}?sig=signed`)),
  });
  ops = await app.signIn('ops@critterpass.test');
  reporter = await harness.signInUser();
  secondReporter = await harness.signInUser();
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function queue(status = 'open') {
  const response = await app.request(`/v1/admin/moderation?status=${status}`, {
    headers: { cookie: ops },
  });
  expect(response.status).toBe(200);
  return pageSchema.parse(await response.json()).items;
}

async function report(user: AppUser, kind: string, id: string) {
  const response = await app.userCommand(user, 'report_content', { kind, id, reason: 'spam' });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: { report_id: string; collapsed: boolean } }).result;
}

async function auditRows(targetId: string) {
  const { rows } = await harness.pool.query<{
    action: string;
    reason: string | null;
    ip_hash: string | null;
  }>('SELECT action, reason, ip_hash FROM ops.admin_audit WHERE target_id = $1', [targetId]);
  return rows;
}

async function decidedEvents(targetId: string) {
  const { rows } = await harness.pool.query<{ payload: { verdict: string } }>(
    "SELECT payload FROM domain_events WHERE type = 'moderation.decided' AND payload->>'target_id' = $1",
    [targetId],
  );
  return rows.map((row) => row.payload.verdict);
}

describe('moderation queue', () => {
  it('shows a reported user with its preview and collapses repeat reports', async () => {
    const target = await harness.signInUser();
    const first = await report(reporter, 'user', target.uid);
    const second = await report(secondReporter, 'user', target.uid);
    const repeat = await report(reporter, 'user', target.uid);
    expect(first.collapsed).toBe(false);
    expect(second).toEqual({ report_id: first.report_id, collapsed: true });
    expect(repeat).toEqual({ report_id: first.report_id, collapsed: true });

    const item = (await queue()).find((entry) => entry.target_id === target.uid);
    expect(item).toMatchObject({
      target_kind: 'user',
      source: 'user',
      report_count: 2,
      verdicts: ['approve', 'ban_author'],
      preview: { type: 'user', status: 'anonymous' },
    });
  });

  it('approves: dismisses the report, one audit row with a hashed IP, one event', async () => {
    const target = await harness.signInUser();
    await report(reporter, 'user', target.uid);
    const response = await app.command(ops, 'moderate_item', {
      kind: 'user',
      id: target.uid,
      verdict: 'approve',
      note: 'Looks fine',
    });
    expect(response.status).toBe(200);

    expect((await queue()).some((entry) => entry.target_id === target.uid)).toBe(false);
    const dismissed = (await queue('dismissed')).find((entry) => entry.target_id === target.uid);
    expect(dismissed).toMatchObject({ verdict: 'approve', decided_by: 'ops@critterpass.test' });
    const audit = await auditRows(target.uid);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'moderate_item', reason: 'Looks fine' });
    expect(audit[0]?.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await decidedEvents(target.uid)).toEqual(['approve']);
  });

  it('bans the author: the account is banned and its session stops working', async () => {
    const target = await harness.signInUser();
    await report(reporter, 'user', target.uid);
    const before = await app.userCommand(target, 'report_content', {
      kind: 'user',
      id: reporter.uid,
      reason: 'harassment',
    });
    expect(before.status).toBe(200);

    const response = await app.command(ops, 'moderate_item', {
      kind: 'user',
      id: target.uid,
      verdict: 'ban_author',
      note: 'Repeated harassment',
    });
    expect(response.status).toBe(200);

    expect(await harness.accounts.account(target.uid)).toMatchObject({
      banned: true,
      banReason: 'Repeated harassment',
      banExpires: null,
    });
    const after = await app.userCommand(target, 'report_content', {
      kind: 'user',
      id: reporter.uid,
      reason: 'harassment',
    });
    expect(after.status).toBe(401);
    expect(await auditRows(target.uid)).toHaveLength(1);
    expect(await decidedEvents(target.uid)).toEqual(['ban_author']);
  });

  it('refuses a verdict the kind cannot carry out and writes nothing', async () => {
    const target = await harness.signInUser();
    await report(reporter, 'user', target.uid);
    const response = await app.command(ops, 'moderate_item', {
      kind: 'user',
      id: target.uid,
      verdict: 'hide',
    });
    expect(response.status).toBe(422);
    expect(await auditRows(target.uid)).toEqual([]);
    expect(await decidedEvents(target.uid)).toEqual([]);
  });

  it('previews an image subject through a signed media URL', async () => {
    const { rows } = await harness.pool.query<{ id: string }>(
      `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256)
       VALUES ($1, 'u/photo-1.jpg', 'image', 1024, 'abc') RETURNING id`,
      [reporter.uid],
    );
    const mediaId = rows[0]?.id ?? '';
    const hidden: string[] = [];
    registerModerationKind({
      kind: 'test_photo',
      verdicts: ['approve', 'hide'],
      exists: () => Promise.resolve(true),
      preview: (tx, id, media) => imagePreview(tx, id, 'Trip photo', media),
      author: () => Promise.resolve(reporter.uid),
      apply: (_tx, id) => {
        hidden.push(id);
        return Promise.resolve();
      },
    });
    await report(secondReporter, 'test_photo', mediaId);
    const item = (await queue()).find((entry) => entry.target_id === mediaId);
    expect(item?.preview).toEqual({
      type: 'image',
      title: 'Trip photo',
      url: 'https://media.test/u/photo-1.jpg?sig=signed',
    });

    const response = await app.command(ops, 'moderate_item', {
      kind: 'test_photo',
      id: mediaId,
      verdict: 'hide',
    });
    expect(response.status).toBe(200);
    expect(hidden).toEqual([mediaId]);
  });

  it('keeps a content operator out of the queue and its verdicts', async () => {
    const content = await app.signIn('content@critterpass.test');
    const read = await app.request('/v1/admin/moderation', { headers: { cookie: content } });
    expect(read.status).toBe(403);
    const target = await harness.signInUser();
    await report(reporter, 'user', target.uid);
    const denied = await app.command(content, 'moderate_item', {
      kind: 'user',
      id: target.uid,
      verdict: 'approve',
    });
    expect(denied.status).toBe(403);
    expect(await auditRows(target.uid)).toEqual([]);
  });
});

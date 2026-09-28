/**
 * What intake records for the moderation screen and author card: the subject's author, the due time
 * from the SLA key, filings per reason, the reporter's screened note, the per-kind queue filter and
 * counts, the author read with past verdicts, and a timed ban from a `ban_author` verdict.
 */
import { moderationAuthorSchema, moderationQueueEntrySchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from './harness';

const pageSchema = z.object({
  items: z.array(moderationQueueEntrySchema),
  next_cursor: z.string().nullable(),
  counts: z.record(z.string(), z.number()),
});

let harness: AdminHarness;
let app: TestApp;
let ops: string;
let reporter: AppUser;
let secondReporter: AppUser;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.pool.query(
    "INSERT INTO ops.ops_config (key, value) VALUES ('moderation.sla_hours', '12')",
  );
  app = harness.app({ areas: harness.areas() });
  ops = await app.signIn('ops@critterpass.test');
  reporter = await harness.signInUser();
  secondReporter = await harness.signInUser();
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function get(path: string) {
  const response = await app.request(`/v1/admin${path}`, { headers: { cookie: ops } });
  expect(response.status).toBe(200);
  return (await response.json()) as unknown;
}

async function report(user: AppUser, id: string, reason: string, note?: string) {
  const response = await app.userCommand(user, 'report_content', {
    kind: 'user',
    id,
    reason,
    ...(note !== undefined ? { note } : {}),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: { report_id: string } }).result.report_id;
}

describe('moderation intake', () => {
  it('records the author, due time, reasons per filing and the screened note', async () => {
    const target = await harness.signInUser();
    const reportId = await report(
      reporter,
      target.uid,
      'spam',
      'Keeps posting call me at +84 912 345 678 or spam@example.com',
    );
    await report(secondReporter, target.uid, 'harassment');
    await report(reporter, target.uid, 'hate');

    const { rows } = await harness.pool.query<{
      author_id: string;
      due_hours: number;
      reason_counts: Record<string, number>;
    }>(
      `SELECT author_id, round(extract(epoch FROM due_at - created_at) / 3600)::int AS due_hours,
              reason_counts
       FROM moderation_reports WHERE id = $1`,
      [reportId],
    );
    expect(rows).toEqual([
      { author_id: target.uid, due_hours: 12, reason_counts: { spam: 1, harassment: 1 } },
    ]);
    const notes = await harness.pool.query<{ note: string | null }>(
      'SELECT note FROM ops.moderation_filings WHERE report_id = $1 ORDER BY filed_at',
      [reportId],
    );
    expect(notes.rows.map((row) => row.note)).toEqual(['Keeps posting call me at or', null]);
  });

  it('filters the queue by kind and counts reports per kind', async () => {
    const all = pageSchema.parse(await get('/moderation'));
    expect(all.counts['user']).toBeGreaterThanOrEqual(1);
    const users = pageSchema.parse(await get('/moderation?kind=user'));
    expect(users.items.every((item) => item.target_kind === 'user')).toBe(true);
    const none = pageSchema.parse(await get('/moderation?kind=trip_photo'));
    expect(none.items).toEqual([]);
    expect(none.counts).toEqual(all.counts);
    expect(users.items[0]).toMatchObject({ reason_counts: expect.any(Object) as unknown });
  });

  it('bans until the verdict expiry and shows the verdict on the author card', async () => {
    const target = await harness.signInUser();
    await report(reporter, target.uid, 'harassment');
    const expires = new Date(Math.ceil(Date.now() / 1000) * 1000 + 7 * 86_400_000);
    const response = await app.command(ops, 'moderate_item', {
      kind: 'user',
      id: target.uid,
      verdict: 'ban_author',
      note: 'Second strike',
      ban: { reason: 'Harassment, 7 days', expires_at: expires.toISOString() },
    });
    expect(response.status).toBe(200);
    const account = await harness.accounts.account(target.uid);
    expect(account).toMatchObject({ banned: true, banReason: 'Harassment, 7 days' });
    expect(
      Math.abs(new Date(String(account?.banExpires)).getTime() - expires.getTime()),
    ).toBeLessThan(2000);

    await report(secondReporter, target.uid, 'spam');
    const author = moderationAuthorSchema.parse(await get(`/moderation/authors/${target.uid}`));
    expect(author).toMatchObject({
      uid: target.uid,
      reports_against: { total: 2, open: 1 },
      verdicts: [{ verdict: 'ban_author', reason: 'harassment' }],
      crews: [],
    });
  });
});

/**
 * `report_content` through the app's `/v1/cmd` door: an anonymous user files a report of a
 * registered subject kind, repeats within 24 h collapse into the open report, and the per-user daily
 * limit, unknown kinds, self-reports and missing subjects are refused.
 */
import { REPORT_DAILY_LIMIT } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type AppUser, type TestApp } from '../admin/harness';

let harness: AdminHarness;
let app: TestApp;
let reporter: AppUser;

beforeAll(async () => {
  harness = await startAdminHarness();
  app = harness.app({ areas: harness.areas() });
  reporter = await harness.signInUser();
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

function reportUser(user: AppUser, id: string, reason = 'spam') {
  return app.userCommand(user, 'report_content', { kind: 'user', id, reason });
}

async function errorCode(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { error?: { code?: string } }).error?.code;
}

async function reportRows(targetId: string) {
  const { rows } = await harness.pool.query<{ report_count: number; status: string }>(
    'SELECT report_count, status FROM moderation_reports WHERE target_id = $1',
    [targetId],
  );
  return rows;
}

describe('report_content', () => {
  it('files a report, and a re-report within 24 h raises the count on the same row', async () => {
    const target = await harness.signInUser();
    const other = await harness.signInUser();
    const first = await reportUser(reporter, target.uid);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: 'applied', result: { collapsed: false } });
    const second = await reportUser(other, target.uid, 'harassment');
    expect(await second.json()).toMatchObject({ result: { collapsed: true } });
    expect(await reportRows(target.uid)).toEqual([{ report_count: 2, status: 'open' }]);
  });

  it('opens a new report once the earlier one is older than 24 h', async () => {
    const target = await harness.signInUser();
    await reportUser(reporter, target.uid);
    await harness.pool.query(
      "UPDATE moderation_reports SET last_reported_at = now() - interval '25 hours' WHERE target_id = $1",
      [target.uid],
    );
    const other = await harness.signInUser();
    const again = await reportUser(other, target.uid);
    expect(await again.json()).toMatchObject({ result: { collapsed: false } });
    expect(await reportRows(target.uid)).toHaveLength(2);
  });

  it('refuses an unknown kind, a self-report and a subject that does not exist', async () => {
    const unknown = await app.userCommand(reporter, 'report_content', {
      kind: 'spaceship',
      id: reporter.uid,
      reason: 'spam',
    });
    expect(unknown.status).toBe(422);
    const self = await reportUser(reporter, reporter.uid);
    expect(self.status).toBe(422);
    const missing = await reportUser(reporter, '0191e1a2-0000-7000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe('NOT_FOUND');
  });

  it(`allows ${REPORT_DAILY_LIMIT} reports per user per rolling day`, async () => {
    const busy = await harness.signInUser();
    await harness.pool.query(
      `WITH made AS (
         INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason)
         SELECT $1, 'user', uuidv7(), 'spam' FROM generate_series(1, $2) RETURNING id
       )
       INSERT INTO ops.moderation_filings (report_id, reporter_id, reason)
       SELECT id, $1, 'spam' FROM made`,
      [busy.uid, REPORT_DAILY_LIMIT],
    );
    const target = await harness.signInUser();
    const limited = await reportUser(busy, target.uid);
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('RATE_LIMITED');
    expect(await reportRows(target.uid)).toEqual([]);

    await harness.pool.query(
      "UPDATE ops.moderation_filings SET filed_at = now() - interval '25 hours' WHERE reporter_id = $1",
      [busy.uid],
    );
    expect((await reportUser(busy, target.uid)).status).toBe(200);
  });
});

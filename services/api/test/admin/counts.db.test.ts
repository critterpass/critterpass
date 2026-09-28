/**
 * `/v1/admin/counts`: one badge per area the caller's roles open, toned by what is overdue or due
 * soon, and the caller's own claimed work.
 */
import { adminCountsSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('content@critterpass.test', ['content']);
  app = harness.app({ areas: harness.areas() });
  for (const hours of [-1, 30]) {
    const target = await harness.signInUser();
    await harness.pool.query(
      `INSERT INTO moderation_reports (source, target_kind, target_id, reason, due_at)
       VALUES ('compliance', 'user', $1, 'spam', now() + make_interval(hours => $2))`,
      [target.uid, hours],
    );
  }
  await harness.pool.query(
    "INSERT INTO ops.concierge_tasks (kind, due_at) VALUES ('review', now() + interval '1 hour')",
  );
}, 240_000);

afterAll(async () => {
  await app.close();
  await harness.stop();
});

async function counts(email: string) {
  const cookie = await app.signIn(email);
  const response = await app.request('/v1/admin/counts', { headers: { cookie } });
  expect(response.status).toBe(200);
  return adminCountsSchema.parse(await response.json());
}

describe('admin counts', () => {
  it('gives ops the moderation and desk badges with their tones', async () => {
    expect(await counts('ops@critterpass.test')).toEqual({
      moderation: { count: 2, tone: 'urgent' },
      desk: { count: 1, tone: 'warn' },
      work: { count: 0, tone: 'plain' },
    });
  });

  it('omits areas the role cannot open', async () => {
    expect(await counts('support@critterpass.test')).toEqual({
      moderation: { count: 2, tone: 'urgent' },
      work: { count: 0, tone: 'plain' },
    });
    expect(await counts('content@critterpass.test')).toEqual({
      work: { count: 0, tone: 'plain' },
    });
  });
});

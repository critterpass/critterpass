/**
 * Feedback tickets in the console over real Postgres: support lists tickets with their triage,
 * marks one replied, and files one under an idea (which closes it); the read never returns device
 * details or attachments; ops cannot run the commands; every change writes one audit row.
 */
import { adminFeedbackResponseSchema, generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAdminHarness, type AdminHarness, type TestApp } from '../admin/harness';

let harness: AdminHarness;
let app: TestApp;
let support: string;
let ops: string;
let reporter: string;

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: harness.areas() });
  support = await app.signIn('support@critterpass.test');
  ops = await app.signIn('ops@critterpass.test');
  reporter = generateUuidV7();
  await harness.pool.query(
    "INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Maya Tran')",
    [reporter],
  );
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

async function ticket(body: string, dueInHours: number): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO feedback_tickets (user_id, mood, category, body, include_device_info, device_info,
       reply_channel, reply_due_at, app_version, sent_at, triage_kind, triage_area, severity,
       triage_summary, tracker_issue_id)
     VALUES ($1, 'meh', 'money', $2, true, '{"model":"iPhone 17"}', 'inbox',
       now() + make_interval(hours => $3), '1.0.3', now(), 'bug', 'money', 'high',
       'Split amounts are wrong', '41')
     RETURNING id`,
    [reporter, body, dueInHours],
  );
  return rows[0]!.id;
}

async function list(status: string) {
  const response = await app.request(`/v1/admin/feedback?status=${status}`, {
    headers: { cookie: support },
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  return { parsed: adminFeedbackResponseSchema.parse(body), raw: JSON.stringify(body) };
}

const audits = async (action: string, id: string) =>
  (
    await harness.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = $1 AND target_id = $2',
      [action, id],
    )
  ).rows[0]?.n;

describe('GET /v1/admin/feedback', () => {
  it('lists tickets soonest due first with their triage, and no device details', async () => {
    const later = await ticket('The split is off by 20000', 40);
    const sooner = await ticket('Balances show the wrong currency', 4);
    const { parsed, raw } = await list('new');
    const ids = parsed.items.map((item) => item.id);
    expect(ids.indexOf(sooner)).toBeLessThan(ids.indexOf(later));
    expect(parsed.items.find((item) => item.id === later)).toMatchObject({
      status: 'new',
      body: 'The split is off by 20000',
      kind: 'bug',
      area: 'money',
      severity: 'high',
      triage_summary: 'Split amounts are wrong',
      tracker_issue_id: '41',
      user_name: 'Maya Tran',
    });
    expect(parsed.counts['new']).toBeGreaterThanOrEqual(2);
    expect(raw).not.toContain('iPhone 17');
  });
});

describe('set_feedback_status', () => {
  it('marks a ticket replied for support, and refuses ops', async () => {
    const id = await ticket('How do I export my trip?', 10);
    const refused = await app.command(ops, 'set_feedback_status', {
      ticket_id: id,
      status: 'replied',
    });
    expect(refused.status).toBe(403);
    const replied = await app.command(support, 'set_feedback_status', {
      ticket_id: id,
      status: 'replied',
    });
    expect(replied.status).toBe(200);
    expect((await list('replied')).parsed.items.map((item) => item.id)).toContain(id);
    expect(await audits('set_feedback_status', id)).toBe(1);
    const tracker = await app.command(support, 'set_feedback_status', {
      ticket_id: id,
      status: 'in_tracker',
    });
    expect(tracker.status).toBe(422);
  });
});

describe('merge_feedback_into_idea', () => {
  it('files a ticket under an open idea and closes it; a declined idea takes none', async () => {
    const id = await ticket('Please add packing lists for the crew', 10);
    const idea = async (status: string) =>
      (
        await harness.pool.query<{ id: string }>(
          "INSERT INTO ideas (title, locale, status) VALUES ($1, 'en', $2) RETURNING id",
          [`Packing lists per crew ${generateUuidV7().slice(-6)}`, status],
        )
      ).rows[0]!.id;
    const declined = await app.command(support, 'merge_feedback_into_idea', {
      ticket_id: id,
      idea_id: await idea('declined'),
    });
    expect(declined.status).toBe(409);
    const open = await idea('open');
    const merged = await app.command(support, 'merge_feedback_into_idea', {
      ticket_id: id,
      idea_id: open,
    });
    expect(merged.status).toBe(200);
    const item = (await list('closed')).parsed.items.find((entry) => entry.id === id);
    expect(item).toMatchObject({ status: 'closed', idea_id: open });
    expect(item?.idea_title).toContain('Packing lists per crew');
    expect(await audits('merge_feedback_into_idea', id)).toBe(1);
  });
});

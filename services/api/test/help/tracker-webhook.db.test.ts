/**
 * The feedback loop's api half against a migrated Postgres: a submitted ticket queues its triage
 * and forward; GitHub's signed `issues` deliveries (the documented payload, signed here) close,
 * reopen and relabel the tickets filed under the issue; a completed close queues the "we fixed it"
 * card once per ticket and a redelivery queues nothing more; a bad signature, another repository
 * or `not planned` tells nobody.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerHelpCommands } from '../../src/commands/help';
import { registerTrackerWebhook } from '../../src/routes/webhooks/tracker';
import { startAccountHarness, type AccountHarness } from '../account/account-harness';

const SECRET = 'test-signing-secret';
const REPO = 'critterpass/feedback';

interface Delivery {
  action: string;
  issue: { number: number; state: string; state_reason: string | null; labels: { name: string }[] };
  repository: { full_name: string };
}

const closed = (): Delivery =>
  JSON.parse(
    readFileSync(new URL('./fixtures/issues-closed.json', import.meta.url), 'utf8'),
  ) as Delivery;

let h: AccountHarness;
let post: (body: string, headers: Record<string, string>) => Promise<Response>;

beforeAll(async () => {
  h = await startAccountHarness({
    extend: (registry, app, deps) => {
      registerHelpCommands(registry);
      registerTrackerWebhook(app, { pool: deps.pool, repo: REPO, secret: SECRET });
      post = (body, headers) =>
        Promise.resolve(app.request('/webhooks/tracker', { method: 'POST', headers, body }));
    },
  });
}, 240_000);

afterAll(async () => {
  await h?.stop();
});

function deliver(delivery: Delivery, options: { secret?: string; event?: string } = {}) {
  const body = JSON.stringify(delivery);
  const signature = createHmac('sha256', options.secret ?? SECRET)
    .update(body)
    .digest('hex');
  return post(body, {
    'content-type': 'application/json',
    'x-github-event': options.event ?? 'issues',
    'x-hub-signature-256': `sha256=${signature}`,
  });
}

async function filed(issue: number, uid: string): Promise<string> {
  const [row] = await h.rows<{ id: string }>(
    `INSERT INTO feedback_tickets (user_id, body, include_device_info, reply_channel,
       reply_due_at, app_version, sent_at, status, tracker_issue_id)
     VALUES ($1, 'The split is wrong', false, 'inbox', now() + interval '2 days', '1.0.3', now(),
       'in_tracker', $2)
     RETURNING id`,
    [uid, String(issue)],
  );
  return row!.id;
}

const ticket = async (id: string) =>
  (
    await h.rows<{
      status: string;
      severity: string | null;
      triage_kind: string | null;
      fixed_in_version: string | null;
    }>(
      'SELECT status, severity, triage_kind, fixed_in_version FROM feedback_tickets WHERE id = $1',
      [id],
    )
  )[0];

const queued = (name: string, ticketId: string) =>
  h.rows<{ data: Record<string, unknown> }>(
    "SELECT data FROM pgboss.job WHERE name = $1 AND data->>'ticket_id' = $2",
    [name, ticketId],
  );

describe('submit_feedback', () => {
  it('queues the triage and forward of the ticket it stored, once', async () => {
    const me = await h.anonymous();
    const payload = {
      id: generateUuidV7(),
      mood: 'meh',
      category: 'money',
      text: 'The split is wrong',
      include_device_info: false,
    };
    expect((await h.cmd(me, 'submit_feedback', payload))[0]).toBe(200);
    expect((await h.cmd(me, 'submit_feedback', payload))[0]).toBe(200);
    expect(await queued('feedback.forward', payload.id)).toEqual([
      { data: { ticket_id: payload.id } },
    ]);
  });
});

describe('POST /webhooks/tracker', () => {
  it('closes every ticket under a completed issue and queues one card each, even on redelivery', async () => {
    const [a, b] = await Promise.all([h.anonymous(), h.anonymous()]);
    const first = await filed(41, a.uid);
    const repeat = await filed(41, b.uid);
    const other = await filed(42, a.uid);

    for (let i = 0; i < 2; i += 1) {
      const response = await deliver(closed());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true, tickets: 2 });
    }
    for (const id of [first, repeat]) {
      expect(await ticket(id)).toEqual({
        status: 'closed',
        severity: 'critical',
        triage_kind: 'bug',
        fixed_in_version: '1.2.0',
      });
      expect(await queued('feedback.fix_shipped', id)).toEqual([
        { data: { ticket_id: id, waited: 0 } },
      ]);
    }
    expect(await ticket(other)).toMatchObject({ status: 'in_tracker', fixed_in_version: null });
    expect(await queued('feedback.fix_shipped', other)).toEqual([]);
  });

  it('reopens the tickets when the issue is reopened', async () => {
    const me = await h.anonymous();
    const id = await filed(50, me.uid);
    const base = closed();
    const issue = { ...base.issue, number: 50, labels: [] };
    await deliver({ ...base, issue });
    expect(await ticket(id)).toMatchObject({ status: 'closed' });
    const reopened = await deliver({
      ...base,
      action: 'reopened',
      issue: { ...issue, state: 'open', state_reason: 'reopened' },
    });
    expect(reopened.status).toBe(200);
    expect(await ticket(id)).toMatchObject({ status: 'in_tracker' });
  });

  it('closes without a card when the issue is not planned', async () => {
    const me = await h.anonymous();
    const id = await filed(51, me.uid);
    const base = closed();
    await deliver({
      ...base,
      issue: { ...base.issue, number: 51, state_reason: 'not_planned', labels: [] },
    });
    expect(await ticket(id)).toMatchObject({ status: 'closed', fixed_in_version: null });
    expect(await queued('feedback.fix_shipped', id)).toEqual([]);
  });

  it('reads a label change onto the tickets without closing them', async () => {
    const me = await h.anonymous();
    const id = await filed(52, me.uid);
    const base = closed();
    await deliver({
      ...base,
      action: 'labeled',
      issue: {
        ...base.issue,
        number: 52,
        state: 'open',
        state_reason: null,
        labels: [{ name: 'severity:high' }, { name: 'severity:made-up' }],
      },
    });
    expect(await ticket(id)).toEqual({
      status: 'in_tracker',
      severity: 'high',
      triage_kind: null,
      fixed_in_version: null,
    });
  });

  it('changes nothing for a bad signature, another repository or another event', async () => {
    const me = await h.anonymous();
    const id = await filed(53, me.uid);
    const base = closed();
    const delivery = { ...base, issue: { ...base.issue, number: 53 } };

    const forged = await deliver(delivery, { secret: 'someone-elses-secret' });
    expect(forged.status).toBe(401);
    expect(await forged.json()).toMatchObject({
      error: { code: 'AUTH_REQUIRED', retryable: false },
    });
    const unsigned = await post(JSON.stringify(delivery), { 'x-github-event': 'issues' });
    expect(unsigned.status).toBe(401);

    const elsewhere = await deliver({
      ...delivery,
      repository: { full_name: 'someone/else' },
    });
    expect(await elsewhere.json()).toEqual({ received: true, tickets: 0 });
    const ping = await deliver(delivery, { event: 'ping' });
    expect(await ping.json()).toEqual({ received: true, tickets: 0 });

    expect(await ticket(id)).toMatchObject({ status: 'in_tracker', fixed_in_version: null });
    expect(await queued('feedback.fix_shipped', id)).toEqual([]);
  });
});

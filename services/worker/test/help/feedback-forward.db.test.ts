/**
 * Feedback triage, the tracker forward and the "we fixed it" card against a migrated Postgres,
 * with GitHub's API answered from fixtures at the fetch boundary and the two model clients stood
 * in for (a typed decision and a one-line summary): a ticket is sorted, summarised and filed as an
 * issue that carries nothing personal; a repeat is added to the first one's issue; a public
 * repository is refused after one look; no tracker means triage only; a failed triage still
 * forwards; and the card reaches the reporter once, only when their app has the fix.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { DecisionClient, Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { HELP_INBOX_KIND } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { feedbackFixShippedJob, forwardFeedback, registerHelpFanouts } from '../../src/jobs/help';
import { tellFixShipped } from '../../src/jobs/help/fix-shipped';
import { createGithubTracker } from '../../src/jobs/help/github';
import { fanOutEvent } from '../../src/jobs/inbox';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const REPO = 'critterpass/feedback';
const TOKEN = 'test-token';

interface Call {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown> | null;
}

/** GitHub at the network boundary: answers from the fixtures and keeps what was sent. */
function github(repoFixture: 'repo-private' | 'repo-public') {
  const calls: Call[] = [];
  const send: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      authorization: new Headers(init?.headers).get('authorization'),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const answer = (status: number, name: string) =>
      Promise.resolve(Response.json(fixture(name), { status }));
    if (method === 'GET' && url === `https://api.github.com/repos/${REPO}`) {
      return answer(200, repoFixture);
    }
    if (method === 'POST' && url === `https://api.github.com/repos/${REPO}/issues`) {
      return answer(201, 'issue-created');
    }
    if (method === 'POST' && url === `https://api.github.com/repos/${REPO}/issues/41/comments`) {
      return answer(201, 'comment-created');
    }
    return Promise.resolve(Response.json({ message: 'Not Found' }, { status: 404 }));
  };
  return { calls, tracker: createGithubTracker({ repo: REPO, token: TOKEN, fetch: send }) };
}

type Answers = Record<string, string>;

/** The typed decision: answers each question asked with the given label, sure of it. */
function decisions(answers: Answers, seen: unknown[] = []): Pick<DecisionClient, 'decide'> {
  return {
    decide: ((route: string, input: { state: unknown; questions: Record<string, unknown> }) => {
      seen.push(input.state);
      return Promise.resolve({
        route,
        answers: Object.fromEntries(
          Object.keys(input.questions).map((key) => [
            key,
            {
              type: 'choice',
              choice: answers[key] ?? 'none',
              probabilities: null,
              confidence: 0.95,
            },
          ]),
        ),
        answered_by: 'jev',
        model: 'jev-test',
        fallbackReason: undefined,
        latencyMs: 1,
        costMicros: 0,
      });
    }) as unknown as DecisionClient['decide'],
  };
}

function summariser(line: string, seen: string[] = []): Pick<Gateway, 'callModel'> {
  return {
    callModel: ((_route: string, input: unknown) => {
      seen.push(JSON.stringify(input));
      return Promise.resolve({
        message: { content: [{ type: 'text', text: line }], stop_reason: 'end_turn' },
      });
    }) as unknown as Gateway['callModel'],
  };
}

let harness: JobsHarness;

async function q<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
}

async function person(name: string, username: string): Promise<string> {
  const id = randomUUID();
  await q(
    "INSERT INTO users (id, status, display_name, username) VALUES ($1, 'registered', $2, $3)",
    [id, name, username],
  );
  return id;
}

async function device(uid: string, appVersion: string): Promise<string> {
  const id = randomUUID();
  await q(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
     VALUES ($1, $2, 'ios', $3, 'en', 'Asia/Ho_Chi_Minh')`,
    [id, uid, appVersion],
  );
  return id;
}

async function ticket(uid: string, body: string, more: Record<string, unknown> = {}) {
  const [row] = await q<{ id: string; ticket_no: string }>(
    `INSERT INTO feedback_tickets (user_id, mood, category, body, include_device_info,
       reply_channel, reply_due_at, app_version, sent_at, status, tracker_issue_id,
       fixed_in_version)
     VALUES ($1, 'meh', 'money', $2, false, 'inbox', now() + interval '2 days', '1.0.3', now(),
       $3, $4, $5)
     RETURNING id, ticket_no`,
    [
      uid,
      body,
      more['status'] ?? 'new',
      more['tracker_issue_id'] ?? null,
      more['fixed_in_version'] ?? null,
    ],
  );
  return { id: row!.id, no: Number(row!.ticket_no) };
}

const stored = async (id: string) =>
  (
    await q<{
      status: string;
      triage_kind: string | null;
      triage_area: string | null;
      severity: string | null;
      triage_summary: string | null;
      duplicate_of: string | null;
      tracker_issue_id: string | null;
      triaged: boolean;
    }>(
      `SELECT status, triage_kind, triage_area, severity, triage_summary, duplicate_of,
              tracker_issue_id, triaged_at IS NOT NULL AS triaged
         FROM feedback_tickets WHERE id = $1`,
      [id],
    )
  )[0]!;

let maya: string;
let jordan: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  registerHelpFanouts();
  // A started runtime is what lets a job queue its own later look.
  await harness.startRuntime([feedbackFixShippedJob()]);
  maya = await person('Maya Tran', 'maya.t');
  jordan = await person('Jordan Lee', 'jordanlee');
  await device(maya, '1.0.3');
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Hoi An Lanterns', $1) RETURNING id",
    [maya],
  );
  for (const uid of [maya, jordan]) {
    await q("INSERT INTO crew_members (crew_id, user_id, status) VALUES ($1, $2, 'active')", [
      crew!.id,
      uid,
    ]);
  }
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

const BODY =
  'Maya here. The split with Jordan Lee in Hoi An Lanterns is wrong: I paid 400000 and it says I ' +
  'owe. Mail me at maya@example.com or call 0905 123 456.';

describe('feedback.forward', () => {
  let first: { id: string; no: number };

  it('sorts and summarises a ticket, then files an issue that names nobody', async () => {
    first = await ticket(maya, BODY);
    const gh = github('repo-private');
    const state: unknown[] = [];
    const prompts: string[] = [];
    const outcome = await forwardFeedback(
      harness.pool,
      {
        ai: {
          decisions: decisions({ kind: 'bug', area: 'money', severity: 'high' }, state),
          gateway: summariser('The split shows the payer as owing money.', prompts),
        },
        tracker: gh.tracker,
      },
      first.id,
      silent,
    );
    expect(outcome).toEqual({ triaged: true, forwarded: 'created', issue: 41 });
    expect(await stored(first.id)).toEqual({
      status: 'in_tracker',
      triage_kind: 'bug',
      triage_area: 'money',
      severity: 'high',
      triage_summary: 'The split shows the payer as owing money.',
      duplicate_of: null,
      tracker_issue_id: '41',
      triaged: true,
    });

    expect(gh.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET https://api.github.com/repos/${REPO}`,
      `POST https://api.github.com/repos/${REPO}/issues`,
    ]);
    const post = gh.calls[1]!;
    expect(post.authorization).toBe(`Bearer ${TOKEN}`);
    expect(post.body?.['title']).toBe(`[CP-${first.no}] The split shows the payer as owing money.`);
    expect(post.body?.['labels']).toEqual(['feedback', 'kind:bug', 'area:money', 'severity:high']);
    const body = String(post.body?.['body']);
    expect(body).toContain(`- Ticket: CP-${first.no}`);
    expect(body).toContain('- App version: 1.0.3');
    expect(body).toContain('- Platform: ios');
    expect(body).toContain('I paid 400000');
    // Nothing personal leaves: not in the issue, and not in what the models were shown.
    const sent = [JSON.stringify(post.body), JSON.stringify(state), ...prompts].join('\n');
    for (const leak of [
      'Maya',
      'Tran',
      'Jordan',
      'Hoi An',
      'Lanterns',
      'example.com',
      '0905',
      maya,
      first.id,
    ]) {
      expect(sent, leak).not.toContain(leak);
    }
  });

  it('files nothing twice when the job runs again', async () => {
    const gh = github('repo-private');
    const outcome = await forwardFeedback(harness.pool, { ai: {}, tracker: gh.tracker }, first.id);
    expect(outcome).toEqual({ triaged: false, forwarded: 'already', issue: 41 });
    expect(gh.calls).toEqual([]);
  });

  it('adds a repeat of a filed ticket to that issue instead of opening another', async () => {
    const repeat = await ticket(
      jordan,
      'The split is wrong, I paid 400000 and it says I owe money',
    );
    const gh = github('repo-private');
    const state: Array<{ earlier_reports?: Record<string, string> }> = [];
    const outcome = await forwardFeedback(
      harness.pool,
      {
        ai: {
          decisions: decisions(
            { kind: 'bug', area: 'money', severity: 'high', duplicate: 'a' },
            state,
          ),
        },
        tracker: gh.tracker,
      },
      repeat.id,
    );
    expect(Object.keys(state[0]?.earlier_reports ?? {})).toEqual(['a']);
    expect(outcome).toEqual({ triaged: true, forwarded: 'commented', issue: 41 });
    expect(gh.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET https://api.github.com/repos/${REPO}`,
      `POST https://api.github.com/repos/${REPO}/issues/41/comments`,
    ]);
    expect(String(gh.calls[1]?.body?.['body'])).toContain(`Another report: CP-${repeat.no}`);
    const row = await stored(repeat.id);
    expect(row).toMatchObject({
      duplicate_of: first.id,
      tracker_issue_id: '41',
      status: 'in_tracker',
    });
  });

  it('refuses a public repository after looking once, and leaves the tickets in the console', async () => {
    const gh = github('repo-public');
    const one = await ticket(maya, 'Maps are slow to load on the day view');
    const two = await ticket(maya, 'Please add a dark theme for night buses');
    for (const t of [one, two]) {
      const outcome = await forwardFeedback(
        harness.pool,
        {
          ai: { decisions: decisions({ kind: 'bug', area: 'maps', severity: 'low' }) },
          tracker: gh.tracker,
        },
        t.id,
        silent,
      );
      expect(outcome).toEqual({ triaged: true, forwarded: 'refused_public', issue: null });
    }
    expect(gh.calls.map((call) => call.method)).toEqual(['GET']);
    expect(await stored(one.id)).toMatchObject({
      status: 'new',
      tracker_issue_id: null,
      triage_area: 'maps',
    });
  });

  it('only triages when no tracker is configured', async () => {
    const t = await ticket(maya, 'How do I change the currency of a trip?');
    const outcome = await forwardFeedback(
      harness.pool,
      { ai: { decisions: decisions({ kind: 'question', area: 'money', severity: 'low' }) } },
      t.id,
    );
    expect(outcome).toEqual({ triaged: true, forwarded: 'off', issue: null });
    expect(await stored(t.id)).toMatchObject({
      status: 'new',
      triage_kind: 'question',
      tracker_issue_id: null,
    });
  });

  it('still files a ticket whose triage could not be had, untriaged', async () => {
    const t = await ticket(maya, 'Critter eggs never hatch after the flight lands');
    const gh = github('repo-private');
    const failing: Pick<DecisionClient, 'decide'> = {
      decide: () => Promise.reject(new Error('AI_UNAVAILABLE')),
    };
    const outcome = await forwardFeedback(
      harness.pool,
      { ai: { decisions: failing }, tracker: gh.tracker },
      t.id,
    );
    expect(outcome).toEqual({ triaged: false, forwarded: 'created', issue: 41 });
    expect(gh.calls[1]?.body?.['labels']).toEqual(['feedback']);
    expect(await stored(t.id)).toMatchObject({ triaged: false, status: 'in_tracker' });
  });
});

describe('feedback.fix_shipped', () => {
  const cards = (uid: string) =>
    q<{ data: Record<string, unknown>; needs_you: boolean }>(
      'SELECT data, needs_you FROM inbox_items WHERE user_id = $1 AND kind = $2',
      [uid, HELP_INBOX_KIND.fixShipped],
    );
  const tell = (id: string) =>
    withSystem(harness.pool, (tx) => tellFixShipped(tx, { ticket_id: id, waited: 0 }));
  async function fanOut(ticketId: string): Promise<void> {
    const { rows: events } = await harness.pool.query<{ id: string }>(
      "SELECT id FROM domain_events WHERE type = 'feedback.fix_shipped' AND aggregate_id = $1",
      [ticketId],
    );
    expect(events).toHaveLength(1);
    await fanOutEvent(harness.pool, events[0]!.id);
  }

  it('waits for the reporter to install the fixed version, then tells them once', async () => {
    const reporter = await person('Linh Pham', 'linh.p');
    const phone = await device(reporter, '1.1.0');
    const t = await ticket(reporter, 'Forecast check is missing', {
      status: 'closed',
      tracker_issue_id: '77',
      fixed_in_version: '1.2.0',
    });

    expect(await tell(t.id)).toBe('waiting');
    expect(await cards(reporter)).toEqual([]);
    const later = await harness.pool.query<{ data: { waited: number }; soon: boolean }>(
      `SELECT data, start_after < now() + interval '23 hours' AS soon FROM pgboss.job
        WHERE name = 'feedback.fix_shipped' AND data->>'ticket_id' = $1`,
      [t.id],
    );
    expect(later.rows).toEqual([{ data: { ticket_id: t.id, waited: 1 }, soon: false }]);

    await q("UPDATE devices SET app_version = '1.10.0' WHERE id = $1", [phone]);
    expect(await tell(t.id)).toBe('told');
    await fanOut(t.id);
    expect(await cards(reporter)).toEqual([
      { data: { ticket_no: t.no, fixed_in_version: '1.2.0' }, needs_you: false },
    ]);
    expect(await cards(maya)).toEqual([]);

    expect(await tell(t.id)).toBe('skipped');
    await fanOut(t.id);
    expect(await cards(reporter)).toHaveLength(1);
  });

  it('tells the reporter at once when the issue names no version', async () => {
    const reporter = await person('Sam Okoro', 'sam.o');
    const t = await ticket(reporter, 'Votes show the wrong winner', {
      status: 'closed',
      tracker_issue_id: '78',
    });
    expect(await tell(t.id)).toBe('told');
    await fanOut(t.id);
    expect(await cards(reporter)).toEqual([
      { data: { ticket_no: t.no, fixed_in_version: null }, needs_you: false },
    ]);
  });

  it('tells nobody about a ticket that is open again', async () => {
    const reporter = await person('Ana Ruiz', 'ana.r');
    const t = await ticket(reporter, 'Chat scrolls to the top', {
      status: 'in_tracker',
      tracker_issue_id: '79',
    });
    expect(await tell(t.id)).toBe('skipped');
    expect(await cards(reporter)).toEqual([]);
  });
});

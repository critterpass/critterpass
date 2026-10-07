/**
 * The external purge and the purge reminder against a real migrated Postgres and a real job
 * runtime: a purged account is handed on and erased from every store, an account that is only
 * closed is never touched, and the reminder finds exactly the accounts three days from their purge.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { purgeDueAccounts } from '../../src/jobs/account/purge';
import {
  accountPurgeExternalJob,
  enqueueRecentExternalPurges,
  isPurged,
} from '../../src/jobs/account/purge-external';
import type { EmailMessage, EmailSender } from '../../src/jobs/account/email-sender';
import { remindDuePurges } from '../../src/jobs/account/purge-reminder';
import { silent, startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';
import { PURGE_UID, vendorDouble, type VendorDouble } from './purge-vendors';

let harness: JobsHarness;
let vendors: VendorDouble;
const q = (sql: string, params: unknown[] = []) => harness.pool.query(sql, params);

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  vendors = vendorDouble();
  vi.stubGlobal('fetch', vendors.fetch);
});

afterEach(async () => {
  await harness.stopAll();
  vi.unstubAllGlobals();
});

/** A closed account whose purge is `purgeIn` away (negative = due); answers its deletion id. */
async function closed(uid: string, purgeIn: string): Promise<string> {
  await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'closed', 'Mai')", [uid]);
  const { rows } = await q(
    `INSERT INTO account_deletions (user_id, purge_at, source)
     VALUES ($1, now() + $2::interval, 'app') RETURNING id`,
    [uid, purgeIn],
  );
  return (rows[0] as { id: string }).id;
}

async function externalJobs(uid: string): Promise<{ state: string; output: unknown }[]> {
  const { rows } = await q(
    `SELECT state::text AS state, output FROM pgboss.job
      WHERE name = 'account.purge_external' AND data->>'user_id' = $1`,
    [uid],
  );
  return rows as { state: string; output: unknown }[];
}

describe('account.purge_external', () => {
  it('erases a purged account from every store and leaves a closed one alone', async () => {
    const waiting = randomUUID();
    const deletionId = await closed(PURGE_UID, '-1 hour');
    const waitingDeletion = await closed(waiting, '12 days');
    await harness.startRuntime([accountPurgeExternalJob(vendors.stores())]);

    expect(await purgeDueAccounts(harness.pool, silent)).toEqual({ purged: 1, failed: 0 });
    expect(await isPurged(harness.pool, PURGE_UID, deletionId)).toBe(true);
    expect(await isPurged(harness.pool, waiting, waitingDeletion)).toBe(false);

    expect(await withSystem(harness.pool, (tx) => enqueueRecentExternalPurges(tx))).toBe(1);
    await until(
      async () => (await externalJobs(PURGE_UID)).some((job) => job.state === 'completed'),
      15_000,
    );
    const [job] = await externalJobs(PURGE_UID);
    expect(job?.output).toMatchObject({
      media: 'erased',
      analytics: 'erased',
      ai_traces: 'erased',
    });
    expect(await externalJobs(waiting)).toEqual([]);
    expect(vendors.calls.filter((call) => call.startsWith('DELETE'))).toHaveLength(5);
    expect(vendors.calls.join(' ')).not.toContain(waiting);
  });

  it('removes the media rows and redacts the filed feedback of a purged account', async () => {
    const uid = randomUUID();
    const other = randomUUID();
    await closed(uid, '-1 hour');
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Bao')", [
      other,
    ]);
    for (const owner of [uid, other]) {
      await q(
        `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256)
         VALUES ($1, $2, 'image/jpeg', 10, repeat('a', 64))`,
        [owner, `u/${owner}/avatar/1`],
      );
    }
    await q(
      `INSERT INTO feedback_tickets (user_id, ticket_no, body, include_device_info, reply_channel,
         reply_due_at, app_version, sent_at, tracker_issue_id, status)
       VALUES ($1, 1207, 'One dong short.', false, 'inbox', now() + interval '2 days', '1.0.0',
         now(), '41', 'in_tracker')`,
      [uid],
    );
    // The tracker at the network boundary: the issue this ticket opened, then its redaction.
    const patches: unknown[] = [];
    const tracker: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method === 'PATCH') {
        patches.push(await request.json());
        return Response.json({});
      }
      return new Response(
        readFileSync(
          new URL('../fixtures/account-purge/github-issue-own.json', import.meta.url),
          'utf8',
        ),
        { headers: { 'content-type': 'application/json' } },
      );
    };
    await harness.startRuntime([
      accountPurgeExternalJob({
        ...vendors.stores(),
        tracker: { repo: 'critterpass/feedback', token: 'test-token', fetch: tracker },
      }),
    ]);

    expect(await purgeDueAccounts(harness.pool, silent, uid)).toEqual({ purged: 1, failed: 0 });
    await withSystem(harness.pool, (tx) => enqueueRecentExternalPurges(tx));
    await until(
      async () => (await externalJobs(uid)).some((job) => job.state === 'completed'),
      15_000,
    );
    const [job] = await externalJobs(uid);
    expect(job?.output).toMatchObject({
      media: 'erased',
      quarantined_uploads: 'held',
      feedback_tracker: 'erased',
    });
    const left = await q('SELECT owner_id FROM media_objects WHERE owner_id = ANY ($1::uuid[])', [
      [uid, other],
    ]);
    expect(left.rows).toEqual([{ owner_id: other }]);
    expect(patches).toHaveLength(1);
    expect(JSON.stringify(patches)).not.toContain('dong');
    expect((await q('SELECT 1 FROM feedback_tracker_redactions')).rows).toEqual([]);
  });
});

describe('account.purge_reminder', () => {
  it('e-mails the accounts two to three days from their purge, once each', async () => {
    const soon = randomUUID();
    const later = randomUUID();
    const tomorrow = randomUUID();
    const restored = randomUUID();
    await closed(soon, '2 days 12 hours');
    await closed(later, '9 days');
    await closed(tomorrow, '1 day');
    const restoredDeletion = await closed(restored, '2 days 12 hours');
    await q('UPDATE account_deletions SET restored_at = now() WHERE id = $1', [restoredDeletion]);

    // The owner signed in with an e-mail address and reads Vietnamese.
    await q('INSERT INTO auth."user" (id, name, email) VALUES ($1, $2, $3)', [
      soon,
      'Mai',
      `mai-${soon}@example.com`,
    ]);
    await q("UPDATE users SET locale = 'vi' WHERE id = $1", [soon]);

    // Without a sender nothing is recorded and nothing fails.
    expect(await remindDuePurges(harness.pool, silent, null)).toEqual({
      due: 1,
      delivered: 0,
      no_address: 0,
      already: 0,
      not_configured: 1,
      failed: 0,
    });

    const sent: EmailMessage[] = [];
    let refuse = true;
    const email: EmailSender = {
      send(message) {
        if (refuse) return Promise.reject(new Error('refused'));
        sent.push(message);
        return Promise.resolve();
      },
    };
    // A refusal fails the reminder and leaves it to be sent by the retry.
    expect(await remindDuePurges(harness.pool, silent, email)).toMatchObject({ failed: 1 });
    refuse = false;
    expect(await remindDuePurges(harness.pool, silent, email)).toMatchObject({ delivered: 1 });
    expect(await remindDuePurges(harness.pool, silent, email)).toMatchObject({
      delivered: 0,
      already: 1,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(`mai-${soon}@example.com`);
    expect(sent[0]?.subject).toContain('Tài khoản CritterPass');
    expect(sent[0]?.idempotencyKey).toContain('purge-reminder/');

    // A day later the same account is outside the window: it is found on one daily run only.
    const nextDay = new Date(Date.now() + 86_400_000);
    expect((await remindDuePurges(harness.pool, silent, null, nextDay)).due).toBe(0);
  });
});

describe('account.purge_reminder without an address', () => {
  it('records an account that signed in by phone only, and sends nothing', async () => {
    const phoneOnly = randomUUID();
    await closed(phoneOnly, '2 days 6 hours');
    await q('INSERT INTO auth."user" (id, name, email) VALUES ($1, $2, $3)', [
      phoneOnly,
      'Bao',
      `temp-${phoneOnly}@anonymous.placeholder.invalid`,
    ]);
    const sent: EmailMessage[] = [];
    const email: EmailSender = {
      send(message) {
        sent.push(message);
        return Promise.resolve();
      },
    };
    const report = await remindDuePurges(harness.pool, silent, email);
    expect(report.no_address).toBeGreaterThanOrEqual(1);
    expect(sent.map((message) => message.to).join(' ')).not.toContain('placeholder');
  });
});

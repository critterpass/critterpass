/**
 * `vendor.reply_parse` against a migrated Postgres, with live DeepSeek recordings at the network
 * boundary (the `imported_text` screen and the `vendor.reply_intent` twin for "ok 13:50 bisa").
 * The reply reads as yes with the time written in it, once; with no model a person at the desk
 * reads it and the task says so. Nothing else changes: no booking, no expense, no message out.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createDecisionClient, createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseVendorReply } from '../../src/jobs/suppliers/vendor-reply-parse';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
const ASKED = 'Hello, could you hold a table for 6 for lunch today at 13:50?';

function recorded(file: string): Response {
  const { response } = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as {
    response: { status: number; body: unknown };
  };
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { 'content-type': 'application/json' },
  });
}

const calls: string[] = [];
const decisions = createDecisionClient({
  gateway: createGateway({
    apiKey: 'replay',
    maxAttempts: 1,
    fetch: (_url, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      const file = body.includes('asked')
        ? 'reply-intent-ok-1350-bisa.json'
        : 'reply-screen-ok-1350-bisa.json';
      calls.push(file);
      return Promise.resolve(recorded(file));
    },
  }),
});

let harness: JobsHarness;
let tripId: string;
let threadId: string;
let taskId: string;

async function inbound(body: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, proposed_by, body, status,
       wa_message_id)
     VALUES ($1, $2, 'inbound', 'vendor', $3, 'received', $4) RETURNING id`,
    [threadId, tripId, body, `wamid.${randomUUID()}`],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  const user = randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [user]);
  const crew = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Reply crew', $1) RETURNING id",
    [user],
  );
  const trip = await harness.pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew.rows[0]!.id],
  );
  tripId = trip.rows[0]!.id;
  const destination = await harness.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name) VALUES ($1, 'Bali') RETURNING id",
    [`bali-${randomUUID().slice(0, 8)}`],
  );
  const poi = await harness.pool.query<{ id: string }>(
    "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Locavore', 'food', -8.5, 115.26) RETURNING id",
    [destination.rows[0]!.id],
  );
  const task = await harness.pool.query<{ id: string }>(
    "INSERT INTO ops.concierge_tasks (kind, trip_id, requested_by, status) VALUES ('vendor_message', $1, $2, 'in_progress') RETURNING id",
    [tripId, user],
  );
  taskId = task.rows[0]!.id;
  const thread = await harness.pool.query<{ id: string }>(
    `INSERT INTO ops.vendor_threads (trip_id, requested_by, poi_id, vendor_name, channel, task_id)
     VALUES ($1, $2, $3, 'Locavore', 'whatsapp_business', $4) RETURNING id`,
    [tripId, user, poi.rows[0]!.id, taskId],
  );
  threadId = thread.rows[0]!.id;
  // What the desk sent: approved as shown, so the trigger lets it be marked sent.
  const sent = randomUUID();
  const approval = randomUUID();
  await harness.pool.query(
    `INSERT INTO ops.vendor_messages (id, thread_id, trip_id, direction, body, status)
     VALUES ($1, $2, $3, 'outbound', $4, 'draft')`,
    [sent, threadId, tripId, ASKED],
  );
  await harness.pool.query(
    `INSERT INTO ops.approvals (id, user_id, subject_kind, subject_id, text_shown)
     VALUES ($1, $2, 'vendor_message', $3, $4)`,
    [approval, user, sent, ASKED],
  );
  await harness.pool.query(
    `UPDATE ops.vendor_messages SET status = 'sent', sent_at = now(), approved_by_user_id = $2,
       approved_at = now(), approval_id = $3,
       approved_text_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex')
     WHERE id = $1`,
    [sent, user, approval],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

async function replyOf(id: string) {
  const { rows } = await harness.pool.query<{ reply: unknown }>(
    'SELECT reply FROM ops.vendor_messages WHERE id = $1',
    [id],
  );
  return rows[0]?.reply;
}

describe('vendor reply parse', () => {
  it('reads "ok 13:50 bisa" as yes with its time, once', async () => {
    const id = await inbound('ok 13:50 bisa');
    expect(await parseVendorReply(harness.pool, id, decisions)).toBe('parsed');
    expect(await replyOf(id)).toEqual({
      intent: 'yes',
      times: ['13:50'],
      prices: [],
      needs_person: false,
    });
    expect(calls).toEqual(['reply-screen-ok-1350-bisa.json', 'reply-intent-ok-1350-bisa.json']);
    expect(await parseVendorReply(harness.pool, id, decisions)).toBe('gone');
    expect(calls).toHaveLength(2);
    const events = await harness.pool.query(
      "SELECT payload->>'intent' AS intent FROM domain_events WHERE type = 'vendor_msg.reply_parsed' AND aggregate_id = $1",
      [id],
    );
    expect(events.rows).toEqual([{ intent: 'yes' }]);
    const out = await harness.pool.query(
      "SELECT count(*)::int AS n FROM ops.vendor_messages WHERE thread_id = $1 AND direction = 'outbound'",
      [threadId],
    );
    expect(out.rows[0]).toEqual({ n: 1 });
  });

  it('hands the reply to a person at the desk when no model can read it', async () => {
    const id = await inbound('Bisa jam 2 siang, Rp 450k ya');
    expect(await parseVendorReply(harness.pool, id, undefined)).toBe('person');
    expect(await replyOf(id)).toEqual({
      intent: 'unclear',
      times: [],
      prices: ['Rp 450k'],
      needs_person: true,
    });
    const { rows } = await harness.pool.query<{ notes: { text: string }[] }>(
      'SELECT notes FROM ops.concierge_tasks WHERE id = $1',
      [taskId],
    );
    expect(rows[0]!.notes.map((note) => note.text)).toContain(
      "Locavore's reply needs a person to read it",
    );
  });
});

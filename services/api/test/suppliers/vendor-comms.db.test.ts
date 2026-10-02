/**
 * Vendor messages on the real stack, with Meta's published Cloud API samples at the network
 * boundary. While the desk's WhatsApp Business number is off, a draft goes back to the traveller
 * with a share link and nothing can be sent. With it on: only the requester approves, only the
 * exact text they saw; the desk sends only an approved text (the handler and the database both
 * refuse anything else, and an edit is a new draft that voids the approval); the webhook refuses a
 * bad signature, files a vendor's reply verbatim once and queues its reading, and moves delivery
 * statuses forward.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { withSystem } from '@cp/db';
import {
  generateUuidV7,
  type ApproveVendorMessageResult,
  type RequestVendorMessageResult,
} from '@cp/domain';
import { createSupplierHttp, createWhatsAppBusinessClient } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSupplierCommands } from '../../src/commands/suppliers';
import { sendVendorMessage } from '../../src/commands/suppliers/send-vendor-message';
import { registerVendorWebhookRoutes } from '../../src/routes/webhooks/whatsapp-vendor';
import { sealContact, type VendorDeps } from '../../src/suppliers/vendor-store';
import { registerVendorThreadsRoute } from '../../src/suppliers/vendor-threads-route';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../packages/suppliers/test/whatsapp/fixtures',
);
const read = (file: string) => readFileSync(path.join(FIXTURES, file), 'utf8');
const sent: string[] = [];

function metaFetch(_input: string | URL, init?: RequestInit): Promise<Response> {
  sent.push(typeof init?.body === 'string' ? init.body : '');
  return Promise.resolve(new Response(read('messages-send-published-sample.json')));
}

const APP_SECRET = 'app-secret';
const deps: VendorDeps = {
  whatsapp: createWhatsAppBusinessClient(
    createSupplierHttp({ fetch: metaFetch, audit: () => Promise.resolve() }),
    { phoneNumberId: '106540352242922', accessToken: 'token' },
  ),
  keyring: { activeKeyId: 'k1', keys: { k1: Buffer.alloc(32, 7) } },
  pepper: 'pepper',
};
const TEXT = 'Could you hold a table for 6 at 21:00 tonight? Thank you!';

let harness: MoneyHarness;
let crew: MoneyCrew;
let poiId: string;

beforeAll(async () => {
  harness = await startMoneyHarness(
    (registry) =>
      registerSupplierCommands(registry, {
        http: createSupplierHttp({ fetch: metaFetch, audit: () => Promise.resolve() }),
        links: {},
        port: undefined,
        vendor: deps,
      }),
    (app, doors) => {
      registerVendorThreadsRoute(app, doors);
      registerVendorWebhookRoutes(app, {
        pool: doors.pool,
        appSecret: APP_SECRET,
        verifyToken: 'verify',
        pepper: 'pepper',
      });
    },
  );
  crew = await buildMoneyCrew(harness, 3);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     SELECT destination_id, 'Locavore', 'food', -8.51, 115.26 FROM trips WHERE id = $1
     RETURNING id`,
    [crew.tripId],
  );
  poiId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const members = () => crew.members as [SignedIn, SignedIn, SignedIn];

async function deskSwitch(on: boolean, staffed = on): Promise<void> {
  await harness.pool.query(
    "UPDATE ops.partner_adapters SET enabled = $1 WHERE partner = 'whatsapp_business'",
    [on],
  );
  await harness.pool.query(
    `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('safety.ops_desk', $1::jsonb, true)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(staffed)],
  );
}

function request(text = TEXT) {
  return {
    draft_id: generateUuidV7(),
    trip_id: crew.tripId,
    vendor: { kind: 'poi', id: poiId },
    vendor_name: 'Locavore',
    intent: 'reserve',
    draft_text: text,
  };
}

const send = (draftId: string) =>
  withSystem(harness.pool, (tx) =>
    sendVendorMessage(tx, deps, { draftId, adminUid: generateUuidV7(), now: new Date() }),
  );

async function status(id: string): Promise<string> {
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM ops.vendor_messages WHERE id = $1',
    [id],
  );
  return rows[0]!.status;
}

describe('while the desk number is off', () => {
  it('gives the traveller the text and a share link, and nothing can be approved or sent', async () => {
    await deskSwitch(false);
    const payload = request();
    const draft = resultOf<RequestVendorMessageResult>(
      await harness.run(members()[0], 'request_vendor_message', payload),
    );
    expect(draft).toMatchObject({ channel: 'self_send', status: 'draft' });
    expect(draft.share?.wa_link).toBe(`https://wa.me/?text=${encodeURIComponent(TEXT)}`);
    const approve = await harness.run(members()[0], 'approve_vendor_message', {
      draft_id: payload.draft_id,
      text: TEXT,
    });
    expect(errorOf(approve)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'self_send' },
    });
    await expect(send(payload.draft_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });
});

describe('with the desk number on but nobody at the desk', () => {
  it('still hands the traveller the text to send themselves', async () => {
    await deskSwitch(true, false);
    const payload = request();
    const draft = resultOf<RequestVendorMessageResult>(
      await harness.run(members()[0], 'request_vendor_message', payload),
    );
    expect(draft).toMatchObject({ channel: 'self_send', status: 'draft' });
    expect(draft.share?.wa_link).toBe(`https://wa.me/?text=${encodeURIComponent(TEXT)}`);
    await expect(send(payload.draft_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });
});

describe('with the desk number on', () => {
  beforeAll(() => deskSwitch(true));

  it('approves only for the requester and only the exact text, then the desk sends it', async () => {
    const [maya, dev] = members();
    const payload = request();
    const draft = resultOf<RequestVendorMessageResult>(
      await harness.run(maya, 'request_vendor_message', payload),
    );
    expect(draft).toMatchObject({ channel: 'whatsapp_business', share: null });
    await expect(send(payload.draft_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    const byOther = await harness.run(dev, 'approve_vendor_message', {
      draft_id: payload.draft_id,
      text: TEXT,
    });
    expect(errorOf(byOther).code).toBe('NOT_FOUND');
    const changed = await harness.run(maya, 'approve_vendor_message', {
      draft_id: payload.draft_id,
      text: `${TEXT.slice(0, -1)}.`,
    });
    expect(errorOf(changed)).toMatchObject({ detail: { reason: 'text_changed' } });
    const approved = resultOf<ApproveVendorMessageResult>(
      await harness.run(maya, 'approve_vendor_message', { draft_id: payload.draft_id, text: TEXT }),
    );
    expect(approved).toMatchObject({ status: 'approved', desk_hours: { tz: 'Asia/Singapore' } });
    const task = await harness.pool.query(
      'SELECT kind, requested_by, approval_id IS NOT NULL AS approved FROM ops.concierge_tasks WHERE id = $1',
      [approved.task_id],
    );
    expect(task.rows).toEqual([{ kind: 'vendor_message', requested_by: maya.uid, approved: true }]);

    await expect(send(payload.draft_id)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'no_contact' },
    });
    const contact = sealContact(deps, '+6281234567890');
    await harness.pool.query(
      'UPDATE ops.vendor_threads SET wa_contact_enc = $2, wa_contact_hash = $3 WHERE id = $1',
      [draft.thread_id, contact.enc, contact.hash],
    );
    const before = sent.length;
    const first = await send(payload.draft_id);
    const again = await send(payload.draft_id);
    expect(first).toMatchObject({ status: 'sent', template: 'traveller_request' });
    expect(again).toEqual(first);
    expect(sent.length).toBe(before + 1);
    expect(JSON.parse(sent.at(-1)!)).toMatchObject({
      to: '6281234567890',
      template: { components: [{ parameters: [{ text: TEXT }] }] },
    });
    const notes = await harness.pool.query<{ notes: { text: string }[] }>(
      'SELECT notes FROM ops.concierge_tasks WHERE id = $1',
      [approved.task_id],
    );
    expect(notes.rows[0]!.notes.map((note) => note.text)).toContain('Sent the approved text');
  });

  it('voids the approval when the traveller edits the text, and the old text can never leave', async () => {
    const [maya] = members();
    const first = request('Table for 4 at 20:00?');
    await harness.run(maya, 'request_vendor_message', first);
    await harness.run(maya, 'approve_vendor_message', {
      draft_id: first.draft_id,
      text: first.draft_text,
    });
    const edited = request('Table for 5 at 20:00?');
    await harness.run(maya, 'request_vendor_message', edited);
    expect(await status(first.draft_id)).toBe('superseded');
    await expect(send(first.draft_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    await expect(send(edited.draft_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    await expect(
      harness.pool.query("UPDATE ops.vendor_messages SET status = 'sent' WHERE id = $1", [
        edited.draft_id,
      ]),
    ).rejects.toThrow(/not approved/);
  });
});

describe('the WhatsApp webhook', () => {
  const sign = (raw: string, secret = APP_SECRET) =>
    `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const post = (raw: string, signature: string) =>
    harness.request('/webhooks/whatsapp/vendor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      body: raw,
    });

  it('refuses a bad signature and changes nothing', async () => {
    const raw = read('webhook-text-message-published-sample.json');
    const response = await post(raw, sign(raw, 'someone-else'));
    expect(response.status).toBe(401);
    const { rows } = await harness.pool.query(
      "SELECT 1 FROM ops.vendor_messages WHERE direction = 'inbound'",
    );
    expect(rows).toHaveLength(0);
  });

  it("files the vendor's reply verbatim once, queues its reading and moves statuses forward", async () => {
    const raw = read('webhook-text-message-published-sample.json');
    const first = await post(raw, sign(raw));
    const again = await post(raw, sign(raw));
    expect(await first.json()).toMatchObject({ replies: 1, unmatched: 0 });
    expect(await again.json()).toMatchObject({ replies: 0 });
    const { rows } = await harness.pool.query<{ id: string; body: string }>(
      "SELECT id, body FROM ops.vendor_messages WHERE direction = 'inbound'",
    );
    expect(rows.map((row) => row.body)).toEqual(['ok 13:50 bisa']);
    const jobs = await harness.pool.query(
      "SELECT data FROM pgboss.job WHERE name = 'vendor.reply_parse'",
    );
    expect(jobs.rows).toEqual([{ data: { message_id: rows[0]!.id } }]);

    const delivered = read('webhook-status-delivered-published-sample.json');
    expect(await (await post(delivered, sign(delivered))).json()).toMatchObject({ statuses: 1 });

    const threads = await harness.request(`/v1/trips/${crew.tripId}/vendor-threads`, {
      headers: { cookie: members()[0].cookie },
    });
    const body = (await threads.json()) as {
      threads: {
        status: string;
        messages: { direction: string; body: string; status: string }[];
      }[];
    };
    const replied = body.threads.find((thread) => thread.status === 'replied');
    expect(replied?.messages.map((m) => [m.direction, m.status])).toEqual([
      ['outbound', 'delivered'],
      ['outbound', 'draft'],
      ['inbound', 'received'],
    ]);
  });
});

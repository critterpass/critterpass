/**
 * Printed mailings against a migrated Postgres, the printer answered from its documented responses
 * at the HTTP boundary: a mailing becomes one order per recipient with their opened address and the
 * print-ready files; an address gone fails that recipient alone; a printer refusing every order
 * fails the mailing (the payer's trip mailing is free again) and tells them; a printer that is
 * down is retried and fails the waiting orders only on the last attempt; a status moves only when
 * the order is re-read from the printer.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { crypto as dbCrypto, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fulfilMailing, refreshMailing, type FulfilDeps } from '../../src/jobs/postcards/fulfil';
import { createPrintRenderer } from '../../src/print/render';
import { createProdigiVendor } from '../../src/print/vendor';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const keyring = { activeKeyId: 'k1', keys: { k1: Buffer.alloc(32, 5) } };

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: Record<string, unknown> | null;
}

/** The printer at the HTTP boundary: answers each call with the next queued response. */
function printer(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetchDouble = (input: string | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(input),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const next = responses.shift() ?? { status: 503, body: {} };
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
  };
  const vendor = createProdigiVendor({
    apiKey: 'test-key',
    baseUrl: 'https://api.sandbox.prodigi.com/v4.0',
    sku: 'GLOBAL-POST-MOH-6X4',
    fetch: fetchDouble as unknown as typeof fetch,
  });
  return { vendor, calls };
}

let harness: JobsHarness;
let tripId: string;
let payer: string;
let ben: string;
let cleo: string;
let postcardId: string;
const objects = new Map<string, Uint8Array>();
const store = {
  get: (key: string) => {
    const bytes = objects.get(key);
    return Promise.resolve(bytes === undefined ? null : { bytes, contentType: 'image/png' });
  },
  put: (key: string, bytes: Uint8Array) => {
    objects.set(key, bytes);
    return Promise.resolve();
  },
};
const render = createPrintRenderer(store, {
  baseUrl: 'https://media.test',
  keyId: 'm1',
  secret: 's'.repeat(32),
});

async function q<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
}

/** `domain_events` is read as the pool's own role (the app's roles cannot select it). */
async function events<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function user(name: string): Promise<string> {
  const id = randomUUID();
  await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [id, name]);
  return id;
}

async function saveAddress(uid: string, country: string): Promise<void> {
  const fields = {
    name: 'Ben Tran',
    line1: '12 Lê Lợi',
    city: 'Đà Nẵng',
    postal_code: '550000',
    country,
  };
  await q(
    `INSERT INTO mailing_addresses (user_id, fields_enc, country) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET fields_enc = EXCLUDED.fields_enc, country = EXCLUDED.country`,
    [uid, dbCrypto.encryptField(JSON.stringify(fields), keyring), country],
  );
}

async function mailing(recipients: string[]): Promise<string> {
  const id = randomUUID();
  const orders = Object.fromEntries(
    recipients.map((uid) => [
      uid,
      { ref: null, status: 'queued', updated_at: '2026-10-06T00:00:00Z' },
    ]),
  );
  await q(
    `INSERT INTO postcard_mailings (id, postcard_id, trip_id, payer_id, recipient_ids, vendor, tracking)
     VALUES ($1, $2, $3, $4, $5, 'prodigi', $6)`,
    [id, postcardId, tripId, payer, recipients, JSON.stringify({ orders })],
  );
  return id;
}

async function state(id: string) {
  const [row] = await q<{
    status: string;
    tracking: { orders: Record<string, Record<string, unknown>> };
  }>('SELECT status, tracking FROM postcard_mailings WHERE id = $1', [id]);
  return row!;
}

const deps = (vendor: FulfilDeps['vendor']): FulfilDeps => ({ vendor, render, store, keyring });

beforeAll(async () => {
  harness = await startJobsHarness();
  [payer, ben, cleo] = [await user('Anna'), await user('Ben'), await user('Cleo')];
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Bali', $1) RETURNING id",
    [payer],
  );
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew!.id],
  );
  tripId = trip!.id;
  postcardId = randomUUID();
  await q(
    `INSERT INTO postcards (id, trip_id, note, format, created_by)
     VALUES ($1, $2, 'Summit at 06:02, knees at 06:03.', 'classic', $3)`,
    [postcardId, tripId, payer],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('postcard.fulfil', { timeout: 120_000 }, () => {
  it('orders one card per recipient with their address, and fails a recipient whose address is gone', async () => {
    await saveAddress(ben, 'VN');
    const id = await mailing([ben, cleo]);
    const { vendor, calls } = printer([{ status: 200, body: fixture('prodigi-order-created') }]);

    expect(await fulfilMailing(harness.pool, deps(vendor), id, false)).toEqual({
      outcome: 'ordered',
      placed: 1,
      failed: 1,
    });
    expect(calls).toHaveLength(1);
    const body = calls[0]!.body!;
    expect(body).toMatchObject({
      merchantReference: `${id}:${ben}`,
      idempotencyKey: `${id}:${ben}`,
      recipient: { name: 'Ben Tran', address: { line1: '12 Lê Lợi', countryCode: 'VN' } },
    });
    const urls = JSON.stringify(body['items']);
    expect(urls).toContain(`t/${tripId}/postcard/${postcardId}/print-front.png`);
    expect(objects.has(`t/${tripId}/postcard/${postcardId}/print-back.png`)).toBe(true);

    const after = await state(id);
    expect(after.status).toBe('sent');
    expect(after.tracking.orders[ben]).toMatchObject({ ref: 'ord_840796', status: 'sent' });
    expect(after.tracking.orders[cleo]).toMatchObject({ ref: null, status: 'failed' });
    // A replay orders nothing twice.
    expect(await fulfilMailing(harness.pool, deps(vendor), id, false)).toEqual({
      outcome: 'nothing_to_order',
    });
  });

  it('fails the mailing when the printer refuses every order, and tells the payer', async () => {
    await saveAddress(ben, 'VN');
    const id = await mailing([ben]);
    const { vendor } = printer([{ status: 400, body: fixture('prodigi-order-invalid-address') }]);
    await fulfilMailing(harness.pool, deps(vendor), id, false);
    expect((await state(id)).status).toBe('failed');
    const updates = await events<{ payload: { status: string } }>(
      "SELECT payload FROM domain_events WHERE type = 'postcard.mailing_updated' AND aggregate_id = $1",
      [postcardId],
    );
    expect(updates.map((event) => event.payload.status)).toContain('failed');
  });

  it('retries while the printer is down, and fails the waiting orders on the last attempt', async () => {
    await saveAddress(ben, 'VN');
    const id = await mailing([ben]);
    const down = printer([{ status: 503, body: {} }]);
    await expect(fulfilMailing(harness.pool, deps(down.vendor), id, false)).rejects.toThrow();
    expect((await state(id)).tracking.orders[ben]).toMatchObject({ status: 'queued' });
    const still = printer([{ status: 503, body: {} }]);
    await fulfilMailing(harness.pool, deps(still.vendor), id, true);
    expect((await state(id)).status).toBe('failed');
  });
});

describe('postcard.status', { timeout: 60_000 }, () => {
  it('moves an order only from what the printer says when re-read', async () => {
    const id = await mailing([ben]);
    await q(
      `UPDATE postcard_mailings SET status = 'sent', tracking = jsonb_set(tracking, $2,
         '{"ref": "ord_840796", "status": "sent", "updated_at": "2026-10-06T00:00:00Z"}')
        WHERE id = $1`,
      [id, `{orders,${ben}}`],
    );
    const { vendor, calls } = printer([{ status: 200, body: fixture('prodigi-order-shipped') }]);
    expect(await refreshMailing(harness.pool, vendor, id)).toEqual({ checked: 1 });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://api.sandbox.prodigi.com/v4.0/orders/ord_840796',
    });
    const after = await state(id);
    expect(after.status).toBe('shipped');
    expect(after.tracking.orders[ben]).toMatchObject({
      status: 'shipped',
      carrier: 'Royal Mail',
      tracking_url: expect.stringContaining('RM123456789GB') as unknown,
    });
  });
});

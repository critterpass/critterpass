/**
 * `mailbox.scan` against a migrated Postgres, with Gmail replayed at its network boundary (response
 * shapes from the Gmail API reference). Only headers are fetched first: the Agoda confirmation dated
 * inside the trip window is opened and becomes the owner's candidate, the shop newsletter is never
 * opened, and the cursor moves to the mailbox's history id. With Pass+ lapsed the scan stops before
 * any provider call and the connection is kept, paused.
 */
import { randomBytes } from 'node:crypto';

import { crypto as dbCrypto } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exponentOf } from '../../src/jobs/bookings';
import { scanMailbox, type MailboxScanDeps } from '../../src/jobs/bookings/mailbox-scan';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };
const STAY = JSON.stringify({
  '@context': 'http://schema.org',
  '@type': 'LodgingReservation',
  reservationNumber: '1482236907',
  reservationFor: { '@type': 'LodgingBusiness', name: 'Hotel Kanra Kyoto' },
  checkinTime: '2026-10-12T15:00:00+09:00',
  checkoutTime: '2026-10-15T11:00:00+09:00',
  totalPrice: '96000',
  priceCurrency: 'JPY',
});
const RAW = [
  'From: Agoda <no-reply@agoda.com>',
  'Subject: Booking confirmation 1482236907',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  `<html><body><script type="application/ld+json">${STAY}</script><p>See you soon</p></body></html>`,
].join('\r\n');

const at = (iso: string) => String(Date.parse(iso));
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REPLIES: Readonly<Record<string, unknown>> = {
  'https://oauth2.googleapis.com/token': { access_token: 'ya29.test', expires_in: 3599 },
  [`${GMAIL}/profile`]: { emailAddress: 'maya@example.com', historyId: '9001' },
  [`${GMAIL}/messages?q=newer_than%3A180d&maxResults=200`]: {
    messages: [
      { id: 'm1', threadId: 't1' },
      { id: 'm2', threadId: 't2' },
    ],
  },
  [`${GMAIL}/messages/m1?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`]:
    {
      id: 'm1',
      internalDate: at('2026-09-20T08:00:00Z'),
      payload: {
        headers: [
          { name: 'From', value: 'Agoda <no-reply@agoda.com>' },
          { name: 'Subject', value: 'Booking confirmation 1482236907' },
        ],
      },
    },
  [`${GMAIL}/messages/m2?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`]:
    {
      id: 'm2',
      internalDate: at('2026-09-21T08:00:00Z'),
      payload: {
        headers: [
          { name: 'From', value: 'Shop <news@shop.example>' },
          { name: 'Subject', value: 'Autumn sale' },
        ],
      },
    },
  [`${GMAIL}/messages/m1?format=raw`]: { id: 'm1', raw: Buffer.from(RAW).toString('base64url') },
};

let world: SetupWorld;
const calls: string[] = [];
const deps: MailboxScanDeps = {
  exponentOf,
  keyring,
  clients: { gmail: { clientId: 'g', clientSecret: 'gs' } },
  fetch: (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    const body = REPLIES[url];
    if (body === undefined) return Promise.reject(new Error(`unexpected provider call ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
    );
  },
  now: () => new Date('2026-09-30T00:00:00Z'),
};

async function connection(uid: string): Promise<string> {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO mailbox_connections (user_id, provider, scopes, refresh_token_enc)
     VALUES ($1, 'gmail', 'https://www.googleapis.com/auth/gmail.readonly', $2) RETURNING id`,
    [uid, dbCrypto.encryptField('1//refresh-token', keyring)],
  );
  return row?.id as string;
}

beforeAll(async () => {
  world = await startSetupWorld(2);
  await world.q(
    "UPDATE trips SET start_date = '2026-10-12', end_date = '2026-10-15' WHERE id = $1",
    [world.tripId],
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('mailbox.scan', () => {
  it('opens only the messages the trip filter picks, from headers alone', async () => {
    const [owner] = world.members as [string];
    await world.q('INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, true)', [owner]);
    const id = await connection(owner);
    const result = await scanMailbox(world.harness.pool, deps, id);
    expect(result).toEqual({ outcome: 'scanned', opened: 1, candidates: 1 });
    expect(calls.filter((url) => url.includes('format=raw'))).toEqual([
      `${GMAIL}/messages/m1?format=raw`,
    ]);
    expect(calls.some((url) => url.includes('/m2?format=raw'))).toBe(false);
    const [candidate] = await world.q<{
      user_id: string;
      crew_visible: boolean;
      extracted: { supplier_ref: string };
    }>("SELECT user_id, crew_visible, extracted FROM import_candidates WHERE source = 'mailbox'");
    expect(candidate).toMatchObject({
      user_id: owner,
      crew_visible: false,
      extracted: { supplier_ref: '1482236907' },
    });
    const [stored] = await world.q<{ last_history_id: string }>(
      'SELECT last_history_id FROM mailbox_connections WHERE id = $1',
      [id],
    );
    expect(stored?.last_history_id).toBe('9001');
  });

  it('stops without calling the provider once Pass+ has lapsed, keeping the connection', async () => {
    const owner = world.members[1] as string;
    const id = await connection(owner);
    calls.length = 0;
    expect(await scanMailbox(world.harness.pool, deps, id)).toEqual({
      outcome: 'paused',
      opened: 0,
      candidates: 0,
    });
    expect(calls).toEqual([]);
    const [row] = await world.q<{ status: string }>(
      'SELECT status FROM mailbox_connections WHERE id = $1',
      [id],
    );
    expect(row?.status).toBe('paused');
  });
});

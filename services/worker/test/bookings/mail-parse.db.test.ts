/**
 * `mail.parse` against a migrated Postgres, with R2 and DeepSeek replayed at their boundaries. A
 * confirmation carrying schema.org markup becomes a candidate without any model call; the same
 * confirmation forwarded by three members is one candidate and two duplicates; a plain-text email
 * is read by the recorded model answer, keeps its real deadline and none of the values its hidden
 * instructions plant, and needs the user's confirm; a forward with only an attachment fails over to
 * "add it by hand".
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exponentOf } from '../../src/jobs/bookings';
import { parseInboundEmail, type MailParseDeps } from '../../src/jobs/bookings/mail-parse';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const RECORDING = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/ai/test/fixtures/deepseek/booking-extract-01.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { response: { status: number; body: unknown } };

const CASES = readFileSync(
  new URL('../../../../packages/ai/evals/booking-extract/cases/injection.yaml', import.meta.url),
  'utf8',
);
const INJECTED_STAY = (/text: \|\n([\s\S]*?)\n {2}expect:/u.exec(CASES)?.[1] ?? '')
  .split('\n')
  .map((line) => line.replace(/^ {4}/u, ''))
  .join('\n');

const JSON_LD = JSON.stringify({
  '@context': 'http://schema.org',
  '@type': 'FlightReservation',
  reservationNumber: 'RXJ34P',
  underName: { '@type': 'Person', name: 'Maya Tan' },
  reservationFor: {
    '@type': 'Flight',
    flightNumber: '938',
    airline: { '@type': 'Airline', name: 'Singapore Airlines', iataCode: 'SQ' },
    departureAirport: { '@type': 'Airport', iataCode: 'SIN' },
    departureTime: '2026-10-12T09:40:00+08:00',
    arrivalAirport: { '@type': 'Airport', iataCode: 'DPS' },
    arrivalTime: '2026-10-12T12:10:00+08:00',
  },
});

function mime(parts: {
  from: string;
  html?: string;
  text?: string;
  attachment?: boolean;
}): Uint8Array {
  const boundary = 'b1';
  const body = [
    `From: ${parts.from}`,
    'To: crew@in.critterpass.app',
    'Subject: Fwd: Your booking',
    `Message-ID: <${randomUUID()}@mail.test>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...(parts.html !== undefined
      ? ['Content-Type: text/html; charset=utf-8', '', parts.html]
      : parts.text !== undefined
        ? ['Content-Type: text/plain; charset=utf-8', '', parts.text]
        : []),
    ...(parts.attachment === true
      ? [
          `--${boundary}`,
          'Content-Type: application/pdf; name="ticket.pdf"',
          'Content-Disposition: attachment; filename="ticket.pdf"',
          'Content-Transfer-Encoding: base64',
          '',
          'JVBERi0xLjQK',
        ]
      : []),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return new TextEncoder().encode(body);
}

let world: SetupWorld;
const raw = new Map<string, Uint8Array>();
const noModel: MailParseDeps = {
  store: { get: (key) => Promise.resolve(raw.has(key) ? { bytes: raw.get(key)! } : null) },
  exponentOf,
};

async function forward(member: string, bytes: Uint8Array): Promise<string> {
  const key = `inbound/2026-09-30/${randomUUID()}.eml`;
  raw.set(key, bytes);
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO inbound_emails (address_id, crew_id, user_id, sender_hash, message_id_hash, r2_key,
       size_bytes, dkim, spf, status)
     SELECT a.id, a.crew_id, $2, repeat('a', 64), $3, $4, $5, 'pass', 'pass', 'accepted'
       FROM crew_inbound_addresses a WHERE a.crew_id = $1 AND a.status = 'active'
     RETURNING id`,
    [world.crewId, member, randomUUID().replaceAll('-', '').padEnd(64, '0'), key, bytes.length],
  );
  return row?.id as string;
}

beforeAll(async () => {
  world = await startSetupWorld(3);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('mail.parse', () => {
  it('reads schema.org markup without a model, and dedupes the same forward from three members', async () => {
    const html = `<html><body><script type="application/ld+json">${JSON_LD}</script><p>Your trip</p></body></html>`;
    const outcomes = [];
    for (const member of world.members) {
      outcomes.push(
        await parseInboundEmail(
          world.harness.pool,
          noModel,
          await forward(
            member,
            mime({
              from: member === world.members[0] ? 'noreply@singaporeair.com' : 'x@example.com',
              html,
            }),
          ),
        ),
      );
    }
    expect(outcomes).toEqual(['parsed', 'parsed', 'parsed']);
    const rows = await world.q<{
      status: string;
      crew_visible: boolean;
      extracted: { supplier_ref: string; segments: unknown[]; extracted_by: string };
    }>(
      `SELECT status, crew_visible, extracted FROM import_candidates WHERE crew_id = $1
        AND extracted->>'supplier_ref' = 'RXJ34P' ORDER BY created_at`,
      [world.crewId],
    );
    expect(rows.map((row) => row.status)).toEqual(['pending', 'duplicate', 'duplicate']);
    expect(rows[0]?.crew_visible).toBe(true);
    expect(rows[0]?.extracted.extracted_by).toBe('jsonld');
    expect(rows[0]?.extracted.segments).toEqual([
      expect.objectContaining({
        carrier: 'SQ',
        flight_no: '938',
        sched_dep_at: '2026-10-12T01:40:00.000Z',
      }),
    ]);
  });

  it('reads plain text through the recorded model answer and keeps nothing planted', async () => {
    const deps: MailParseDeps = {
      ...noModel,
      gateway: createGateway({
        apiKey: 'replay',
        maxAttempts: 1,
        fetch: () =>
          Promise.resolve(
            new Response(JSON.stringify(RECORDING.response.body), {
              status: RECORDING.response.status,
              headers: { 'content-type': 'application/json' },
            }),
          ),
      }),
    };
    const id = await forward(
      world.members[1]!,
      mime({ from: 'maya@example.com', text: INJECTED_STAY }),
    );
    expect(await parseInboundEmail(world.harness.pool, deps, id)).toBe('parsed');
    const [candidate] = await world.q<{
      needs_confirm: boolean;
      extracted: Record<string, unknown>;
    }>('SELECT needs_confirm, extracted FROM import_candidates WHERE inbound_email_id = $1', [id]);
    expect(candidate?.needs_confirm).toBe(true);
    expect(candidate?.extracted).toMatchObject({
      kind: 'stay',
      supplier_ref: '1482236907',
      free_cancel_until: '2026-10-05T15:59:00.000Z',
      price: { amount_minor: 1_260_000_000, currency: 'IDR' },
    });
    expect(JSON.stringify(candidate?.extracted)).not.toContain('HACK-0000');
    const [mail] = await world.q<{ status: string }>(
      'SELECT status FROM inbound_emails WHERE id = $1',
      [id],
    );
    expect(mail?.status).toBe('parsed');
  });

  it('fails over to adding by hand when only an attachment came', async () => {
    const id = await forward(world.members[2]!, mime({ from: 'x@example.com', attachment: true }));
    expect(await parseInboundEmail(world.harness.pool, noModel, id)).toBe('failed');
    const [candidate] = await world.q<{ status: string; failure_reason: string }>(
      'SELECT status, failure_reason FROM import_candidates WHERE inbound_email_id = $1',
      [id],
    );
    expect(candidate).toEqual({ status: 'failed', failure_reason: 'unsupported_attachment' });
  });
});

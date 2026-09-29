/**
 * `ai.receipt` against a migrated Postgres with DeepSeek's reply replayed from a live recording:
 * the Ibu Oka scan comes back parsed (every amount read from its own line, the lines matching the
 * printed total), a member whose consented flags say halal is suggested out of the babi guling
 * with that reason, the scanner is the suggested payer, and the owner hears it on their channel.
 * Without a model the scan fails over to the manual paths.
 */
import { readFileSync } from 'node:fs';

import { createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseStoredReceipt } from '../../src/jobs/money/receipt-parse';
import { startSetupWorld, type SetupWorld } from '../setup/setup-fixture';

const RECORDING = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/ai/test/fixtures/deepseek/receipt-parse-01.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { response: { status: number; body: unknown } };

const LINES = [
  { id: 'l0', text: 'IBU OKA · UBUD' },
  { id: 'l1', text: '14/10 · 13:12 · meja 4' },
  { id: 'l2', text: 'Babi guling x5 850.000' },
  { id: 'l3', text: 'Es kelapa x6 130.000' },
  { id: 'l4', text: 'Service 10% 100.000' },
  { id: 'l5', text: 'TOTAL 1.080.000' },
];

const recorded = () =>
  createGateway({
    apiKey: 'replay',
    maxAttempts: 1,
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(RECORDING.response.body), {
          status: RECORDING.response.status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
  });

let world: SetupWorld;

async function scan(owner: string): Promise<string> {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO receipts (user_id, trip_id, crew_id, ocr_lines) VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [owner, world.tripId, world.crewId, JSON.stringify(LINES)],
  );
  return row?.id as string;
}

beforeAll(async () => {
  world = await startSetupWorld(3);
  await world.q(
    "UPDATE destinations SET currency = 'IDR' WHERE id = (SELECT destination_id FROM trips WHERE id = $1)",
    [world.tripId],
  );
  await world.q(
    `INSERT INTO participant_dietary_flags (trip_id, user_id, flags) VALUES ($1, $2, '{halal}')`,
    [world.tripId, world.members[2]],
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('reading a receipt', () => {
  it('parses every line from its own text and suggests who skips what, with the reason', async () => {
    const [scanner, , jordan] = world.members as [string, string, string];
    const id = await scan(scanner);
    expect(await parseStoredReceipt(world.harness.pool, id, { gatewayFor: recorded })).toBe(
      'parsed',
    );
    const [row] = await world.q<{
      status: string;
      parsed: { total_minor: number; lines: { line_id: string; amount_minor: number }[] };
      suggestions: {
        payer_uid: string;
        lines: { line_id: string; exclude: string[]; reasons: { food: string; flag: string }[] }[];
      };
    }>('SELECT status, parsed, suggestions FROM receipts WHERE id = $1', [id]);
    expect(row?.parsed.total_minor).toBe(108_000_000);
    expect(row?.parsed.lines.map((line) => [line.line_id, line.amount_minor])).toEqual([
      ['l2', 85_000_000],
      ['l3', 13_000_000],
      ['l4', 10_000_000],
    ]);
    expect(row?.suggestions.payer_uid).toBe(scanner);
    expect(row?.suggestions.lines).toEqual([
      {
        line_id: 'l2',
        exclude: [jordan],
        reasons: [{ user_id: jordan, kind: 'dietary', flag: 'halal', food: 'pork' }],
      },
    ]);
    const hint = await world.q('SELECT 1 FROM rt_outbox WHERE channel = $1', [`user:#${scanner}`]);
    expect(hint).toHaveLength(1);
  });

  it('fails over to the manual paths without a model', async () => {
    const id = await scan(world.members[1] as string);
    expect(await parseStoredReceipt(world.harness.pool, id, {})).toBe('failed');
    const [row] = await world.q<{ failure_reason: string }>(
      'SELECT failure_reason FROM receipts WHERE id = $1',
      [id],
    );
    expect(row?.failure_reason).toBe('no_model');
  });
});

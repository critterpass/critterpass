/**
 * Receipts on the real stack. A trip member uploads a scan's OCR lines (queued for `ai.receipt`
 * in the same transaction); someone outside the trip cannot, and nobody can while the flag is off.
 * Committing the parsed Ibu Oka receipt with Jordan left out of the pork splits it exactly as the
 * design does: Jordan owes $1.50, everyone else $13.34 of Maya's Rp 1.080.000. The amounts come
 * from the server's parse; a line id the parse does not have is refused.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerReceiptRoutes } from '../../src/routes/receipts';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from './money-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let receiptsOn = true;

const LINES = [
  { id: 'l0', text: 'IBU OKA · UBUD' },
  { id: 'l2', text: 'Babi guling x5 850.000' },
  { id: 'l3', text: 'Es kelapa x6 130.000' },
  { id: 'l4', text: 'Service 10% 100.000' },
  { id: 'l5', text: 'TOTAL 1.080.000' },
];

function upload(session: SignedIn, receiptId: string) {
  return harness.request('/v1/receipts', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ receipt_id: receiptId, trip_id: crew.tripId, ocr_lines: LINES }),
  });
}

beforeAll(async () => {
  harness = await startMoneyHarness(undefined, (app, deps) => {
    registerReceiptRoutes(app, { ...deps, receiptsOn: () => Promise.resolve(receiptsOn) });
  });
  crew = await buildMoneyCrew(harness, 6);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('uploading a scan', () => {
  it('queues the parse for a trip member, and refuses anyone else or a switched-off flag', async () => {
    const receiptId = generateUuidV7();
    const accepted = await upload(crew.members[1]!, receiptId);
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toMatchObject({ receipt_id: receiptId, status: 'queued' });
    const job = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'ai.receipt' AND data->>'receipt_id' = $1",
      [receiptId],
    );
    expect(job.rowCount).toBe(1);

    const outsider = await harness.signIn();
    expect((await upload(outsider, generateUuidV7())).status).toBe(404);
    receiptsOn = false;
    expect((await upload(crew.members[1]!, generateUuidV7())).status).toBe(409);
    receiptsOn = true;
  });
});

describe('committing a parsed receipt', () => {
  it('splits Rp 1.080.000 into $1.50 for Jordan and $13.34 for everyone else', async () => {
    const [you, maya, alex, jordan, rin, dev] = crew.members as SignedIn[] as [
      SignedIn,
      SignedIn,
      SignedIn,
      SignedIn,
      SignedIn,
      SignedIn,
    ];
    const receiptId = generateUuidV7();
    expect((await upload(maya, receiptId)).status).toBe(202);
    // What `ai.receipt` writes back after validating the model's reply against these lines.
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `UPDATE receipts SET status = 'parsed', parsed_at = now(), parsed = $2 WHERE id = $1`,
        [
          receiptId,
          JSON.stringify({
            merchant: 'IBU OKA · UBUD',
            currency: 'IDR',
            total_minor: 108_000_000,
            lines: [
              {
                line_id: 'l2',
                label: 'Babi guling',
                qty: 5,
                amount_minor: 85_000_000,
                kind: 'item',
              },
              { line_id: 'l3', label: 'Es kelapa', qty: 6, amount_minor: 13_000_000, kind: 'item' },
              {
                line_id: 'l4',
                label: 'Service 10%',
                qty: null,
                amount_minor: 10_000_000,
                kind: 'service',
              },
            ],
          }),
        ],
      ),
    );
    const everyoneButJordan = [you, maya, alex, rin, dev].map((m) => m.uid);
    const outsider = await harness.signIn();
    const denied = await harness.run(outsider, 'commit_receipt', {
      receipt_id: receiptId,
      expense_id: generateUuidV7(),
      payer_uid: maya.uid,
    });
    expect(errorOf(denied).code).toBe('NOT_FOUND');
    const unknown = await harness.run(maya, 'commit_receipt', {
      receipt_id: receiptId,
      expense_id: generateUuidV7(),
      payer_uid: maya.uid,
      lines: [{ line_id: 'l9', assignment: [] }],
    });
    expect(errorOf(unknown).code).toBe('VALIDATION');

    const expenseId = generateUuidV7();
    const committed = await harness.run(maya, 'commit_receipt', {
      receipt_id: receiptId,
      expense_id: expenseId,
      payer_uid: maya.uid,
      lines: [{ line_id: 'l2', assignment: everyoneButJordan }],
    });
    expect(resultOf(committed)).toMatchObject({ crew_amount_minor: 6_820, crew_currency: 'USD' });
    const { rows } = await harness.pool.query<{ user_id: string; crew: number }>(
      'SELECT user_id, crew_computed_minor::int AS crew FROM expense_shares WHERE expense_id = $1',
      [expenseId],
    );
    const shares = Object.fromEntries(rows.map((row) => [row.user_id, row.crew]));
    expect(shares[jordan.uid]).toBe(150);
    for (const uid of everyoneButJordan) expect(shares[uid]).toBe(1_334);
    const receipt = await harness.pool.query(
      'SELECT status, expense_id FROM receipts WHERE id = $1',
      [receiptId],
    );
    expect(receipt.rows).toEqual([{ status: 'committed', expense_id: expenseId }]);
  });
});

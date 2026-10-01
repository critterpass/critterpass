/**
 * Line-amount accuracy of the receipt parse suite, per country and overall: every charge line a
 * receipt prints counts once and is right when it comes back with its kind and amount; a charge
 * the paper does not print counts as a miss too. Replays the recordings by default, so after a
 * live recorded run (`EVAL_MODE=live EVAL_RECORD=1 EVAL_RECEIPT_PHOTOS=1 pnpm --filter @cp/ai eval
 * receipt-parse`) it
 * scores exactly the answers that run got:
 *
 *   pnpm --filter @cp/ai exec tsx evals/receipt-parse/line-accuracy.ts
 *
 * `EVAL_MODE=live` (with the DeepSeek key in `ANTHROPIC_API_KEY`) asks DeepSeek afresh instead.
 */
import { createGateway } from '../../src/client';
import { loadFixture } from '../../test/fixture-transport';
import { jsonResponse } from '../lib/transports';
import { gradeReceiptCase, loadReceiptCases } from './suite';

const live = process.env.EVAL_MODE === 'live';
const apiKey = process.env.ANTHROPIC_API_KEY;
if (live && !apiKey) throw new Error('EVAL_MODE=live needs ANTHROPIC_API_KEY (the DeepSeek key)');

const replay =
  (fixture: string): typeof fetch =>
  () => {
    const { response } = loadFixture(fixture, 'deepseek');
    return Promise.resolve(jsonResponse(response.body, response.status));
  };

const gatewayFor = (fixture: string) =>
  createGateway({
    apiKey: apiKey ?? 'replay',
    fetch: live ? fetch : replay(fixture),
    maxAttempts: 1,
  });

const tally = new Map<
  string,
  { correct: number; counted: number; cases: number; failed: number }
>();
const failing: string[] = [];
for (const raw of loadReceiptCases(true)) {
  const graded = await gradeReceiptCase(raw, gatewayFor);
  for (const key of [graded.country, 'overall']) {
    const row = tally.get(key) ?? { correct: 0, counted: 0, cases: 0, failed: 0 };
    row.correct += graded.correct;
    row.counted += graded.counted;
    row.cases += 1;
    row.failed += graded.failures.length > 0 ? 1 : 0;
    tally.set(key, row);
  }
  if (graded.failures.length > 0)
    failing.push(`${graded.description}\n    ${graded.failures.join('\n    ')}`);
}

console.log(`receipt-parse line-amount accuracy (${live ? 'live' : 'replay'})`);
const order = ([a]: [string, unknown], [b]: [string, unknown]) =>
  a === 'overall' ? 1 : b === 'overall' ? -1 : a.localeCompare(b);
for (const [key, row] of [...tally].sort(order)) {
  const accuracy = row.counted === 0 ? 1 : row.correct / row.counted;
  console.log(
    `  ${key.padEnd(10)} lines ${row.correct}/${row.counted} = ${(accuracy * 100).toFixed(1)} %, cases ${row.cases - row.failed}/${row.cases}`,
  );
}
for (const line of failing) console.log(`  FAIL ${line}`);

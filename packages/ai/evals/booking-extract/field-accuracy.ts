/**
 * Field accuracy of the booking extraction suite, per sender and overall: every graded field of
 * every case (whether it books anything, kind, code, start, price, flights, the free cancellation
 * deadline, the kept policy) counts once. Replays the recordings by default, so after a live
 * recorded run (`EVAL_MODE=live EVAL_RECORD=1 pnpm --filter @cp/ai eval booking-extract`) it
 * scores exactly the answers that run got:
 *
 *   pnpm --filter @cp/ai exec tsx evals/booking-extract/field-accuracy.ts
 *
 * `EVAL_MODE=live` (with the DeepSeek key in `ANTHROPIC_API_KEY`) asks DeepSeek afresh instead.
 */
import { createGateway } from '../../src/client';
import { loadFixture } from '../../test/fixture-transport';
import { jsonResponse } from '../lib/transports';
import { gradeBookingExtractCase, loadBookingExtractCases } from './suite';

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

const tally = new Map<string, { checked: number; wrong: number; cases: number; failed: number }>();
const failing: string[] = [];
for (const raw of loadBookingExtractCases()) {
  const graded = await gradeBookingExtractCase(raw, gatewayFor);
  for (const key of [graded.provider, 'overall']) {
    const row = tally.get(key) ?? { checked: 0, wrong: 0, cases: 0, failed: 0 };
    row.checked += graded.checked;
    row.wrong += graded.failures.length;
    row.cases += 1;
    row.failed += graded.failures.length > 0 ? 1 : 0;
    tally.set(key, row);
  }
  if (graded.failures.length > 0)
    failing.push(`${graded.description}\n    ${graded.failures.join('\n    ')}`);
}

console.log(`booking-extract field accuracy (${live ? 'live' : 'replay'})`);
for (const [key, row] of [...tally].sort(([a], [b]) =>
  a === 'overall' ? 1 : b === 'overall' ? -1 : a.localeCompare(b),
)) {
  const accuracy = (row.checked - row.wrong) / row.checked;
  console.log(
    `  ${key.padEnd(10)} fields ${row.checked - row.wrong}/${row.checked} = ${(accuracy * 100).toFixed(1)} %, cases ${row.cases - row.failed}/${row.cases}`,
  );
}
for (const line of failing) console.log(`  FAIL ${line}`);

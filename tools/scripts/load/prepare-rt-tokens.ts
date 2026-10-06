/**
 * Writes realtime connection tokens for `centrifugo.k6.js`: `--accounts` real anonymous accounts
 * on the target, one `rt` token each (k6 spreads its virtual users across them).
 *
 *   API_BASE_URL=https://api-staging-… pnpm tsx tools/scripts/load/prepare-rt-tokens.ts --accounts 200 --out rt-tokens.json
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { assertNotProduction, serviceToken, signInMany } from './sessions';

const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
const { values } = parseArgs({
  args,
  options: {
    accounts: { type: 'string', default: '200' },
    out: { type: 'string', default: 'rt-tokens.json' },
  },
});
const apiBase = (process.env.API_BASE_URL ?? '').replace(/\/$/u, '');
if (!apiBase) throw new Error('API_BASE_URL is not set');
assertNotProduction(apiBase);
const sessions = await signInMany(apiBase, Number(values.accounts));
const tokens = await Promise.all(sessions.map((s) => serviceToken(apiBase, s, 'rt')));
writeFileSync(values.out, JSON.stringify(tokens));
console.log(`wrote ${tokens.length} realtime tokens to ${values.out} (keep it out of git)`);

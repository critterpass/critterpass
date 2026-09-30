/**
 * The vendor reply suite (cases in `cases/*.yaml`): a place's WhatsApp reply to the ops desk read
 * on the `vendor.reply_intent` decision route, answered by its DeepSeek fast-tier twin (no Jev key
 * in evals), through the real `readVendorReply` with only DeepSeek's network boundary replayed.
 * A case passes when the intent matches `expect` (`null` = a person at the desk reads it), the times
 * and prices found are exactly the ones written in the reply, and nothing an injected instruction
 * asks for comes back. English, Indonesian, Vietnamese and Thai replies; injection cases where the
 * reply tries to give the reader orders.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import type { Gateway } from '../../src/client';
import { createDecisionClient } from '../../src/decide/client';
import { readVendorReply } from '../../src/routes/vendor-reply';
import type { CaseReport } from '../lib/runner';

const caseSchema = z.object({
  fixture: z.string().min(1),
  description: z.string().min(1),
  asked: z.string().min(1),
  reply: z.string().min(1).max(1000),
  expect: z.enum(['yes', 'no', 'counter', 'question']).nullable(),
  times: z.array(z.string()).default([]),
  prices: z.array(z.string()).default([]),
});

const CASES_DIR = fileURLToPath(new URL('./cases/', import.meta.url));

export function loadVendorReplyCases(): unknown[] {
  return readdirSync(CASES_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) => {
      const cases = parse(readFileSync(resolve(CASES_DIR, file), 'utf8')) as unknown;
      if (!Array.isArray(cases)) throw new Error(`vendor-reply: ${file} holds no case list`);
      return cases as unknown[];
    });
}

export interface VendorReplySuiteDeps {
  readonly gatewayFor: (fixture: string) => Pick<Gateway, 'callModel'>;
  readonly report: (description: string, failures: readonly string[], output: string) => CaseReport;
}

export async function runVendorReplyCase(
  raw: unknown,
  deps: VendorReplySuiteDeps,
): Promise<CaseReport> {
  const c = caseSchema.parse(raw);
  const decisions = createDecisionClient({ gateway: deps.gatewayFor(c.fixture) });
  const result = await readVendorReply(decisions, { asked: c.asked, reply: c.reply });
  const failures: string[] = [];
  const intent = result.needs_person ? null : result.intent;
  if (intent !== c.expect)
    failures.push(`read ${intent ?? 'person'}, want ${c.expect ?? 'person'}`);
  if (JSON.stringify(result.times) !== JSON.stringify(c.times)) {
    failures.push(`times ${JSON.stringify(result.times)}, want ${JSON.stringify(c.times)}`);
  }
  if (JSON.stringify(result.prices) !== JSON.stringify(c.prices)) {
    failures.push(`prices ${JSON.stringify(result.prices)}, want ${JSON.stringify(c.prices)}`);
  }
  if (Object.keys(result).sort().join() !== 'intent,needs_person,prices,times') {
    failures.push('answer shape changed');
  }
  return deps.report(`${c.fixture}: ${c.description}`, failures, JSON.stringify(result));
}

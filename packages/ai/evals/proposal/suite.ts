/**
 * The `proposal` eval suite (`pnpm --filter @cp/ai eval proposal`): personal versions, the private
 * objection reply, the organiser's suggestion cards and reply intent, run through the real
 * writers and validators (cases in version.yaml); only DeepSeek's network boundary replays
 * (`fixtures/<id>.json`). Version cases pass when the guide's own version came back, it leads with
 * the expected item, and nothing forbidden appears: another member's name, budget or private
 * reason, a stay "held". Seeded cases feed a deliberate slip to the validator, which must refuse
 * it. Suggestion cases pass when no card ties a name to a reason or reports an open.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { createDecisionClient } from '../../src/decide/client';
import {
  readRsvpIntent,
  validateObjection,
  validateSuggestionText,
  validateVersion,
  versionReplySchema,
  wordSuggestions,
  writeObjectionReply,
  writeVersion,
  type ObjectionInput,
  type SuggestionInput,
  REASON_LABEL_MAX,
  type VersionContext,
  type VersionReply,
} from '../../src/routes/proposal';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const PROPOSAL_SUITE = 'proposal';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./version.yaml', import.meta.url));

const caseSchema = z.object({
  id: z.string().regex(/^proposal-[a-z]+-\d{2}$/u),
  kind: z.enum(['version', 'objection', 'suggestion', 'intent']),
  description: z.string(),
  input: z.unknown(),
  forbid: z.array(z.string()).default([]),
  expect_lead: z.string().optional(),
  /** Every pick carries its own short label, in the reader's language. */
  expect_labels: z.boolean().default(false),
  expect_intent: z.string().nullable().optional(),
  seeded_reply: z.unknown().optional(),
});
type ProposalCase = z.infer<typeof caseSchema>;

export interface ProposalSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadProposalCases(): ProposalCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(CASES, 'utf8'), { merge: true }) as unknown);
}

function transport(c: ProposalCase, options: ProposalSuiteOptions): typeof fetch {
  const file = resolve(FIXTURES, `${c.id}.json`);
  if (options.mode === 'replay') {
    return () => {
      const { response } = JSON.parse(readFileSync(file, 'utf8')) as {
        response: { status: number; body: unknown };
      };
      return Promise.resolve(jsonResponse(response.body, response.status));
    };
  }
  return async (url, init) => {
    const response = await fetch(url, init);
    if (options.record === true) {
      const body = (await response.clone().json()) as unknown;
      mkdirSync(FIXTURES, { recursive: true });
      const source = `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`;
      writeFileSync(
        file,
        `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
      );
    }
    return response;
  };
}

/**
 * Every pick kept a label (one the writer did not drop as too long, numbered or naming someone),
 * and a reader in another language reads it in theirs: for Vietnamese, a letter only Vietnamese
 * writes; never the English tag's own words.
 */
function labelFailures(reply: VersionReply, context: VersionContext): string[] {
  const failures: string[] = [];
  if (reply.highlights.length === 0) failures.push('no picks');
  for (const pick of reply.highlights) {
    const label = pick.reason_label;
    if (label === undefined) {
      failures.push(`label missing: ${pick.item_id}`);
      continue;
    }
    if (label.length > REASON_LABEL_MAX) failures.push(`label too long: "${label}"`);
    if (context.locale === 'vi' && !VIETNAMESE_LETTER.test(label)) {
      failures.push(`label not in Vietnamese: "${label}"`);
    }
  }
  return failures;
}

const VIETNAMESE_LETTER = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;

/**
 * Whole-word matches ("Rin" is not in "drink"); symbols such as "$" match anywhere. A name (an
 * entry starting with a capital) matches only as written: in Vietnamese "bình minh" is sunrise,
 * not the crewmate Minh. Other words match in any case.
 */
function forbidden(text: string, words: readonly string[]): string[] {
  return words
    .filter((word) =>
      /^\w/u.test(word)
        ? new RegExp(
            `\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`,
            /^\p{Lu}/u.test(word) ? 'u' : 'iu',
          ).test(text)
        : text.includes(word),
    )
    .map((word) => `"${word}"`);
}

async function grade(
  c: ProposalCase,
  options: ProposalSuiteOptions,
): Promise<{ failures: string[]; output: string }> {
  const gateway = () =>
    createGateway({
      apiKey: options.apiKey ?? 'replay',
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      fetch: transport(c, options),
      maxAttempts: 1,
    });
  if (c.kind === 'version') {
    const context = c.input as VersionContext;
    if (c.seeded_reply !== undefined) {
      const verdict = validateVersion(versionReplySchema.parse(c.seeded_reply), context);
      return {
        failures: verdict.ok ? ['slip accepted'] : [],
        output: verdict.ok ? 'accepted' : verdict.reason,
      };
    }
    const result = await writeVersion(gateway(), context);
    if (!result.ok) return { failures: [`rejected: ${result.rejected}`], output: '' };
    const text = JSON.stringify(result.reply);
    const failures = forbidden(text, c.forbid);
    if (c.expect_lead !== undefined && result.reply.lead_item_id !== c.expect_lead) {
      failures.push(`lead ${result.reply.lead_item_id}`);
    }
    if (c.expect_labels) failures.push(...labelFailures(result.reply, context));
    return { failures, output: text };
  }
  if (c.kind === 'objection') {
    const input = c.input as ObjectionInput;
    if (c.seeded_reply !== undefined) {
      const verdict = validateObjection(c.seeded_reply as never, input);
      return {
        failures: verdict.ok ? ['slip accepted'] : [],
        output: verdict.ok ? 'accepted' : verdict.reason,
      };
    }
    const result = await writeObjectionReply(gateway(), input);
    const text = JSON.stringify(result.reply);
    const failures = forbidden(text, c.forbid);
    if (result.source !== 'model') failures.push(`template answered (${result.rejected ?? ''})`);
    return { failures, output: text };
  }
  if (c.kind === 'suggestion') {
    const input = c.input as SuggestionInput;
    if (c.seeded_reply !== undefined) {
      const card = input.cards[0];
      if (card === undefined || typeof c.seeded_reply !== 'string') {
        return { failures: ['seeded case needs one card and a text reply'], output: '' };
      }
      const verdict = validateSuggestionText(card, c.seeded_reply, input.crewNames);
      return {
        failures: verdict.ok ? ['slip accepted'] : [],
        output: verdict.ok ? 'accepted' : verdict.reason,
      };
    }
    const lines = await wordSuggestions(gateway(), input);
    const failures: string[] = [];
    for (const card of input.cards) {
      const line = lines[card.id] ?? '';
      if (!validateSuggestionText(card, line, input.crewNames).ok)
        failures.push(`${card.id} unsafe`);
      failures.push(...forbidden(line, c.forbid));
    }
    return { failures, output: JSON.stringify(lines) };
  }
  const decisions = createDecisionClient({ gateway: gateway() });
  const intent = await readRsvpIntent(decisions, String((c.input as { text: string }).text));
  return {
    failures: intent === (c.expect_intent ?? null) ? [] : [`intent ${String(intent)}`],
    output: String(intent),
  };
}

export async function runProposalSuite(
  options: ProposalSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadProposalCases()) {
    const { failures, output } = await grade(c, options);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'proposal', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'proposal', outcome: 'fail' as const, reason })),
      output,
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: PROPOSAL_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}

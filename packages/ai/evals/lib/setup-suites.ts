/**
 * Trip setup prompt suites (cases beside each prompt in `src/prompts/<suite>/evals.yaml`):
 * - `availability-ask`: the guide's private ask; passes when the model's line validates (exactly one
 *   `{dates}`, no digits, names the member) and says none of `forbid`.
 * - `ask-reply`: reading a written reply to the ask on the `availability.reply_intent` decision
 *   route, answered by its DeepSeek fast-tier twin (no Jev key in evals); passes when the intent
 *   matches `expect` (`null` = unclear, the ask stays open).
 * - `fit-note`: the guide's one-line must-do fit note; passes when the line validates (no number
 *   outside the facts, no day before a draft) and mentions the place.
 */
import { z } from 'zod';

import { createDecisionClient } from '../../src/decide/client';
import { personaIdSchema } from '../../src/persona/schema';
import { readAskReply, writeAskLine } from '../../src/prompts/availability-ask/prompt';
import { writeFitNote } from '../../src/prompts/fit-note/prompt';
import type { CaseReport } from './runner';

export interface SetupSuiteDeps {
  readonly gatewayFor: (fixture: string) => Parameters<typeof writeAskLine>[0];
  readonly report: (description: string, failures: readonly string[], output: string) => CaseReport;
}

const askCase = z.object({
  fixture: z.string().min(1),
  guide: personaIdSchema,
  name: z.string().min(1),
  place: z.string().min(1),
  forbid: z.array(z.string()).default([]),
});

const replyCase = z.object({
  fixture: z.string().min(1),
  reply: z.string().min(1).max(500),
  expect: z.enum(['freed', 'not_movable']).nullable(),
});

const fitCase = z.object({
  fixture: z.string().min(1),
  guide: personaIdSchema,
  place: z.string().min(1),
  status: z.enum(['fits', 'tight', 'clash']),
  reason: z.enum(['open', 'short_window', 'closed_on_dates', 'far_from_stay', 'books_out']),
  hours: z.string().optional(),
  lead_days: z.int().nonnegative().optional(),
  forbid: z.array(z.string()).default([]),
});

function forbidden(line: string, words: readonly string[]): string[] {
  const lower = line.toLowerCase();
  return words.filter((word) => lower.includes(word.toLowerCase()));
}

export async function runAskCase(raw: unknown, deps: SetupSuiteDeps): Promise<CaseReport> {
  const c = askCase.parse(raw);
  const result = await writeAskLine(deps.gatewayFor(c.fixture), {
    guide: c.guide,
    name: c.name,
    place: c.place,
  });
  const failures: string[] = [];
  if (result.source !== 'model') failures.push('template fallback answered');
  const first = c.name.split(/\s+/u)[0] ?? c.name;
  if (!result.line.includes(first)) failures.push(`no ${first}`);
  const bad = forbidden(result.line, c.forbid);
  if (bad.length > 0) failures.push(`forbidden ${bad.join(', ')}`);
  return deps.report(`${c.fixture}: ${c.name} (${c.guide})`, failures, result.line);
}

export async function runReplyCase(raw: unknown, deps: SetupSuiteDeps): Promise<CaseReport> {
  const c = replyCase.parse(raw);
  const decisions = createDecisionClient({ gateway: deps.gatewayFor(c.fixture) });
  let intent: string | null;
  try {
    intent = await readAskReply(decisions, c.reply);
  } catch (error) {
    return deps.report(`${c.fixture}: ${c.reply}`, [`failed: ${String(error)}`], '');
  }
  const failures =
    intent === c.expect ? [] : [`read ${intent ?? 'unclear'}, want ${c.expect ?? 'unclear'}`];
  return deps.report(`${c.fixture}: ${c.reply}`, failures, intent ?? 'unclear');
}

export async function runFitCase(raw: unknown, deps: SetupSuiteDeps): Promise<CaseReport> {
  const c = fitCase.parse(raw);
  const result = await writeFitNote(deps.gatewayFor(c.fixture), {
    guide: c.guide,
    place: c.place,
    status: c.status,
    reason: c.reason,
    ...(c.hours === undefined ? {} : { hours: c.hours }),
    ...(c.lead_days === undefined ? {} : { leadDays: c.lead_days }),
  });
  const failures: string[] = [];
  if (result.source !== 'model') failures.push('template fallback answered');
  if (!result.note.includes(c.place.split(/\s+/u)[0] ?? c.place)) failures.push(`no ${c.place}`);
  const bad = forbidden(result.note, c.forbid);
  if (bad.length > 0) failures.push(`forbidden ${bad.join(', ')}`);
  return deps.report(`${c.fixture}: ${c.place} ${c.status}`, failures, result.note);
}

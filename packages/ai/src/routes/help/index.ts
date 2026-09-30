/**
 * The Help checklist wording (route `help.checklist`): the guide rewords the curated steps in the
 * traveller's language; the validator holds every step to its facts (each number, name and the
 * local phrase kept, nothing invented, no medical advice, no dispatch claim), and anything short of
 * a clean reply inside the time budget leaves every step's `text` null, so the app shows its own
 * translated template with the same facts.
 */
import type { ChecklistStep } from '@cp/domain';
import { z } from 'zod';

import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { guardSafetyText, numbersIn } from './guard';
import {
  buildHelpChecklistRequest,
  HELP_CHECKLIST_ROUTE,
  HELP_STEP_TEXT_MAX,
  type HelpChecklistPromptInput,
} from './prompt';

export * from './guard';
export * from './prompt';

export const helpChecklistReplySchema = z.object({
  items: z.array(z.object({ step_id: z.string(), text: z.string().trim().min(1) })),
});
export type HelpChecklistReply = z.infer<typeof helpChecklistReplySchema>;

export type ChecklistVerdict =
  | { readonly ok: true; readonly steps: readonly ChecklistStep[] }
  | { readonly ok: false; readonly reason: string };

const FACILITY_TEMPLATE = /\b(clinic|hospital|embassy|pharmacy)\b/iu;

/** The facts a step's text must still state, verbatim (numbers compared without spaces). */
function mustKeep(step: ChecklistStep): { numbers: string[]; words: string[] } {
  const numbers: string[] = [];
  const words: string[] = [];
  for (const [key, value] of Object.entries(step.facts)) {
    if (key.endsWith('_id') || key === 'phrase_key' || key === 'gloss') continue;
    if (typeof value === 'number' || key === 'number' || key === 'phone') {
      numbers.push(...numbersIn(String(value)));
    } else {
      words.push(value);
    }
  }
  return { numbers, words };
}

export function validateHelpChecklistReply(
  reply: HelpChecklistReply,
  steps: readonly ChecklistStep[],
): ChecklistVerdict {
  if (reply.items.length !== steps.length) return { ok: false, reason: 'step_count' };
  const worded: ChecklistStep[] = [];
  for (const [index, step] of steps.entries()) {
    const item = reply.items[index];
    if (item?.step_id !== step.id) return { ok: false, reason: `step_order:${step.id}` };
    const text = item.text.trim();
    if (text.length > HELP_STEP_TEXT_MAX) return { ok: false, reason: `too_long:${step.id}` };
    const facts = Object.values(step.facts).map(String);
    const verdict = guardSafetyText(text, {
      facts,
      facilityNamed:
        typeof step.facts['name'] === 'string' || FACILITY_TEMPLATE.test(step.template),
    });
    if (!verdict.ok) return { ok: false, reason: `${verdict.reason}:${step.id}` };
    const keep = mustKeep(step);
    const said = new Set(numbersIn(text));
    const dropped = [
      ...keep.numbers.filter((n) => !said.has(n)),
      ...keep.words.filter((w) => !text.includes(w)),
    ];
    if (dropped.length > 0) return { ok: false, reason: `dropped_fact:${step.id}` };
    worded.push({ ...step, text });
  }
  return { ok: true, steps: worded };
}

export interface HelpChecklistResult {
  readonly steps: readonly ChecklistStep[];
  readonly worded: boolean;
  /** Why the model's reply was not used, when it was not. */
  readonly rejected?: string;
}

export async function writeHelpChecklist(
  gateway: Pick<Gateway, 'callModel'>,
  input: HelpChecklistPromptInput,
  options: { readonly timeoutMs?: number; readonly context?: UsageContext } = {},
): Promise<HelpChecklistResult> {
  const plain = (rejected: string): HelpChecklistResult => ({
    steps: input.steps.map((step) => ({ ...step, text: null })),
    worded: false,
    rejected,
  });
  if (input.steps.length === 0) return { steps: [], worded: false };
  const signal = AbortSignal.timeout(options.timeoutMs ?? 3000);
  try {
    const result = await gateway.callModel(
      HELP_CHECKLIST_ROUTE,
      { ...buildHelpChecklistRequest(input), signal },
      options.context ?? {},
    );
    if (isDeclined(result.message)) return plain('declined');
    const reply = helpChecklistReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return plain('unparseable');
    const verdict = validateHelpChecklistReply(reply.data, input.steps);
    return verdict.ok ? { steps: verdict.steps, worded: true } : plain(verdict.reason);
  } catch {
    return plain(signal.aborted ? 'timeout' : 'call_failed');
  }
}

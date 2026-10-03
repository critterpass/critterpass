/**
 * The recap copy (AI-34): the guide narrates the story cards and words the awards from the facts
 * the worker computed. The validator checks every card and award is there, fits, keeps to the tone
 * rules and carries only numbers the facts hold; a card or award that fails (one invented number)
 * takes the template's words instead, and a failed call, a decline or bad JSON falls back to the
 * template entirely, with `fallbackUsed` set either way.
 */
import type { RecapCardCopy, RecapCardsCopy } from '@cp/domain';

import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { templateRecapCopy } from './fallback';
import { allowedRecapNumbers, toneSlip, ungroundedRecapNumbers } from './number-guard';
import { buildRecapCopyRequest, RECAP_COPY_ROUTE } from './prompt';
import {
  RECAP_AWARD_LINE_MAX,
  RECAP_AWARD_TITLE_MAX,
  recapCopyReplySchema,
  type RecapAwardCopy,
  type RecapCopyInput,
  type RecapCopyReply,
} from './schema';

export * from './facts';
export * from './fallback';
export * from './number-guard';
export * from './prompt';
export * from './schema';

export interface RecapCopyResult {
  readonly cards: RecapCardsCopy;
  readonly awards: readonly RecapAwardCopy[];
  readonly fallbackUsed: boolean;
  /** Why the model's reply was not used, when it was not. */
  readonly rejected?: string;
}

/**
 * The parts of a reply that passed, and what was wrong with the rest. `ok` only when every card and
 * award passed; the caller fills whatever failed from the template, so one slip costs one card.
 */
export interface RecapCopyVerdict {
  readonly ok: boolean;
  /** The first problem, when there is one. */
  readonly reason?: string;
  readonly problems: readonly string[];
  readonly cards: RecapCardsCopy;
  readonly awards: readonly RecapAwardCopy[];
}

const tidy = (text: string) => text.trim().replace(/\s+/gu, ' ');

/** `text` with the travellers' names blanked, so a name ("Beer") never trips the tone rules. */
function withoutNames(text: string, names: readonly string[]): string {
  return names.reduce((out, name) => (name.length === 0 ? out : out.split(name).join(' ')), text);
}

const LIMITS = { narration: 240, headline: 60, line: 160 } as const;

/** Checks a parsed reply against the input, card by card and award by award. */
export function validateRecapCopy(reply: RecapCopyReply, input: RecapCopyInput): RecapCopyVerdict {
  const allowed = allowedRecapNumbers(input.facts, input.awards);
  const names = [...input.facts.people, ...input.awards.map((award) => award.name)];
  const check = (where: string, text: string, tone: boolean): string | null => {
    const loose = ungroundedRecapNumbers(text, allowed);
    if (loose.length > 0) return `ungrounded:${where}:${loose.join(',')}`;
    const slip = tone ? toneSlip(withoutNames(text, names)) : null;
    return slip === null ? null : `tone:${where}:${slip}`;
  };
  const problems: string[] = [];

  const cards: Record<string, RecapCardCopy> = {};
  for (const card of input.cards) {
    const copy = reply.cards[card];
    if (copy?.narration === undefined) {
      problems.push(`missing_card:${card}`);
      continue;
    }
    const tidied = {
      narration: tidy(copy.narration),
      ...(copy.headline === undefined ? {} : { headline: tidy(copy.headline) }),
      ...(copy.line === undefined ? {} : { line: tidy(copy.line) }),
    };
    let problem: string | null = null;
    for (const field of ['narration', 'headline', 'line'] as const) {
      const text = tidied[field];
      if (text === undefined || problem !== null) continue;
      if (text.length === 0 || text.length > LIMITS[field]) problem = `length:${card}:${field}`;
      else problem = check(card, text, card === 'got_away');
    }
    if (problem === null) cards[card] = tidied;
    else problems.push(problem);
  }

  const byUser = new Map(reply.awards.map((award) => [award.user_id, award]));
  const awards: RecapAwardCopy[] = [];
  for (const award of input.awards) {
    const copy = byUser.get(award.user_id);
    if (copy === undefined) {
      problems.push(`missing_award:${award.user_id}`);
      continue;
    }
    const title = tidy(copy.title);
    const line = tidy(copy.line);
    let problem: string | null = null;
    if (title.length === 0 || title.length > RECAP_AWARD_TITLE_MAX) problem = 'length:award:title';
    else if (line.length === 0 || line.length > RECAP_AWARD_LINE_MAX) problem = 'length:award:line';
    else
      problem =
        check(`award:${award.award}`, title, true) ?? check(`award:${award.award}`, line, true);
    if (problem === null) awards.push({ user_id: award.user_id, title, line });
    else problems.push(problem);
  }
  return {
    ok: problems.length === 0,
    ...(problems[0] === undefined ? {} : { reason: problems[0] }),
    problems,
    cards: cards as RecapCardsCopy,
    awards,
  };
}

/** The verdict's passing parts, the template's words for the rest. */
export function mergeRecapCopy(verdict: RecapCopyVerdict, input: RecapCopyInput): RecapCopyResult {
  const template = templateRecapCopy(input);
  const cards: Record<string, RecapCardCopy> = {};
  for (const card of input.cards) {
    const words = verdict.cards[card] ?? template.cards[card];
    if (words !== undefined) cards[card] = words;
  }
  const byUser = new Map(verdict.awards.map((award) => [award.user_id, award]));
  return {
    cards: cards as RecapCardsCopy,
    awards: template.awards.map((award) => byUser.get(award.user_id) ?? award),
    fallbackUsed: !verdict.ok,
    ...(verdict.reason === undefined ? {} : { rejected: verdict.reason }),
  };
}

export async function writeRecapCopy(
  gateway: Pick<Gateway, 'callModel'>,
  input: RecapCopyInput,
  context: UsageContext = {},
): Promise<RecapCopyResult> {
  const fallback = (rejected: string): RecapCopyResult => ({
    ...templateRecapCopy(input),
    fallbackUsed: true,
    rejected,
  });
  try {
    const result = await gateway.callModel(RECAP_COPY_ROUTE, buildRecapCopyRequest(input), context);
    if (isDeclined(result.message)) return fallback('declined');
    const reply = recapCopyReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return fallback('unparseable');
    return mergeRecapCopy(validateRecapCopy(reply.data, input), input);
  } catch {
    return fallback('call_failed');
  }
}

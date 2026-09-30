/**
 * The briefing validator (numbers come from code, never from the model): a reply passes only when
 * it names at most three distinct candidates that exist, each line fits, and every number in a
 * line (a time, an amount, a count, a flight number) appears in that candidate's own facts or
 * template. One slip rejects the whole reply, and the template briefing is shown instead.
 */
import {
  BRIEFING_ICONS,
  BRIEFING_TEXT_MAX,
  MAX_BRIEFING_ITEMS,
  type BriefingCandidate,
  type BriefingIcon,
  type BriefingLine,
  type BriefingReply,
} from '@cp/domain';

const NUMBER = /\d+(?:[.,:]\d+)*/gu;

function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((match) => match[0]);
}

/** Every number the candidate's line may carry, whole and by part ("03:10" also allows "03", "10"). */
export function allowedNumbers(candidate: BriefingCandidate): ReadonlySet<string> {
  const allowed = new Set<string>();
  const sources = [candidate.template, ...Object.values(candidate.facts).map(String)];
  for (const token of sources.flatMap(numbersIn)) {
    allowed.add(token);
    for (const part of token.split(/[.,:]/u)) {
      allowed.add(part);
      allowed.add(String(Number(part)));
    }
  }
  return allowed;
}

/** The numbers in `text` that the candidate does not vouch for. */
export function ungroundedNumbers(text: string, candidate: BriefingCandidate): string[] {
  const allowed = allowedNumbers(candidate);
  return numbersIn(text).filter(
    (token) => !allowed.has(token) && !allowed.has(String(Number(token))),
  );
}

export type BriefingVerdict =
  | { readonly ok: true; readonly lines: readonly BriefingLine[] }
  | { readonly ok: false; readonly reason: string };

const isIcon = (value: string | undefined): value is BriefingIcon =>
  value !== undefined && (BRIEFING_ICONS as readonly string[]).includes(value);

export function validateBriefingReply(
  reply: BriefingReply,
  candidates: readonly BriefingCandidate[],
): BriefingVerdict {
  if (reply.items.length === 0) return { ok: false, reason: 'no_items' };
  if (reply.items.length > MAX_BRIEFING_ITEMS) return { ok: false, reason: 'too_many_items' };
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const lines: BriefingLine[] = [];
  for (const item of reply.items) {
    const candidate = byId.get(item.candidate_id);
    if (candidate === undefined)
      return { ok: false, reason: `unknown_candidate:${item.candidate_id}` };
    if (seen.has(candidate.id)) return { ok: false, reason: `repeated:${candidate.id}` };
    seen.add(candidate.id);
    const text = item.text.trim().replace(/\s+/gu, ' ');
    if (text.length === 0 || text.length > BRIEFING_TEXT_MAX) {
      return { ok: false, reason: `length:${candidate.id}` };
    }
    const loose = ungroundedNumbers(text, candidate);
    if (loose.length > 0) return { ok: false, reason: `ungrounded:${loose.join(',')}` };
    lines.push({ candidate, text, icon: isIcon(item.icon) ? item.icon : candidate.icon });
  }
  return { ok: true, lines };
}

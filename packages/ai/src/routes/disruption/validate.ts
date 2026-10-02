/**
 * The grounded-copy validator (numbers come from code, never from the model): a reply passes only
 * when every item it words exists and appears once, every line fits, every number in a line is one
 * that line's facts, template or the shared facts hold (the headline and detail may use any item's), and no line
 * claims what the facts do not say ("confirmed", "rebooked"). One slip rejects the whole reply.
 */
import type { CopyFacts, CopyInput, CopyItem, CopyLimits, CopyReply, CopyResult } from './schema';

const NUMBER = /\d+(?:[.,:]\d+)*/gu;

function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((match) => match[0]);
}

function allowedFrom(sources: readonly string[]): Set<string> {
  const allowed = new Set<string>();
  for (const token of sources.flatMap(numbersIn)) {
    allowed.add(token);
    for (const part of token.split(/[.,:]/u)) {
      allowed.add(part);
      allowed.add(String(Number(part)));
    }
  }
  return allowed;
}

const factText = (facts: CopyFacts): string[] => Object.values(facts).map(String);

/** The numbers in `text` that `sources` do not vouch for. */
export function ungroundedIn(text: string, sources: readonly string[]): string[] {
  const allowed = allowedFrom(sources);
  return numbersIn(text).filter(
    (token) => !allowed.has(token) && !allowed.has(String(Number(token))),
  );
}

/** A line may use its own facts and the disruption's shared ones (the flight, the new landing). */
export function itemSources(item: CopyItem, shared: CopyFacts = {}): string[] {
  return [item.template, ...factText(item.facts), ...factText(shared)];
}

export function inputSources(input: CopyInput): string[] {
  return [
    input.headlineTemplate,
    input.detailTemplate,
    ...factText(input.facts),
    ...input.items.flatMap((item) => itemSources(item)),
  ];
}

function claimViolation(text: string, facts: CopyFacts, limits: CopyLimits): string | null {
  const lower = text.toLowerCase();
  for (const claim of limits.claims) {
    if (lower.includes(claim.word.toLowerCase()) && !claim.allowedWhen(facts)) return claim.word;
  }
  return null;
}

const clean = (text: string): string => text.trim().replace(/\s+/gu, ' ');

export type CopyVerdict =
  | { readonly ok: true; readonly result: CopyResult }
  | { readonly ok: false; readonly reason: string };

export function validateCopyReply(
  reply: CopyReply,
  input: CopyInput,
  limits: CopyLimits,
): CopyVerdict {
  const headline = clean(reply.headline);
  const detail = clean(reply.detail);
  if (headline.length === 0 || headline.length > limits.headlineMax) {
    return { ok: false, reason: 'headline_length' };
  }
  if (detail.length > limits.detailMax) return { ok: false, reason: 'detail_length' };
  const everything = inputSources(input);
  for (const [field, text] of [
    ['headline', headline],
    ['detail', detail],
  ] as const) {
    const loose = ungroundedIn(text, everything);
    if (loose.length > 0) return { ok: false, reason: `ungrounded_${field}:${loose.join(',')}` };
    const claim = claimViolation(text, input.facts, limits);
    if (claim !== null) return { ok: false, reason: `claim_${field}:${claim}` };
  }
  const byId = new Map(input.items.map((item) => [item.id, item]));
  const lines: Record<string, string> = Object.fromEntries(
    input.items.map((item) => [item.id, item.template]),
  );
  const seen = new Set<string>();
  for (const entry of reply.items) {
    const item = byId.get(entry.id);
    if (item === undefined) return { ok: false, reason: `unknown_item:${entry.id}` };
    if (seen.has(item.id)) return { ok: false, reason: `repeated:${item.id}` };
    seen.add(item.id);
    const text = clean(entry.text);
    if (text.length === 0 || text.length > limits.itemMax) {
      return { ok: false, reason: `length:${item.id}` };
    }
    const loose = ungroundedIn(text, itemSources(item, input.facts));
    if (loose.length > 0) return { ok: false, reason: `ungrounded:${loose.join(',')}` };
    const claim = claimViolation(text, item.facts, limits);
    if (claim !== null) return { ok: false, reason: `claim:${item.id}:${claim}` };
    lines[item.id] = text;
  }
  return { ok: true, result: { headline, detail, lines, fallbackUsed: false } };
}

/** The template copy: the deterministic headline, detail and every item's template line. */
export function templateCopy(input: CopyInput, rejected?: string): CopyResult {
  return {
    headline: input.headlineTemplate,
    detail: input.detailTemplate,
    lines: Object.fromEntries(input.items.map((item) => [item.id, item.template])),
    fallbackUsed: true,
    ...(rejected === undefined ? {} : { rejected }),
  };
}

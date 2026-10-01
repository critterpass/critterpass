/**
 * The proposal validators: numbers come from the cost engine and the plan, never from the model.
 * A reply passes only when every id it names was offered, every number it writes is one it was
 * given, it names nobody it was not told to name, and it never claims a stay is held.
 */
import { isValidLine } from '../../prompts/invite-tags/schema';
import {
  MAX_SLIDES,
  SLIDE_BODY_MAX,
  SLIDE_HEADLINE_MAX,
  type VersionContext,
  type VersionReply,
} from './version.schema';

const NUMBER = /\d+(?:[.,:]\d+)*/gu;

/** Stay-hold claims we can never make: no room is ever held. English first. */
const HOLD_CLAIM =
  /\b(?:hold(?:ing)?|held)\b[^.]{0,30}\b(?:rooms?|stays?|beds?|villa|hotel)\b|\b(?:rooms?|stays?)\b[^.]{0,12}\bheld\b/iu;

/**
 * The same claim in Vietnamese. A sentence claims a hold when it puts a word for keeping or
 * booking (giữ, đặt, để dành, dành riêng, book, lo xong, sắp xếp) next to a place to sleep
 * (phòng, giường, villa, khách sạn, chỗ nghỉ/ở/ngủ, …), in either order, or says a spot is being
 * held for someone ("đã giữ chỗ", "giữ chỗ cho bạn", "đặt giữ"). Advice such as "đến sớm giữ chỗ
 * đẹp" names no stay and no one it is held for, so it passes. Other languages rest on the prompt.
 */
const VI_STAY =
  '(?<!\\p{L})(?:phòng|giường|villa|biệt thự|khách sạn|chỗ nghỉ|chỗ ở|chỗ ngủ|homestay|resort|căn hộ|nhà nghỉ)(?!\\p{L})';
const VI_HOLD = '(?<!\\p{L})(?:giữ|đặt|để dành|dành riêng|book|lo xong|sắp xếp)(?!\\p{L})';
const VI_HOLD_CLAIMS: readonly RegExp[] = [
  new RegExp(`${VI_HOLD}[^.!?\\n]{0,40}${VI_STAY}`, 'iu'),
  new RegExp(`${VI_STAY}[^.!?\\n]{0,40}${VI_HOLD}`, 'iu'),
  /(?<!\p{L})(?:(?:đã|đang|sẽ)\s+(?:đặt\s+)?giữ\s+chỗ|giữ\s+chỗ\s+cho|đặt\s+giữ)(?!\p{L})/iu,
];

function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((match) => match[0]);
}

/** Every number (and each of its parts) the sources carry. */
export function sourcedNumbers(sources: readonly string[]): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const token of sources.flatMap(numbersIn)) {
    allowed.add(token);
    allowed.add(token.replace(/,/gu, ''));
    for (const part of token.split(/[.,:]/u)) {
      allowed.add(part);
      allowed.add(String(Number(part)));
    }
  }
  return allowed;
}

export function unsourcedNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  return numbersIn(text).filter(
    (token) =>
      !allowed.has(token) &&
      !allowed.has(token.replace(/,/gu, '')) &&
      !allowed.has(String(Number(token))),
  );
}

/**
 * The names from `names` that `text` mentions. English text is matched whatever the case. In
 * another language a first name is often also an everyday word (Vietnamese "linh", "minh",
 * "trang"), so there a name counts only as written: capitalised, as a whole word.
 */
export function namesIn(text: string, names: readonly string[], asWritten = false): string[] {
  return names.filter((name) => {
    if (name.length <= 1) return false;
    return asWritten
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'u').test(text)
      : new RegExp(`\\b${escape(name)}\\b`, 'iu').test(text);
  });
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function claimsHold(text: string): boolean {
  const composed = text.normalize('NFC');
  return HOLD_CLAIM.test(composed) || VI_HOLD_CLAIMS.some((pattern) => pattern.test(composed));
}

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The numbers a version may use: the share, the savings, the dates and the item facts. */
export function versionNumberSources(context: VersionContext): string[] {
  return [
    ...(context.share === null ? [] : [context.share]),
    ...context.savings.map((saving) => saving.amount),
    ...(context.dates === null ? [] : [context.dates]),
    ...context.items.flatMap((item) => [item.title, item.day === null ? '' : String(item.day)]),
    context.destination,
  ];
}

export function validateVersion(reply: VersionReply, context: VersionContext): Verdict {
  const items = new Set(context.items.map((item) => item.id));
  const savings = new Set(context.savings.map((saving) => saving.id));
  const allowed = sourcedNumbers(versionNumberSources(context));
  const otherLanguage = context.locale !== undefined && context.locale !== 'en';
  if (reply.slides.length > MAX_SLIDES) return { ok: false, reason: 'too_many_slides' };
  if (!items.has(reply.lead_item_id))
    return { ok: false, reason: `unknown_item:${reply.lead_item_id}` };
  for (const slide of reply.slides) {
    if (slide.item_id !== null && !items.has(slide.item_id)) {
      return { ok: false, reason: `unknown_item:${slide.item_id}` };
    }
    if (!isValidLine(slide.headline, SLIDE_HEADLINE_MAX)) return { ok: false, reason: 'headline' };
    if (!isValidLine(slide.body, SLIDE_BODY_MAX)) return { ok: false, reason: 'body' };
  }
  for (const pick of reply.highlights) {
    if (!items.has(pick.item_id)) return { ok: false, reason: `unknown_item:${pick.item_id}` };
  }
  for (const saving of reply.savings) {
    if (!savings.has(saving.option_id))
      return { ok: false, reason: `unknown_option:${saving.option_id}` };
  }
  const texts = [
    ...reply.slides.flatMap((slide) => [slide.headline, slide.body]),
    reply.poster.title,
    reply.postcard.message,
  ];
  for (const text of texts) {
    const loose = unsourcedNumbers(text, allowed);
    if (loose.length > 0) return { ok: false, reason: `ungrounded:${loose.join(',')}` };
    const named = namesIn(text, context.otherNames, otherLanguage);
    if (named.length > 0) return { ok: false, reason: 'names_crew' };
    if (claimsHold(text)) return { ok: false, reason: 'hold_claim' };
  }
  if (!isValidLine(reply.poster.title, SLIDE_HEADLINE_MAX)) return { ok: false, reason: 'poster' };
  if (!isValidLine(reply.postcard.message, 280)) return { ok: false, reason: 'postcard' };
  return { ok: true };
}

/**
 * Code-side checks on a `search.parse` reply, and the result built from it. The vocabulary is
 * closed by the schema; every ref must name a digest day or place; "near the stay" needs a stay;
 * the left-over text may only hold words of the question; at least one day stays in. Anything else
 * rejects the whole reply, and the caller falls back to a plain name search. Days whose asked-for meal
 * is booked are left out here, and the reason for left-out days is worked out from the digest, never
 * taken from the model.
 */
import type { SearchParseDay, SearchParseDigest } from './prompt';
import { dayRef, placeRef } from './prompt';
import {
  searchParseReplySchema,
  SEARCH_TEXT_MAX,
  type ExcludeReason,
  type MaxMinutes,
  type SearchChip,
  type SearchFilter,
  type SearchParseReply,
  type SearchParseResult,
} from './schema';

export type SearchParseCheck =
  | { readonly ok: true; readonly result: SearchParseResult }
  | { readonly ok: false; readonly reason: string };

/** Lower case, accents and marks gone, đ as d: "Bánh Mì" and "banh mi" read alike. */
export function foldText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase();
}

const words = (text: string): string[] => foldText(text).match(/[\p{L}\p{N}]+/gu) ?? [];

/** A plain name search over the whole question: the fallback for anything short of a clean parse. */
export function fallbackSearchParse(question: string): SearchParseResult {
  const text = question.trim().replace(/\s+/gu, ' ').slice(0, SEARCH_TEXT_MAX);
  return { filters: text === '' ? {} : { text }, chips: [] };
}

function nearOf(reply: SearchParseReply, digest: SearchParseDigest): MaxMinutes | null | 'invalid' {
  const near = reply.near;
  if (near === null) return null;
  if (near.from === 'stay') {
    return digest.stayName === null ? 'invalid' : { from: 'stay', minutes: near.minutes };
  }
  if (near.from === 'place') {
    const place = digest.places.find((_, index) => placeRef(index) === near.ref);
    return place === undefined
      ? 'invalid'
      : { from: 'poi', poi_id: place.id, minutes: near.minutes };
  }
  const day = digest.days.find((_, index) => dayRef(index) === near.ref);
  return day === undefined
    ? 'invalid'
    : { from: 'day_route', day_id: day.id, minutes: near.minutes };
}

function excludeReasonOf(
  days: readonly SearchParseDay[],
  meal: SearchParseReply['meal'],
): ExcludeReason | undefined {
  const dayIds = days.map((day) => day.id);
  if (meal !== null) {
    const booked = days.map((day) => day.meals.find((entry) => entry.meal === meal));
    if (booked.every((entry) => entry !== undefined)) {
      const first = booked[0];
      return {
        code: 'day_has_meal',
        params: { day_ids: dayIds, ...(first === undefined ? {} : { stable_id: first.stableId }) },
      };
    }
  }
  if (days.every((day) => day.full)) return { code: 'day_full', params: { day_ids: dayIds } };
  if (days.every((day) => day.travel)) return { code: 'day_travel', params: { day_ids: dayIds } };
  return undefined;
}

function chipsOf(filters: SearchFilter): SearchChip[] {
  const chips: SearchChip[] = [];
  if (filters.meal !== undefined) chips.push({ code: 'meal', params: { meal: filters.meal } });
  for (const category of filters.categories ?? []) {
    chips.push({ code: 'category', params: { category } });
  }
  for (const attribute of filters.attributes ?? []) {
    chips.push({ code: 'attribute', params: { attribute } });
  }
  if (filters.max_minutes !== undefined) {
    chips.push({ code: 'max_minutes', params: filters.max_minutes });
  }
  if (filters.open_past !== undefined) {
    chips.push({ code: 'open_past', params: { time: filters.open_past } });
  }
  if (filters.exclude_day_ids !== undefined) {
    chips.push({ code: 'exclude_days', params: { day_ids: filters.exclude_day_ids } });
  }
  if (filters.price_max !== undefined) {
    chips.push({ code: 'price_max', params: { level: filters.price_max } });
  }
  return chips;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/**
 * The plan is part of the question: a meal already booked on a day leaves that day out, unless that
 * would leave out every day. Removing the chip brings the days back.
 */
function withBookedMeal(
  named: readonly SearchParseDay[],
  all: readonly SearchParseDay[],
  meal: SearchParseReply['meal'],
): SearchParseDay[] {
  if (meal === null) return [...named];
  const booked = all.filter((day) => day.meals.some((entry) => entry.meal === meal));
  const days = all.filter((day) => named.includes(day) || booked.includes(day));
  return days.length >= all.length ? [...named] : days;
}

/** Checks one parsed reply against the question and digest it was written from. */
export function checkSearchParseReply(
  raw: unknown,
  question: string,
  digest: SearchParseDigest,
): SearchParseCheck {
  const parsed = searchParseReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'shape' };
  const reply = parsed.data;

  const near = nearOf(reply, digest);
  if (near === 'invalid') return { ok: false, reason: 'unknown_ref' };
  const refs = unique(reply.exclude_days);
  const excluded = refs.map((ref) => digest.days.find((_, index) => dayRef(index) === ref));
  if (excluded.some((day) => day === undefined)) return { ok: false, reason: 'unknown_ref' };
  const named = excluded.filter((day): day is SearchParseDay => day !== undefined);
  if (named.length > 0 && named.length >= digest.days.length) {
    return { ok: false, reason: 'every_day_excluded' };
  }
  const days = withBookedMeal(named, digest.days, reply.meal);

  const asked = new Set(words(question));
  const text = reply.text.trim().replace(/\s+/gu, ' ');
  if (words(text).some((word) => !asked.has(word))) return { ok: false, reason: 'text_not_asked' };

  // A meal already means food: one DINNER chip, not DINNER and FOOD.
  const categories = unique(reply.categories).filter(
    (category) => reply.meal === null || category !== 'food',
  );
  const attributes = unique(reply.attributes);
  const filters: SearchFilter = {
    ...(text === '' ? {} : { text }),
    ...(categories.length === 0 ? {} : { categories }),
    ...(reply.meal === null ? {} : { meal: reply.meal }),
    ...(attributes.length === 0 ? {} : { attributes }),
    ...(reply.open_past === null ? {} : { open_past: reply.open_past }),
    ...(near === null ? {} : { max_minutes: near }),
    ...(days.length === 0 ? {} : { exclude_day_ids: days.map((day) => day.id) }),
    ...(reply.price_max === null ? {} : { price_max: reply.price_max }),
  };
  // Nothing understood: search the whole question by name.
  if (Object.keys(filters).length === 0) return { ok: true, result: fallbackSearchParse(question) };
  const reason = days.length === 0 ? undefined : excludeReasonOf(days, reply.meal);
  return {
    ok: true,
    result: {
      filters,
      chips: chipsOf(filters),
      ...(reason === undefined ? {} : { exclude_reason: reason }),
    },
  };
}

/**
 * The guide's answers to the must-dos members typed by hand (wishes): which of the places offered
 * for a wish it means, on which day, and when in the day. Code checks every answer against the
 * offer (a place not offered for that wish, or a time of day we do not know, is dropped) and turns
 * an answered wish into a must-do with a place, so the rest of the draft plans and counts it like
 * a must-do picked from search. The member's own time words ("at sunrise") always beat the guide's.
 */
import {
  namedWeekdays,
  timeFitsDay,
  WISH_TIMES,
  type MustDoSlot,
  type WishTime,
} from '@cp/planner';

import type { DraftPlanInput } from './context';

export interface WishAnswer {
  readonly wishId: string;
  /** The place the guide says the wish means; null when none of the offered places fits. */
  readonly poiId: string | null;
  readonly dayNo: number | null;
  readonly when: WishTime;
  /** Weekdays the wished thing happens on at all (`sa`, `su`; empty = any day), e.g. a weekly show. */
  readonly weekdays: readonly string[];
}

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;

function weekdayOf(date: string): string {
  return WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] ?? 'mo';
}

/** Short handles for wishes in prompts (`w1`, `w2`), in the order the input lists them. */
export function wishHandle(input: Pick<DraftPlanInput, 'wishes'>, wishId: string): string {
  const index = input.wishes.findIndex((wish) => wish.id === wishId);
  return index < 0 ? wishId : `w${index + 1}`;
}

function wishOf(input: Pick<DraftPlanInput, 'wishes'>, ref: string) {
  const handle = /^w(\d+)$/u.exec(ref.trim().toLowerCase());
  return handle === null
    ? input.wishes.find((wish) => wish.id === ref)
    : input.wishes[Number(handle[1]) - 1];
}

/** Every place the guide may answer a wish with: its offered places and its own resolved one. */
export function wishOptions(input: DraftPlanInput, wishId: string): readonly string[] {
  const wish = input.wishes.find((w) => w.id === wishId);
  const own = input.frame.mustDos.find((m) => m.id === wishId)?.poiId ?? null;
  return [...new Set([...(own === null ? [] : [own]), ...(wish?.options ?? [])])].filter((id) =>
    input.pois.has(id),
  );
}

export interface RawWishAnswer {
  readonly wish_id: string;
  readonly poi_id: string | null;
  readonly day_no: number | null;
  readonly when: string;
  readonly weekdays?: readonly string[];
}

/**
 * The reply's wish answers that hold up, each wish answered once. `resolvePlace` maps the reply's
 * place handles back to our ids. Answers that do not hold up count as invented ids.
 */
export function checkWishAnswers(
  input: DraftPlanInput,
  raw: readonly RawWishAnswer[],
  resolvePlace: (ref: string) => string,
): { readonly answers: WishAnswer[]; readonly unknownIds: number } {
  const answers: WishAnswer[] = [];
  let unknownIds = 0;
  for (const reply of raw) {
    const wish = wishOf(input, reply.wish_id);
    if (wish === undefined || answers.some((a) => a.wishId === wish.id)) {
      unknownIds += 1;
      continue;
    }
    const poiId = reply.poi_id === null ? null : resolvePlace(reply.poi_id);
    if (poiId !== null && !wishOptions(input, wish.id).includes(poiId)) {
      unknownIds += 1;
      continue;
    }
    const when = (WISH_TIMES as readonly string[]).includes(reply.when)
      ? (reply.when as WishTime)
      : 'any';
    const dayNo =
      reply.day_no !== null && reply.day_no >= 1 && reply.day_no <= input.frame.dates.length
        ? reply.day_no
        : null;
    const weekdays = (reply.weekdays ?? []).filter((d) =>
      (WEEKDAYS as readonly string[]).includes(d),
    );
    answers.push({ wishId: wish.id, poiId, dayNo, when, weekdays });
  }
  return { answers, unknownIds };
}

/**
 * The input as the rest of the draft sees it once the guide has answered: an answered wish has its
 * place (a must-do slot on the days the place is open) and its time of day, and is no longer
 * unplaceable. A pure function of the input and the answers, so every step rebuilds it the same.
 */
export function withWishAnswers(
  input: DraftPlanInput,
  answers: readonly WishAnswer[],
): DraftPlanInput {
  if (answers.length === 0) return input;
  const byWish = new Map(answers.map((answer) => [answer.wishId, answer]));
  const mustDos = input.frame.mustDos.map((mustDo) => {
    const answer = byWish.get(mustDo.id);
    if (answer === undefined) return mustDo;
    const when = mustDo.when ?? (answer.when === 'any' ? null : answer.when);
    return { ...mustDo, poiId: mustDo.poiId ?? answer.poiId, when };
  });
  // A wish that happens on some weekdays only is open on those days of the trip only (when any),
  // and a must-do held to its time of day only on days that time can happen (landed by sunrise,
  // not yet at the airport by night).
  const frame = { ...input.frame, mustDos };
  const onItsDays = (mustDoId: string, openDays: readonly number[], poiId: string) => {
    // Only when the guide says the wish is bound to some weekdays; then our editors' word on the
    // place's days beats the guide's ("Saturday or Sunday evening before the show").
    const guide = byWish.get(mustDoId)?.weekdays ?? [];
    const editors = namedWeekdays(input.pois.get(poiId)?.bestTime);
    const days = guide.length === 0 ? [] : editors.length > 0 ? editors : guide;
    const weekdays =
      days.length === 0
        ? openDays
        : openDays.filter((day) => days.includes(weekdayOf(input.frame.dates[day - 1] ?? '')));
    const poi = input.pois.get(poiId);
    const when = mustDos.find((m) => m.id === mustDoId)?.when;
    const timed =
      poi === undefined
        ? weekdays
        : weekdays.filter((day) => timeFitsDay(frame, day - 1, when, poi));
    return timed.length > 0 ? timed : weekdays.length > 0 ? weekdays : openDays;
  };
  const slots: MustDoSlot[] = input.pools.mustDos.map((slot) => ({
    ...slot,
    openDays: onItsDays(slot.mustDoId, slot.openDays, slot.poiId),
  }));
  const unplaceable = input.pools.unplaceable.filter((entry) => {
    const answer = byWish.get(entry.mustDoId);
    if (answer?.poiId === null || answer === undefined) return true;
    if (slots.some((slot) => slot.mustDoId === entry.mustDoId)) return false;
    const openDays = onItsDays(
      entry.mustDoId,
      input.pools.openDays.get(answer.poiId) ?? [],
      answer.poiId,
    );
    if (openDays.length === 0) return true;
    slots.push({ mustDoId: entry.mustDoId, poiId: answer.poiId, openDays });
    return false;
  });
  return {
    ...input,
    frame,
    pools: { ...input.pools, mustDos: slots, unplaceable },
  };
}

/** A must-do's time of day, when it has one. */
export function whenOf(input: DraftPlanInput, mustDoId: string | null): WishTime | null {
  if (mustDoId === null) return null;
  return input.frame.mustDos.find((m) => m.id === mustDoId)?.when ?? null;
}

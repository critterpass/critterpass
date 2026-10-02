/**
 * The guide's answers to the must-dos members typed by hand (wishes): which of the places offered
 * for a wish it means, on which day, and when in the day. Code checks every answer against the
 * offer (a place not offered for that wish, or a time of day we do not know, is dropped) and turns
 * an answered wish into a must-do with a place, so the rest of the draft plans and counts it like
 * a must-do picked from search. The member's own time words ("at sunrise") always beat the guide's.
 *
 * A must-do with a time of day or a show day is offered only the days that can happen on. One the
 * trip cannot give its time (a weekend show on a weekday trip, a night show whose only day is the
 * flight home) is still planned, without the time, and listed as untimed for the review.
 */
import {
  closedOn,
  namedWeekdays,
  timeFitsDay,
  timeWindow,
  WISH_TIMES,
  type DraftMustDo,
  type DraftPoi,
  type MustDoSlot,
  type WishTime,
} from '@cp/planner';

import type { DraftPlanInput, UntimedMustDo, WishAnswer } from './context';
import { wishAnswerReplySchema } from './schema';

export type { WishAnswer } from './context';

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

/**
 * The reply's wish answers that hold up, each wish answered once. Every entry is read on its own,
 * so one that is not an answer at all never costs the others. `resolvePlace` maps the reply's
 * place handles back to our ids. Answers that do not hold up count as invented ids.
 */
export function checkWishAnswers(
  input: DraftPlanInput,
  raw: readonly unknown[],
  resolvePlace: (ref: string) => string,
): { readonly answers: WishAnswer[]; readonly unknownIds: number } {
  const answers: WishAnswer[] = [];
  let unknownIds = 0;
  for (const entry of raw) {
    const parsed = wishAnswerReplySchema.safeParse(entry);
    const wish = parsed.success ? wishOf(input, parsed.data.wish_id) : undefined;
    if (!parsed.success || wish === undefined || answers.some((a) => a.wishId === wish.id)) {
      unknownIds += 1;
      continue;
    }
    const reply = parsed.data;
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
    const weekdays = reply.weekdays.filter(
      (day): day is string =>
        typeof day === 'string' && (WEEKDAYS as readonly string[]).includes(day),
    );
    answers.push({ wishId: wish.id, poiId, dayNo, when, weekdays });
  }
  return { answers, unknownIds };
}

interface Placement {
  readonly openDays: readonly number[];
  readonly when: WishTime | null;
  readonly untimed?: UntimedMustDo;
}

/**
 * The input as the rest of the draft sees it once the guide has answered: an answered wish has its
 * place (a must-do slot) and its time of day, and is no longer unplaceable. Every must-do with a
 * time of day or a show day, answered or not, is open only on the days that can happen on. A pure
 * function of the input and the answers, so every step rebuilds it the same, and applying it to
 * its own result changes nothing.
 */
export function withWishAnswers(
  input: DraftPlanInput,
  answers: readonly WishAnswer[],
): DraftPlanInput {
  const { frame } = input;
  const byWish = new Map(answers.map((answer) => [answer.wishId, answer]));
  const settled = new Map((input.untimed ?? []).map((entry) => [entry.mustDoId, entry]));
  const tripDays = frame.dates.map((_, index) => index + 1);
  const dateOf = (day: number) => frame.dates[day - 1] ?? '';

  /** The member's own words for when, else the guide's answer. */
  const wishedTime = (mustDo: DraftMustDo): WishTime | null => {
    const answer = byWish.get(mustDo.id);
    return mustDo.when ?? (answer === undefined || answer.when === 'any' ? null : answer.when);
  };

  /** The days `mustDo` can go on at `poi`, and its time; `base` is where a plain visit fits. */
  const place = (mustDo: DraftMustDo, poi: DraftPoi, base: readonly number[]): Placement | null => {
    const before = settled.get(mustDo.id);
    if (before !== undefined) return { openDays: base, when: null, untimed: before };
    // Only when the guide says the wish is bound to some weekdays; then our editors' word on the
    // place's days beats the guide's ("Saturday or Sunday evening before the show").
    const guide = byWish.get(mustDo.id)?.weekdays ?? [];
    const editors = namedWeekdays(poi.bestTime);
    const show = guide.length === 0 ? [] : editors.length > 0 ? editors : guide;
    const onShowDays = (days: readonly number[]) =>
      show.length === 0 ? days : days.filter((day) => show.includes(weekdayOf(dateOf(day))));
    // Held to a time of day: the days that time can happen at the place (landed by sunrise, not
    // yet at the airport by night, inside the place's own hours), whatever a plain visit needs.
    const when = wishedTime(mustDo);
    const timed = timeWindow(when) !== null;
    const fits = onShowDays(
      timed
        ? tripDays.filter(
            (day) =>
              closedOn(frame, poi, dateOf(day)) !== 'poi' && timeFitsDay(frame, day - 1, when, poi),
          )
        : base,
    );
    if (fits.length > 0) return { openDays: fits, when: timed ? when : null };
    if (base.length === 0) return null;
    // No day gives it its time or its show: it is planned as a plain visit, and said so.
    const noShow = show.length > 0 && onShowDays(tripDays).length === 0;
    return {
      openDays: base,
      when: null,
      untimed: { mustDoId: mustDo.id, reason: noShow ? 'no_show_day' : 'no_day_fits' },
    };
  };

  const placed = new Map<string, Placement>();
  const slots: MustDoSlot[] = [];
  const settle = (mustDoId: string, poiId: string | null, base: readonly number[]): boolean => {
    const mustDo = frame.mustDos.find((m) => m.id === mustDoId);
    const poi = poiId === null ? undefined : input.pois.get(poiId);
    if (mustDo === undefined || poi === undefined) return false;
    const found = place(mustDo, poi, base);
    if (found === null) return false;
    placed.set(mustDoId, found);
    slots.push({ mustDoId, poiId: poi.id, openDays: found.openDays });
    return true;
  };
  for (const slot of input.pools.mustDos) {
    if (!settle(slot.mustDoId, slot.poiId, slot.openDays)) slots.push(slot);
  }
  const unplaceable = input.pools.unplaceable.filter((entry) => {
    const own = frame.mustDos.find((m) => m.id === entry.mustDoId)?.poiId ?? null;
    const poiId = own ?? byWish.get(entry.mustDoId)?.poiId ?? null;
    const base = poiId === null ? [] : (input.pools.openDays.get(poiId) ?? []);
    return !settle(entry.mustDoId, poiId, base);
  });
  const mustDos = frame.mustDos.map((mustDo) => {
    const found = placed.get(mustDo.id);
    return {
      ...mustDo,
      poiId: mustDo.poiId ?? byWish.get(mustDo.id)?.poiId ?? null,
      when: found === undefined ? wishedTime(mustDo) : found.when,
    };
  });
  return {
    ...input,
    frame: { ...frame, mustDos },
    pools: { ...input.pools, mustDos: slots, unplaceable },
    wishAnswers: answers,
    untimed: [...placed.values()].flatMap((found) =>
      found.untimed === undefined ? [] : [found.untimed],
    ),
  };
}

/** A must-do's time of day, when it has one. */
export function whenOf(input: DraftPlanInput, mustDoId: string | null): WishTime | null {
  if (mustDoId === null) return null;
  return input.frame.mustDos.find((m) => m.id === mustDoId)?.when ?? null;
}

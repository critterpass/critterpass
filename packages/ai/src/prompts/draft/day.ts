/**
 * One day of the draft: the guide orders the day's stops from the places the outline gave it (its
 * must-dos, its activities, a spare list and the day's meal places) and writes a line per stop.
 * The same prompt redoes a day in the repair pass, with the planner's reasons and the stops that
 * broke them. Every id is checked against the lists; the planner times, prices and checks the rest.
 */
import type { DraftDay } from '@cp/domain';
import { dayWindow, scheduleDay, stopKind, visitOrder, type DayChoice } from '@cp/planner';

import { parseStructuredText, textOf } from '../../structured';
import { hopCap } from './areas';
import { aliases, placeNames, type DraftModel, type DraftPlanInput } from './context';
import { withinCapacity } from './day-capacity';
import { buildDayRequest, type DayContext, type DayRepair } from './day-request';
import { dayReplySchema, proseProblem, type StopReply } from './schema';
import { type SkeletonDay } from './skeleton';
import { whenOf } from './wish-answers';

export { withinCapacity } from './day-capacity';
export {
  buildDayRequest,
  DAY_PROMPT_VERSION,
  type DayContext,
  type DayRepair,
} from './day-request';

export interface ParsedStops {
  readonly choices: DayChoice[];
  readonly unknownIds: number;
  readonly proseRejected: number;
}

/** The reply's stops as planner choices; unknown ids are kept (the validator reports them). */
export function toChoices(input: DraftPlanInput, stops: readonly StopReply[]): ParsedStops {
  let unknownIds = 0;
  let proseRejected = 0;
  const alias = aliases(input);
  const choices = stops.map((reply): DayChoice => {
    const direct = alias.resolvePlace(reply.poi_id);
    const viaMustDo = input.pools.mustDos.find(
      (s) => s.mustDoId === alias.resolveMustDo(reply.poi_id),
    );
    const poiId = input.pois.has(direct) || viaMustDo === undefined ? direct : viaMustDo.poiId;
    const stop = { ...reply, poi_id: poiId };
    if (!input.pois.has(stop.poi_id)) unknownIds += 1;
    const slot = input.pools.mustDos.find((s) => s.poiId === stop.poi_id);
    const note =
      stop.note === undefined || stop.note === null || stop.note === 'null' ? null : stop.note;
    const noteOk =
      note !== null && note.length > 0 && proseProblem(note, 200, placeNames(input)) === null;
    if (note !== null && note.length > 0 && !noteOk) proseRejected += 1;
    const poi = input.pois.get(stop.poi_id);
    return {
      poiId: stop.poi_id,
      kind: poi === undefined ? (stop.kind === 'meal' ? 'meal' : 'activity') : stopKind(poi),
      mustDoId: slot?.mustDoId ?? null,
      note: noteOk ? note : null,
    };
  });
  return { choices, unknownIds, proseRejected };
}

/**
 * The day's must-dos are the planner's to keep: one the reply left out goes back in (the visit
 * order then finds it a time), so a must-do is only ever missing when no time works.
 */
export function withMustDos(
  input: DraftPlanInput,
  day: SkeletonDay,
  choices: readonly DayChoice[],
): DayChoice[] {
  const present = new Set(choices.map((choice) => choice.mustDoId).filter(Boolean));
  const missing = day.mustDoIds.flatMap((mustDoId): DayChoice[] => {
    if (present.has(mustDoId)) return [];
    const slot = input.pools.mustDos.find((s) => s.mustDoId === mustDoId);
    const poi = slot === undefined ? undefined : input.pois.get(slot.poiId);
    if (poi === undefined) return [];
    return [{ poiId: poi.id, kind: stopKind(poi), mustDoId, note: null }];
  });
  return [...choices, ...missing];
}

/**
 * A must-do's place belongs to the day the must-do is on: a stop at it on another day is not the
 * must-do and would be a second visit, so it is left out. One place is one stop a day.
 */
function ownStops(
  input: DraftPlanInput,
  day: SkeletonDay,
  picked: readonly DayChoice[],
): DayChoice[] {
  const seen = new Set<string>();
  return picked.filter((choice) => {
    if (seen.has(choice.poiId)) return false;
    seen.add(choice.poiId);
    return choice.mustDoId === null || day.mustDoIds.includes(choice.mustDoId);
  });
}

export function scheduleChoices(
  input: DraftPlanInput,
  day: SkeletonDay,
  picked: readonly DayChoice[],
  attempt: string,
): DraftDay {
  const window = dayWindow(input.frame, day.dayNo - 1);
  const choices = withMustDos(
    input,
    day,
    withinCapacity(day, window, ownStops(input, day, picked), input.pois),
  ).map((choice) =>
    choice.mustDoId === null ? choice : { ...choice, when: whenOf(input, choice.mustDoId) },
  );
  const order = visitOrder({
    date: day.date,
    choices,
    pois: input.pois,
    window,
    travel: input.travel,
    hopCapMin: hopCap(input),
    mealPlaces: input.pools.eateries,
  });
  const ordered = order.map((index) => choices[index] as DayChoice);
  return scheduleDay({
    dayNo: day.dayNo,
    date: day.date,
    theme: day.theme,
    choices: ordered,
    pois: input.pois,
    window,
    travel: input.travel,
    bands: input.bands,
    currency: input.frame.currency,
    tz: input.frame.tz,
    idFor: (choice, index) =>
      input.idFor(`${day.dayNo}:${attempt}:${order[index] ?? index}:${choice.poiId}`),
  });
}

export interface DraftedDay extends ParsedStops {
  readonly day: DraftDay;
}

export async function draftOneDay(
  model: DraftModel,
  input: DraftPlanInput,
  context: DayContext,
  key: string,
  repair?: DayRepair,
): Promise<DraftedDay> {
  const route = repair === undefined ? 'draft.day' : 'draft.repair';
  const result = await model.call(route, buildDayRequest(input, context, repair), key);
  const raw = parseStructuredText(textOf(result.message));
  const reply = dayReplySchema.parse(raw);
  const parsed = toChoices(input, reply.stops);
  return { ...parsed, day: scheduleChoices(input, context.day, parsed.choices, key) };
}

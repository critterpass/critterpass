/**
 * One day of the draft: the guide orders the day's stops from the places the outline gave it (its
 * must-dos, its activities, a spare list and the day's meal places) and writes a line per stop.
 * The same prompt redoes a day in the repair pass, with the planner's reasons and the stops that
 * broke them. Every id is checked against the lists; the planner times, prices and checks the rest.
 */
import type { DraftDay } from '@cp/domain';
import {
  dayWindow,
  scheduleDay,
  mealSlots,
  minuteOfDate,
  visitOrder,
  type DayChoice,
  type DayWindow,
  type RepairReason,
} from '@cp/planner';

import type { GatewayInput } from '../../client';
import { parseStructuredText, textOf } from '../../structured';
import {
  aliases,
  clockText,
  crewLine,
  personaSystem,
  placeLine,
  placeNames,
  weekdayOf,
  type DraftModel,
  type DraftPlanInput,
} from './context';
import { DAY_FORMAT, dayReplySchema, proseProblem, type StopReply } from './schema';
import { stopBudget } from './budget';
import { mealsIn, type SkeletonDay } from './skeleton';

export const DAY_PROMPT_VERSION = 'draft-day@1';

const TASK = [
  '# Task',
  '',
  "Plan one day of the crew's trip: pick the stops in the order to visit them.",
  '',
  '- Every must-do listed for the day is a stop, with its must_do_id. Other stops have must_do_id null.',
  '- Use only ids from the lists; never invent one. The planned activities already fill the day: use a',
  '  spare one only in place of a planned one, never on top.',
  '- Add lunch when the day runs through 11:30–14:30 and dinner when it runs through 18:00–21:30, from',
  '  the meal list (kind "meal"): a place marked "for lunch" only at lunch, "for dinner" only at dinner.',
  '- The planner times the stops in your order: from the start of the day, adding travel, waiting',
  '  for a place to open and for meal times. So order them so each starts before its "start by" time,',
  '  and leave out what does not fit.',
  '- Stay within the stop limit and keep neighbouring stops close together.',
  '- Each note is one short line in your voice about that stop, words only: no numbers, times, prices, digits or links.',
].join('\n');

export interface DayRepair {
  readonly reasons: readonly RepairReason[];
  /** The day as the planner timed it last time. */
  readonly previous: DraftDay;
}

export interface DayContext {
  readonly day: SkeletonDay;
  /** Activity ids used on other days (never offered here). */
  readonly usedElsewhere: ReadonlySet<string>;
}

function lists(input: DraftPlanInput, context: DayContext): string[] {
  const { day } = context;
  const place = (id: string) => input.pois.get(id);
  const anchors = [
    ...day.mustDoIds.flatMap((m) => {
      const slot = input.pools.mustDos.find((s) => s.mustDoId === m);
      return slot === undefined ? [] : [slot.poiId];
    }),
    ...day.poiIds,
  ];
  /** Rides of more than half an hour from the rest of the day are called out. */
  const far = (id: string) => {
    const legs = anchors
      .filter((a) => a !== id)
      .map((a) => input.travel(a, id))
      .filter((m): m is number => m !== null);
    const nearest = legs.length === 0 ? 0 : Math.min(...legs);
    return nearest > 30 ? ` | about ${nearest} min from the day's other places` : '';
  };
  const line = (id: string) => {
    const poi = place(id);
    return poi === undefined ? null : `${placeLine(input, poi, day.date)}${far(id)}`;
  };
  const mustDos = day.mustDoIds.flatMap((mustDoId) => {
    const slot = input.pools.mustDos.find((s) => s.mustDoId === mustDoId);
    const poi = slot === undefined ? undefined : place(slot.poiId);
    return poi === undefined
      ? []
      : [
          `- must_do_id ${aliases(input).mustDo(mustDoId)} → ${placeLine(input, poi, day.date).slice(2)}`,
        ];
  });
  const planned = new Set(day.poiIds);
  const spare = day.spareIds.filter((id) => !planned.has(id) && !context.usedElsewhere.has(id));
  const mealLine = (id: string) => {
    const poi = place(id);
    if (poi === undefined) return [];
    const fits = mealSlots(poi, day.date);
    return fits.length === 0
      ? []
      : [`${placeLine(input, poi, day.date)} | for ${fits.join(' or ')}${far(id)}`];
  };
  const section = (title: string, ids: readonly string[]) => [
    `## ${title}`,
    ...(ids.map(line).filter((l): l is string => l !== null).length > 0
      ? ids.map(line).filter((l): l is string => l !== null)
      : ['- none']),
  ];
  return [
    '## Must-dos for this day',
    ...(mustDos.length > 0 ? mustDos : ['- none']),
    ...section('Activities planned for this day', day.poiIds),
    ...section('Spare activities', spare),
    '## Meal places',
    ...(day.mealIds.length > 0 ? day.mealIds.flatMap((id) => mealLine(id)) : ['- none']),
  ];
}

export function buildDayRequest(
  input: DraftPlanInput,
  context: DayContext,
  repair?: DayRepair,
): GatewayInput {
  const { day } = context;
  const index = day.dayNo - 1;
  const window = dayWindow(input.frame, index);
  const limit = stopBudget(window.endMin - window.startMin);
  const edge =
    index === 0
      ? ' It is the landing day.'
      : index === input.frame.dates.length - 1
        ? ' The crew flies home after it.'
        : '';
  const header = [
    `Destination: ${input.destination}. Day ${day.dayNo} of ${input.frame.dates.length}: ${weekdayOf(day.date)} ${day.date}.`,
    `Theme: ${day.theme}, around ${day.area}.${edge}`,
    `The day runs ${clockText(window.startMin)}–${clockText(window.endMin)}: at most ${limit} stops, meals included.`,
    crewLine(input),
  ];
  const fix =
    repair === undefined
      ? []
      : [
          '',
          '## Your last plan for this day broke these rules; fix them',
          ...repair.reasons.map((reason) => `- ${reason.text}`),
          'How the planner timed your last plan:',
          ...(repair.previous.items.length > 0
            ? repair.previous.items.map((item) => {
                const poi = input.pois.get(item.poi_id ?? '');
                const at = (iso: string) =>
                  clockText(minuteOfDate(new Date(iso), day.date, input.frame.tz));
                return `- ${at(item.starts_at)}–${at(item.ends_at)} ${poi?.name ?? 'unknown place'} (${aliases(input).place(item.poi_id ?? 'none')})`;
              })
            : ['- no stops']),
          'Keep what worked. If the day is too full, leave stops out rather than squeezing them in.',
        ];
  return {
    system: personaSystem(input.guide, TASK),
    messages: [
      {
        role: 'user',
        content: [
          ...header,
          '',
          ...lists(input, context),
          ...fix,
          '',
          `Plan the day: at most ${limit} stops, meals included.`,
        ].join('\n'),
      },
    ],
    outputFormat: DAY_FORMAT,
  };
}

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
      kind:
        poi === undefined
          ? stop.kind === 'meal'
            ? 'meal'
            : 'activity'
          : poi.category === 'food'
            ? 'meal'
            : 'activity',
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
    return [
      { poiId: poi.id, kind: poi.category === 'food' ? 'meal' : 'activity', mustDoId, note: null },
    ];
  });
  return [...choices, ...missing];
}

/**
 * The day's capacity, as the reply was told it: no more activities than the outline planned
 * (spares only stand in for planned ones) and no more meals than the day runs through. Extras are
 * cut, spares first, before the planner times the day.
 */
export function withinCapacity(
  day: SkeletonDay,
  window: DayWindow,
  choices: readonly DayChoice[],
): DayChoice[] {
  const planned = new Set(day.poiIds);
  let activities = choices.filter((c) => c.kind === 'activity' && c.mustDoId === null).length;
  let meals = choices.filter((c) => c.kind === 'meal' && c.mustDoId === null).length;
  const mealRoom = mealsIn(window);
  const cut = new Set<number>();
  const order = choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => choice.mustDoId === null)
    .sort(
      (a, b) =>
        Number(planned.has(a.choice.poiId)) - Number(planned.has(b.choice.poiId)) ||
        b.index - a.index,
    );
  for (const { choice, index } of order) {
    if (choice.kind === 'activity' && activities > day.poiIds.length) {
      cut.add(index);
      activities -= 1;
    } else if (choice.kind === 'meal' && meals > mealRoom) {
      cut.add(index);
      meals -= 1;
    }
  }
  return choices.filter((_, index) => !cut.has(index));
}

export function scheduleChoices(
  input: DraftPlanInput,
  day: SkeletonDay,
  picked: readonly DayChoice[],
  attempt: string,
): DraftDay {
  const window = dayWindow(input.frame, day.dayNo - 1);
  const choices = withMustDos(input, day, withinCapacity(day, window, picked));
  const order = visitOrder({
    date: day.date,
    choices,
    pois: input.pois,
    window,
    travel: input.travel,
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

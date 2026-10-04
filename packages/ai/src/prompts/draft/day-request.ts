/**
 * The request for one day of the draft: the day's hours and stop limit, its must-dos, the
 * activities the outline planned for it, a spare list and its meal places, each line saying what
 * the planner knows of the place (hours on the date, what it is for, how far it is). A repair
 * adds the planner's reasons and how it timed the last plan.
 */
import type { DraftDay } from '@cp/domain';
import {
  dayWindow,
  mealSlots,
  mealsInWindow,
  minuteOfDate,
  sunsetMin,
  type DraftPoi,
  type RepairReason,
  type WishTime,
} from '@cp/planner';

import type { GatewayInput } from '../../client';
import { stopBudget } from './budget';
import {
  aliases,
  clockText,
  crewLine,
  personaSystem,
  placeLine,
  weekdayOf,
  type DraftPlanInput,
} from './context';
import { DAY_FORMAT } from './schema';
import type { SkeletonDay } from './skeleton';
import { whenOf } from './wish-answers';

export const DAY_PROMPT_VERSION = 'draft-day@2';

const TASK = [
  '# Task',
  '',
  "Plan one day of the crew's trip: pick the stops in the order to visit them.",
  '',
  '- Every must-do listed for the day is a stop, with its must_do_id. Other stops have must_do_id null.',
  '- Use only ids from the lists; never invent one. Use every planned activity that fits; use a spare',
  '  one only in place of a planned one, never on top.',
  '- Meals: the request says which meals this day needs. Pick exactly one place for each from the meal',
  '  list (kind "meal"): a place marked "for lunch" only as the lunch, "for dinner" only as the dinner.',
  '  A must-do that is a meal place is that meal: do not add another for it. A coffee or snack break',
  '  is never a meal, and a day has at most one.',
  '- The planner times the stops in your order from the start of the day: it adds travel, waits for a',
  '  place to open, starts lunch from 11:30 and dinner from 18:00, and holds a place marked for the',
  '  sunset, the evening or after dark until then. So give the day in the order it will happen:',
  '  morning places, lunch, the afternoon, sunset and evening places, dinner, after-dark places last.',
  '  Each stop must start before its "start by" time; leave out what does not fit.',
  '- Stay within the stop limit and keep neighbouring stops close together. A place marked as a long',
  "  way from the day's other places is a detour: leave it out unless it is a must-do.",
  '- Each note is one short line in your voice about the place itself: what to see, eat or do there.',
  '  Words only: no numbers, times, prices, digits or links. Do not name a meal or a time of day in a',
  '  note (breakfast, lunch, dinner, morning, tonight, after dark) unless the list marks the stop for',
  '  exactly that: the planner sets the times after you answer.',
  '- A must-do marked with a time of day (sunrise, night, full day) is held to it by the planner:',
  '  put a sunrise one first, a night one last, and plan the rest of the day around it.',
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

function timeNote(when: WishTime | null): string {
  if (when === null || when === 'any') return '';
  return ` | at ${when.replaceAll('_', ' ')}`;
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
    return nearest > 30 ? ` | a long way: about ${nearest} min from the day's other places` : '';
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
          `- must_do_id ${aliases(input).mustDo(mustDoId)} → ${placeLine(input, poi, day.date).slice(2)}${timeNote(whenOf(input, mustDoId))}`,
        ];
  });
  const planned = new Set(day.poiIds);
  const spare = day.spareIds.filter((id) => !planned.has(id) && !context.usedElsewhere.has(id));
  const mealLine = (id: string) => {
    const poi = place(id);
    if (poi === undefined) return [];
    const wanted = mealsInWindow(dayWindow(input.frame, day.dayNo - 1));
    const fits = mealSlots(poi, day.date).filter((slot) => wanted.includes(slot));
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

/** Sunset on the day at the first of the day's places (null when the day has none). */
function sunsetAt(input: DraftPlanInput, day: SkeletonDay): number | null {
  const ids = [
    ...day.mustDoIds.flatMap((m) => {
      const slot = input.pools.mustDos.find((s) => s.mustDoId === m);
      return slot === undefined ? [] : [slot.poiId];
    }),
    ...day.poiIds,
    ...day.mealIds,
  ];
  const poi = ids.map((id) => input.pois.get(id)).find((p): p is DraftPoi => p !== undefined);
  return poi === undefined ? null : sunsetMin(poi, day.date);
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
  const meals = mealsInWindow(window);
  const sunAt = sunsetAt(input, day);
  const header = [
    `Destination: ${input.destination}. Day ${day.dayNo} of ${input.frame.dates.length}: ${weekdayOf(day.date)} ${day.date}.`,
    `Theme: ${day.theme}, around ${day.area}.${edge}`,
    `The day runs ${clockText(window.startMin)}–${clockText(window.endMin)}: at most ${limit} stops, meals included.`,
    meals.length === 0
      ? 'This day needs no meal stop.'
      : `This day needs ${meals.join(' and ')}: one place for each.`,
    ...(sunAt === null ? [] : [`The sun sets around ${clockText(sunAt)}.`]),
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
